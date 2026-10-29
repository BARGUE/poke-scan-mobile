// Récupération des prix de cartes Pokémon (via notre proxy Cloudflare Worker,
// voir proxy/) depuis pokemontcg.io : TCGplayer (USD) ou Cardmarket (EUR).
//
// Le réglage de devise du user choisit le marché : EUR -> cote Cardmarket
// (européenne), USD -> cote TCGplayer (américaine). Aucune clé API n'est
// présente dans le bundle : elle est ajoutée côté serveur par le proxy.
import { fetchWithTimeout } from './anthropic';

const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL;

// Taux de conversion approximatif, utilisé pour le fallback par rareté et pour
// additionner des cotes en devises différentes (totaux historique/collection).
export const USD_PER_EUR = 1.08;

// Ramène une valeur en euros (approximation, cf. USD_PER_EUR).
export function toEur(value, currency) {
  if (typeof value !== 'number') return 0;
  return currency === 'USD' ? value / USD_PER_EUR : value;
}

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

function scoreSet(card, parsed, r, codeSetIds) {
  let score = 0;
  const set = r.set || {};

  const rTotal = set.printedTotal ?? set.total ?? null;
  if (parsed.total && rTotal && parsed.total === rTotal) score += 5;

  // Le code imprimé sur la carte (« PAL ») a été traduit en identifiant(s) de
  // set via /sets (codeSetIds) ; on accepte aussi le code égal à l'id (« sv2 »).
  const code = normalize(card.setCode);
  if (set.id && (codeSetIds.includes(set.id) || (code && normalize(set.id) === code))) score += 6;

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
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`API Pokémon TCG : HTTP ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

// Traduit le code d'extension imprimé sur la carte (« PAL ») en sets de l'API.
// Le champ `ptcgoCode` n'est interrogeable que sur /sets (sur /cards, l'API
// répond une erreur 500 et ne renvoie même pas ce champ dans les résultats).
async function findSetsByCode(code) {
  if (!PROXY_URL || !/^[A-Za-z0-9-]{2,8}$/.test(code)) return [];
  try {
    const res = await fetchWithTimeout(`${PROXY_URL}/sets?q=${encodeURIComponent(`ptcgoCode:"${escapeQuery(code)}"`)}&pageSize=10`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

// Cherche la carte la plus proche de ce que l'IA a identifié.
// On tente d'abord la requête la plus précise (nom + numéro), puis on
// relâche les contraintes si rien ne correspond.
//
// Renvoie { match, confident } : `confident` vaut true seulement si on a
// identifié l'édition EXACTE, c.-à-d. (1) un signal fort (total imprimé ou code
// de set) ET (2) aucune autre édition (set différent) à égalité de score. Sans
// ces deux conditions, plusieurs éditions de la même carte (même nom + numéro,
// parfois même taille de set) sont indiscernables : l'URL directe pourrait
// ouvrir la mauvaise carte (visuel différent) — on la masquera alors en amont.
async function findCard(card) {
  // pokemontcg.io est une base anglaise : on privilégie `nameEn`, mais on essaie
  // AUSSI le nom (souvent en français) car `nameEn` peut manquer ou être imparfait.
  // Dédoublonné (insensible à la casse) pour ne pas relancer la même requête.
  const names = [card.nameEn, card.name]
    .map(n => String(n || '').trim())
    .filter(Boolean)
    .filter((n, i, arr) => arr.findIndex(o => o.toLowerCase() === n.toLowerCase()) === i);
  const parsed = parseNumber(card.number);
  const num = parsed.num;
  const attempts = [];
  // 1) Les indices imprimés sur la carte : code d'extension (« PAL ») + numéro.
  //    Ils désignent directement la carte, quelle que soit la langue du nom. On
  //    vérifie quand même le nom (requireName) pour écarter une erreur de
  //    lecture du numéro qui pointerait vers une autre carte du même set.
  const codeSets = await findSetsByCode(String(card.setCode || '').trim());
  const codeSetIds = codeSets.map(s => s.id);
  if (num) {
    for (const id of codeSetIds) {
      attempts.push({ q: `set.id:"${escapeQuery(id)}" number:"${escapeQuery(num)}"`, requireName: true });
    }
  }
  // 2) Nom + numéro pour TOUS les noms, puis 3) nom seul.
  if (num) for (const name of names) attempts.push({ q: `name:"${escapeQuery(name)}" number:"${escapeQuery(num)}"` });
  for (const name of names) attempts.push({ q: `name:"${escapeQuery(name)}"` });

  const nameMatches = r => {
    const rn = normalize(r.name);
    return names.some(n => {
      const a = normalize(n);
      return a && rn && (rn.includes(a) || a.includes(rn));
    });
  };

  for (const { q, requireName } of attempts) {
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
    const pool = (num ? results.filter(sameNumber) : results)
      .filter(r => !requireName || nameMatches(r));
    if (!pool.length) continue;

    const scored = pool
      .map(r => ({ r, score: scoreSet(card, parsed, r, codeSetIds) }))
      .sort((a, b) => (b.score - a.score) || (hasPrices(b.r) - hasPrices(a.r)));

    const best = scored[0];
    const strong = best.score >= STRONG_SET_SCORE;
    // Ambigu : une autre carte, d'un SET DIFFÉRENT, atteint le même score que la
    // meilleure. On ne peut alors pas trancher l'édition exacte de façon fiable.
    const bestSetId = best.r.set?.id;
    const ambiguous = scored.some(s =>
      s !== best && s.r.set?.id && s.r.set.id !== bestSetId && s.score >= best.score
    );
    // Garde-fou « même édition = même taille de set » : si la carte scannée porte
    // un total (« /Y »), l'édition retenue doit avoir EXACTEMENT cette taille,
    // sinon le visuel diffère et le lien direct mènerait à une autre carte.
    const bestTotal = best.r.set?.printedTotal ?? best.r.set?.total ?? null;
    const totalOk = !parsed.total || (bestTotal != null && bestTotal === parsed.total);

    // Infos du set trouvées via le code (code, symbole, série) : les résultats
    // de /cards ne contiennent pas toujours le code d'extension.
    const codeSet = codeSets.find(s => s.id === bestSetId) || null;
    return { match: best.r, confident: strong && !ambiguous && totalOk, codeSet };
  }
  return { match: null, confident: false, codeSet: null };
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
  // « Rare » seule désigne une rare NON holo : on ne privilégie la finition holo
  // que pour les raretés qui le sont réellement.
  const holoish = /holo|ultra|secret|illustration|\b(gx|ex|v|vmax|vstar)\b/i.test(rarity || '');
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
    const { match, confident, codeSet } = await findCard(card);
    const source = isUsd
      ? fromTcgplayer(match?.tcgplayer, card.rarity)
      : fromCardmarket(match?.cardmarket);
    // Set non confirmé : l'URL directe risque de mener à une autre édition de la
    // carte (image différente). On l'efface pour que CardResultView retombe sur
    // une recherche pré-remplie sur le site marchand, qui reste cohérente.
    if (source && !confident) source.url = null;

    // Set CONFIRMÉ par l'API (signal fort uniquement) : sert à fournir une année
    // de sortie fiable à l'historique et à ranger la carte dans sa collection
    // (série > extension). Sinon on risquerait une mauvaise édition.
    const set = confident && match?.set ? {
      id: match.set.id,
      name: match.set.name,
      series: match.set.series || codeSet?.series || null,
      code: match.set.ptcgoCode || codeSet?.ptcgoCode || null,
      symbol: match.set.images?.symbol || codeSet?.images?.symbol || null,
      printedTotal: match.set.printedTotal ?? match.set.total ?? null,
      year: String(match.set.releaseDate || '').slice(0, 4),
    } : null;

    // Fiches marchandes de la carte exacte : disponibles même quand le marché
    // choisi n'a pas de cote (on peut alors quand même ouvrir la fiche).
    const links = confident && match ? {
      cardmarket: match.cardmarket?.url || null,
      tcgplayer: match.tcgplayer?.url || null,
    } : null;

    return { id: isUsd ? 'tcgplayer' : 'cardmarket', source: source || null, set, links };
  } catch {
    return null;
  }
}

// --- Liens marchands --------------------------------------------------------

// Recherche pré-remplie sur le site marchand, quand on n'a pas l'URL de la
// fiche exacte (édition non confirmée, ancien scan, estimation). Les deux sites
// indexent les cartes sous leur nom anglais : on privilégie donc `nameEn`.
export function marketSearchUrl(market, card) {
  const name = String(card?.nameEn || card?.name || '').trim();
  if (!name) return null;
  const q = encodeURIComponent(name);
  if (market === 'tcgplayer') {
    return `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${q}`;
  }
  return `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q}`;
}

// --- Agrégation -----------------------------------------------------------

export async function fetchCardPrices(card, currency = 'EUR') {
  const result = await fetchFromPokemonTcg(card, currency);

  let prices;
  if (result && result.source) {
    prices = {
      [result.id]: result.source,
      bestDeal: result.id,
      lastUpdated: result.source.updatedAt || '',
    };
  } else {
    // Pas de cote exploitable : estimation par rareté. On conserve quand même le
    // set confirmé s'il a été identifié (pour l'année fiable de l'historique).
    prices = generateFallbackPrices(card.rarity, currency);
  }

  if (result && result.set) prices.matchedSet = result.set;
  if (result && result.links) prices.links = result.links;
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
