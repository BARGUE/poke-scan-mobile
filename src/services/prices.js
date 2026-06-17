// Récupération des prix de cartes Pokémon, agrégés depuis plusieurs sources.
//
// On interroge en parallèle (via notre proxy Cloudflare Worker, voir proxy/) :
//   - pokemontcg.io  : TCGplayer (USD) ou Cardmarket (EUR)
//   - JustTCG        : cotes TCGplayer (USD uniquement → converties si réglage EUR)
//   - PokemonPriceTracker : TCGplayer (USD) ou CardMarket (EUR)
//
// Le réglage de devise du user choisit le marché : EUR -> cotes européennes,
// USD -> cotes américaines. Toutes les sources sont alors ramenées à cette même
// devise (JustTCG est converti depuis l'USD), ce qui rend la comparaison
// « meilleur prix » homogène. Aucune clé API n'est présente dans le bundle :
// elles sont ajoutées côté serveur par le proxy.
const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL;

// Taux de repli, utilisé pour convertir les cotes USD-only (JustTCG) vers l'EUR
// et pour le fallback. L'affichage reconvertit ensuite via le ThemeContext.
const USD_PER_EUR = 1.08;

// "025/165" -> "25" ; "TG05/TG30" -> "TG05" ; "H1" -> "H1".
// On enlève les zéros de tête sur les numéros purement numériques car
// pokemontcg.io les stocke sans ("25", pas "025").
function cardNumberToken(number) {
  const first = String(number || '').split('/')[0].trim();
  if (/^\d+$/.test(first)) return String(parseInt(first, 10));
  return first;
}

// Échappe les guillemets pour la syntaxe de requête Lucene de l'API.
function escapeQuery(str) {
  return String(str || '').replace(/["\\]/g, '\\$&');
}

async function queryCards(q) {
  if (!PROXY_URL) throw new Error('URL du proxy manquante (EXPO_PUBLIC_PROXY_URL).');
  const url = `${PROXY_URL}/prices?q=${encodeURIComponent(q)}&pageSize=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API Pokémon TCG : HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

// Cherche la carte la plus proche de ce que l'IA a identifié.
// On tente d'abord la requête la plus précise (nom + numéro), puis on
// relâche les contraintes si rien ne correspond.
async function findCard(card) {
  const name = card.nameEn || card.name;
  const num = cardNumberToken(card.number);
  const attempts = [];
  if (name && num) attempts.push(`name:"${escapeQuery(name)}" number:"${escapeQuery(num)}"`);
  if (name) attempts.push(`name:"${escapeQuery(name)}"`);

  for (const q of attempts) {
    let results;
    try {
      results = await queryCards(q);
    } catch {
      continue;
    }
    if (!results.length) continue;

    // Priorité : même numéro ET données de prix présentes > même numéro >
    // données de prix présentes > premier résultat.
    const sameNumber = r => num && cardNumberToken(r.number) === num;
    const hasPrices = r => r.tcgplayer?.prices || r.cardmarket?.prices;
    return (
      results.find(r => sameNumber(r) && hasPrices(r)) ||
      results.find(r => sameNumber(r)) ||
      results.find(hasPrices) ||
      results[0]
    );
  }
  return null;
}

function trendFrom(recent, base) {
  if (typeof recent !== 'number' || typeof base !== 'number' || base === 0) return 'stable';
  if (recent > base * 1.05) return 'up';
  if (recent < base * 0.95) return 'down';
  return 'stable';
}

// Tendance à partir d'une variation en pourcentage (JustTCG : priceChange24hr).
function trendFromChange(change) {
  if (typeof change !== 'number') return 'stable';
  if (change > 1) return 'up';
  if (change < -1) return 'down';
  return 'stable';
}

function round(v) {
  return typeof v === 'number' ? +v.toFixed(2) : v;
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : null;
}

// Convertit un montant USD vers la devise d'affichage demandée.
function toCurrency(usd, currency) {
  if (usd == null) return null;
  return currency === 'EUR' ? usd / USD_PER_EUR : usd;
}

// Construit { mid, low, high, trend, currency, url, market } à partir du bloc Cardmarket (EUR).
function fromCardmarket(cm) {
  const p = cm?.prices;
  if (!p) return null;
  const mid = p.trendPrice ?? p.averageSellPrice ?? p.avg7 ?? p.avg30 ?? p.lowPrice;
  if (mid == null) return null;
  const low = p.lowPrice ?? mid;
  const high = Math.max(mid, p.averageSellPrice ?? 0, p.avg30 ?? 0, p.suggestedPrice ?? 0);
  return {
    mid: round(mid),
    low: round(Math.min(low, mid)),
    high: round(high),
    trend: trendFrom(p.avg1 ?? p.avg7, p.avg30),
    currency: 'EUR',
    market: 'cardmarket',
    url: cm.url || null,
    updatedAt: cm.updatedAt || '',
  };
}

// Choisit la finition TCGplayer la plus pertinente selon la rareté.
function pickTcgVariant(prices, rarity) {
  const holoish = /holo|rare|ultra|secret|illustration|gx|ex|v|vmax/i.test(rarity || '');
  const order = holoish
    ? ['holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil', 'normal', '1stEdition']
    : ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil', '1stEdition'];
  for (const k of order) {
    if (prices[k]) return prices[k];
  }
  // Repli : première finition disponible.
  return Object.values(prices)[0] || null;
}

// Construit { mid, low, high, trend, currency, url, market } à partir du bloc TCGplayer (USD).
function fromTcgplayer(tp, rarity) {
  const prices = tp?.prices;
  if (!prices) return null;
  const v = pickTcgVariant(prices, rarity);
  if (!v) return null;
  const mid = v.market ?? v.mid;
  if (mid == null) return null;
  return {
    mid: round(mid),
    low: round(v.low ?? mid),
    high: round(v.high ?? mid),
    trend: 'stable', // TCGplayer ne fournit pas de tendance
    currency: 'USD',
    market: 'tcgplayer',
    url: tp.url || null,
    updatedAt: tp.updatedAt || '',
  };
}

// --- Sources individuelles -----------------------------------------------
// Chacune renvoie { id, source } ou null. Toute erreur (proxy non configuré,
// HTTP non-ok, champ manquant) est avalée : la source est simplement omise,
// sans déclencher le fallback global tant qu'au moins une source répond.

// pokemontcg.io (source historique).
async function fetchFromPokemonTcg(card, currency) {
  const isUsd = currency === 'USD';
  try {
    const match = await findCard(card);
    const source = isUsd
      ? fromTcgplayer(match?.tcgplayer, card.rarity)
      : fromCardmarket(match?.cardmarket);
    if (!source) return null;
    return { id: isUsd ? 'tcgplayer' : 'cardmarket', source };
  } catch {
    return null;
  }
}

// JustTCG — cotes TCGplayer (USD). En réglage EUR on convertit l'USD en euros
// (marqué `approx`), JustTCG ne fournissant pas de cote européenne native.
async function fetchFromJustTcg(card, currency) {
  if (!PROXY_URL) return null;
  const name = card.nameEn || card.name;
  if (!name) return null;
  try {
    const url = `${PROXY_URL}/justtcg?q=${encodeURIComponent(name)}&game=pokemon&condition=NM`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const cards = json.data || json.cards || [];
    if (!Array.isArray(cards) || !cards.length) return null;

    // On tente de retrouver la bonne carte par numéro, sinon on prend la première.
    const wantNum = cardNumberToken(card.number);
    const matched = cards.find(c => {
      const n = c.number ?? c.cardNumber ?? c.collectorNumber;
      return wantNum && n != null && cardNumberToken(n) === wantNum;
    }) || cards[0];

    const variants = matched.variants || matched.prices || [];
    const variant = pickJustTcgVariant(variants, card.rarity) || matched;
    const priceUsd = num(variant.price ?? variant.marketPrice ?? variant.market);
    if (priceUsd == null) return null;

    const lowUsd = num(variant.minPrice ?? variant.lowPrice ?? variant.low) ?? priceUsd;
    const highUsd = num(variant.maxPrice ?? variant.highPrice ?? variant.high) ?? priceUsd;
    const change = num(variant.priceChange24hr ?? variant.priceChange7d);

    const source = {
      mid: round(toCurrency(priceUsd, currency)),
      low: round(toCurrency(Math.min(lowUsd, priceUsd), currency)),
      high: round(toCurrency(Math.max(highUsd, priceUsd), currency)),
      trend: trendFromChange(change),
      currency,
      market: 'tcgplayer',
      url: matched.url || variant.url || null,
      approx: currency === 'EUR', // converti depuis l'USD
      updatedAt: variant.lastUpdated || matched.lastUpdated || '',
    };
    return { id: 'justtcg', source };
  } catch {
    return null;
  }
}

// Choisit la variante JustTCG Near Mint / finition pertinente selon la rareté.
function pickJustTcgVariant(variants, rarity) {
  if (!Array.isArray(variants) || !variants.length) return null;
  const nm = variants.filter(v => /near mint|^nm$/i.test(v.condition || '') || !v.condition);
  const pool = nm.length ? nm : variants;
  const holoish = /holo|rare|ultra|secret|illustration|gx|ex|v|vmax/i.test(rarity || '');
  if (holoish) {
    const foil = pool.find(v => /foil|holo/i.test(v.printing || ''));
    if (foil) return foil;
  }
  return pool[0];
}

// PokemonPriceTracker — expose TCGplayer (USD) et CardMarket (EUR).
// On lit le bloc correspondant au réglage devise.
async function fetchFromPokemonPriceTracker(card, currency) {
  if (!PROXY_URL) return null;
  const name = card.nameEn || card.name;
  if (!name) return null;
  const isUsd = currency === 'USD';
  try {
    const wantNum = cardNumberToken(card.number);
    const params = new URLSearchParams({ name });
    if (wantNum) params.set('number', wantNum);
    const res = await fetch(`${PROXY_URL}/pokemonpricetracker?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    const cards = json.data?.cards || json.cards || json.data || [];
    if (!Array.isArray(cards) || !cards.length) return null;

    const matched = cards.find(c => {
      const n = c.number ?? c.cardNumber ?? c.collectorNumber;
      return wantNum && n != null && cardNumberToken(n) === wantNum;
    }) || cards[0];

    // Les prix peuvent être nichés sous .prices, .pricing ou à la racine.
    const root = matched.prices || matched.pricing || matched;
    const block = isUsd
      ? (root.tcgplayer || root.tcgPlayer || root.tcg)
      : (root.cardmarket || root.cardMarket || root.cm);
    if (!block) return null;

    const mid = num(block.market ?? block.marketPrice ?? block.mid ?? block.trendPrice ?? block.price ?? block.averageSellPrice);
    if (mid == null) return null;
    const low = num(block.low ?? block.lowPrice ?? block.min) ?? mid;
    const high = num(block.high ?? block.highPrice ?? block.max) ?? mid;

    const source = {
      mid: round(mid),
      low: round(Math.min(low, mid)),
      high: round(Math.max(high, mid)),
      trend: trendFromChange(num(block.priceChange ?? block.change)),
      currency: isUsd ? 'USD' : 'EUR',
      market: isUsd ? 'tcgplayer' : 'cardmarket',
      url: matched.url || block.url || null,
      updatedAt: block.updatedAt || matched.updatedAt || '',
    };
    return { id: 'pokemonpricetracker', source };
  } catch {
    return null;
  }
}

// --- Agrégation -----------------------------------------------------------

export async function fetchCardPrices(card, currency = 'EUR') {
  const results = await Promise.allSettled([
    fetchFromPokemonTcg(card, currency),
    fetchFromJustTcg(card, currency),
    fetchFromPokemonPriceTracker(card, currency),
  ]);

  const prices = {};
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) prices[r.value.id] = r.value.source;
  }

  const keys = Object.keys(prices);
  if (!keys.length) return generateFallbackPrices(card.rarity, currency);

  // Toutes les sources sont dans la devise du réglage : le « meilleur prix »
  // est simplement la cote médiane la plus basse.
  const bestDeal = keys.reduce((best, k) => (prices[k].mid < prices[best].mid ? k : best), keys[0]);
  prices.bestDeal = bestDeal;
  prices.lastUpdated = prices[bestDeal].updatedAt || '';
  return prices;
}

// Dernier recours si AUCUNE source ne renvoie de cote exploitable : estimation
// grossière basée sur la rareté. Marquée `estimated` pour distinguer d'un vrai
// prix de marché.
function generateFallbackPrices(rarity, currency = 'EUR') {
  const baseEur = {
    'Common': 0.5, 'Uncommon': 1, 'Rare': 3, 'Holo Rare': 8,
    'Ultra Rare': 25, 'Secret Rare': 60, 'Special Illustration Rare': 80,
  }[rarity] || 5;

  if (currency === 'USD') {
    const b = +(baseEur * USD_PER_EUR).toFixed(2);
    return {
      tcgplayer: { mid: round(b), low: round(b * 0.6), high: round(b * 1.8), trend: 'stable', currency: 'USD', market: 'tcgplayer', url: null },
      bestDeal: 'tcgplayer',
      lastUpdated: '',
      estimated: true,
    };
  }
  return {
    cardmarket: { mid: round(baseEur * 0.9), low: round(baseEur * 0.5), high: round(baseEur * 1.6), trend: 'stable', currency: 'EUR', market: 'cardmarket', url: null },
    bestDeal: 'cardmarket',
    lastUpdated: '',
    estimated: true,
  };
}
