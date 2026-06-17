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

// "025/165" -> { num: "25", total: 165 }. Le total (dénominateur) est un
// indice FORT et indépendant de la langue pour identifier le bon set.
function parseNumber(number) {
  const [numPart, totalPart] = String(number || '').split('/');
  const total = totalPart && /^\d+$/.test(totalPart.trim())
    ? parseInt(totalPart.trim(), 10)
    : null;
  return { num: cardNumberToken(numPart), total };
}

// Normalise pour comparer des libellés : minuscules, sans accents ni ponctuation.
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Score de correspondance entre le set identifié par l'IA et un résultat de
// l'API. On privilégie les signaux indépendants de la langue (total imprimé,
// code du set, année) car l'IA renvoie le set en français et l'API en anglais.
const STRONG_SET_SCORE = 5; // au moins un signal fort (total OU code de set)

function scoreSet(card, parsed, r) {
  let score = 0;
  const set = r.set || {};

  const rTotal = set.printedTotal ?? set.total ?? null;
  if (parsed.total && rTotal && parsed.total === rTotal) score += 5;

  if (card.setCode && set.id && normalize(card.setCode) === normalize(set.id)) score += 6;

  const rYear = String(set.releaseDate || '').slice(0, 4);
  if (card.year && rYear && String(card.year).slice(0, 4) === rYear) score += 2;

  if (card.set && set.name) {
    const a = normalize(card.set);
    const b = normalize(set.name);
    if (a && b && (a === b || a.includes(b) || b.includes(a))) score += 2;
  }
  return score;
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
//
// Renvoie { match, confident } : `confident` vaut true seulement si le SET a
// été confirmé par un signal fort (total imprimé ou code de set identiques).
// Sans cette confirmation, plusieurs éditions de la même carte (même nom +
// numéro) sont indiscernables et l'URL directe pourrait pointer vers la
// mauvaise collection — on la masquera alors en amont.
async function findCard(card) {
  const name = card.nameEn || card.name;
  const parsed = parseNumber(card.number);
  const num = parsed.num;
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

    // On restreint au bon numéro si on le connaît, puis on classe par score de
    // correspondance du set ; à score égal, on départage par présence de cotes.
    const sameNumber = r => num && cardNumberToken(r.number) === num;
    const hasPrices = r => (r.tcgplayer?.prices || r.cardmarket?.prices) ? 1 : 0;
    const pool = num ? results.filter(sameNumber) : results;
    if (!pool.length) continue;

    const scored = pool
      .map(r => ({ r, score: scoreSet(card, parsed, r) }))
      .sort((a, b) => (b.score - a.score) || (hasPrices(b.r) - hasPrices(a.r)));

    const best = scored[0];
    return { match: best.r, confident: best.score >= STRONG_SET_SCORE };
  }
  return { match: null, confident: false };
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
    const { match, confident } = await findCard(card);
    const source = isUsd
      ? fromTcgplayer(match?.tcgplayer, card.rarity)
      : fromCardmarket(match?.cardmarket);
    if (!source) return null;
    // Set non confirmé : l'URL directe risque de mener à une autre édition de la
    // carte (image différente). On l'efface pour que CardResultView retombe sur
    // une recherche pré-remplie nom + numéro, qui reste cohérente.
    if (!confident) source.url = null;
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
