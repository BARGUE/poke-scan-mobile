// Récupération des prix via l'API Pokémon TCG (https://pokemontcg.io).
// Contrairement à l'ancienne approche (chiffres demandés au LLM), les prix
// proviennent ici directement de TCGplayer (USD) et Cardmarket (EUR), avec une
// vraie URL vers la fiche de la carte. C'est vérifiable et reproductible.
const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';
const API_KEY = process.env.EXPO_PUBLIC_POKEMONTCG_API_KEY;

// Taux de repli, utilisé uniquement pour comparer deux devises (bestDeal) et
// pour le fallback. L'affichage reconvertit ensuite via le ThemeContext.
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
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-Api-Key'] = API_KEY;
  const url = `${POKEMONTCG_API}?q=${encodeURIComponent(q)}&pageSize=20`;
  const res = await fetch(url, { headers });
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

// Construit { mid, low, high, trend, currency, url } à partir du bloc Cardmarket (EUR).
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
    url: cm.url || null,
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

// Construit { mid, low, high, trend, currency, url } à partir du bloc TCGplayer (USD).
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
    url: tp.url || null,
  };
}

function round(v) {
  return typeof v === 'number' ? +v.toFixed(2) : v;
}

export async function fetchCardPrices(card, currency = 'EUR') {
  // On n'affiche qu'un seul marché selon la devise choisie dans les réglages :
  // EUR -> Cardmarket (marché européen), USD -> TCGplayer (marché américain).
  const isUsd = currency === 'USD';
  const key = isUsd ? 'tcgplayer' : 'cardmarket';
  try {
    const match = await findCard(card);
    const source = isUsd
      ? fromTcgplayer(match?.tcgplayer, card.rarity)
      : fromCardmarket(match?.cardmarket);

    if (!source) return generateFallbackPrices(card.rarity, currency);

    const updatedAt = (isUsd ? match?.tcgplayer?.updatedAt : match?.cardmarket?.updatedAt) || '';
    return { [key]: source, bestDeal: key, lastUpdated: updatedAt };
  } catch {
    return generateFallbackPrices(card.rarity, currency);
  }
}

// Dernier recours si l'API ne renvoie rien d'exploitable pour cette carte :
// estimation grossière basée sur la rareté. Marquée `estimated` pour distinguer
// d'un vrai prix de marché.
function generateFallbackPrices(rarity, currency = 'EUR') {
  const baseEur = {
    'Common': 0.5, 'Uncommon': 1, 'Rare': 3, 'Holo Rare': 8,
    'Ultra Rare': 25, 'Secret Rare': 60, 'Special Illustration Rare': 80,
  }[rarity] || 5;

  if (currency === 'USD') {
    const b = +(baseEur * USD_PER_EUR).toFixed(2);
    return {
      tcgplayer: { mid: round(b), low: round(b * 0.6), high: round(b * 1.8), trend: 'stable', currency: 'USD', url: null },
      bestDeal: 'tcgplayer',
      lastUpdated: '',
      estimated: true,
    };
  }
  return {
    cardmarket: { mid: round(baseEur * 0.9), low: round(baseEur * 0.5), high: round(baseEur * 1.6), trend: 'stable', currency: 'EUR', url: null },
    bestDeal: 'cardmarket',
    lastUpdated: '',
    estimated: true,
  };
}
