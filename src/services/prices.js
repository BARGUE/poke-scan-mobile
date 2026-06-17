// Récupération des prix de cartes Pokémon (via notre proxy Cloudflare Worker,
// voir proxy/) depuis pokemontcg.io : TCGplayer (USD) ou Cardmarket (EUR).
//
// Le réglage de devise du user choisit le marché : EUR -> cote Cardmarket
// (européenne), USD -> cote TCGplayer (américaine). Aucune clé API n'est
// présente dans le bundle : elle est ajoutée côté serveur par le proxy.
const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL;

// Taux de repli, utilisé pour le fallback par rareté.
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

function round(v) {
  return typeof v === 'number' ? +v.toFixed(2) : v;
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

// --- Source -----------------------------------------------------------------
// pokemontcg.io : renvoie { id, source } ou null. Toute erreur (proxy non
// configuré, HTTP non-ok, champ manquant) est avalée : on retombe alors sur
// l'estimation par rareté.
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

// --- Agrégation -----------------------------------------------------------

export async function fetchCardPrices(card, currency = 'EUR') {
  const result = await fetchFromPokemonTcg(card, currency);
  if (!result) return generateFallbackPrices(card.rarity, currency);

  const prices = { [result.id]: result.source };
  prices.bestDeal = result.id;
  prices.lastUpdated = result.source.updatedAt || '';
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
