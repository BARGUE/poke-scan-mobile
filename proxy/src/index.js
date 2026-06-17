// Cloudflare Worker — proxy sécurisé pour Pokémon Scanner.
//
// Ce Worker détient les clés API SECRÈTES (Anthropic + Pokémon TCG) sous forme
// de "secrets" Cloudflare. Elles ne sont JAMAIS expédiées dans l'app : l'app
// n'appelle que ce Worker, qui ajoute les clés côté serveur avant de relayer la
// requête vers les vraies API. Une clé présente dans le bundle d'une app mobile
// est toujours extractible — c'est précisément ce qu'on évite ici.
//
// Routes :
//   POST /identify             body { image: "<base64>" }   -> Claude Vision
//   GET  /prices?q=<lucene>&pageSize=20                      -> Pokémon TCG API
//   GET  /justtcg?q=<nom>&game=pokemon                       -> JustTCG API
//   GET  /pokemonpricetracker?name=<nom>&number=<num>        -> PokemonPriceTracker API
//
// Le prompt, le modèle et max_tokens sont fixés ici (et non envoyés par l'app)
// pour limiter l'usage du proxy au seul cas « identifier une carte Pokémon ».

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';
const JUSTTCG_API = 'https://api.justtcg.com/v1/cards';
const POKEMONPRICETRACKER_API = 'https://www.pokemonpricetracker.com/api/v2/cards';

const IDENTIFY_PROMPT = `Tu es un expert en cartes Pokémon TCG. Analyse cette image de carte Pokémon et retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas d'explication), avec ces champs exactement :
{
  "found": true,
  "name": "Nom de la carte en français si possible",
  "nameEn": "Nom anglais officiel",
  "set": "Nom du set",
  "setCode": "Code du set ex: sv3",
  "number": "Numéro de carte ex: 025/165",
  "rarity": "Common|Uncommon|Rare|Holo Rare|Ultra Rare|Secret Rare|Special Illustration Rare",
  "type": "Type Pokémon ou Trainer/Energy",
  "hp": "HP si applicable sinon null",
  "condition": "Near Mint|Lightly Played|Moderately Played|Heavily Played",
  "year": "Année approximative",
  "emoji": "Un emoji représentant le Pokémon ou le type"
}
L'image peut être une photo d'un écran d'ordinateur ou de téléphone affichant la carte (reflets, moiré, angle, qualité réduite). Analyse quand même la carte visible à l'écran ; ne refuse PAS sous prétexte que c'est une photo d'écran.
Si ce n'est vraiment pas une carte Pokémon, retourne { "found": false, "reason": "explication courte" }`;

// Détecte le type MIME réel à partir des premiers octets du base64.
// Une capture d'écran de PC est généralement en PNG, pas en JPEG —
// déclarer le mauvais media_type fait échouer la requête (400).
function detectMediaType(base64) {
  if (!base64) return 'image/jpeg';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    const url = new URL(request.url);

    if (url.pathname === '/identify' && request.method === 'POST') {
      return handleIdentify(request, env);
    }
    if (url.pathname === '/prices' && request.method === 'GET') {
      return handlePrices(url, env);
    }
    if (url.pathname === '/justtcg' && request.method === 'GET') {
      return handleJustTcg(url, env);
    }
    if (url.pathname === '/pokemonpricetracker' && request.method === 'GET') {
      return handlePokemonPriceTracker(url, env);
    }
    return json({ error: 'Route inconnue' }, 404);
  },
};

async function handleIdentify(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: { message: 'Proxy mal configuré : ANTHROPIC_API_KEY manquante.' } }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: 'Corps de requête JSON invalide.' } }, 400);
  }

  const image = body?.image;
  if (!image) {
    return json({ error: { message: 'Champ "image" (base64) manquant.' } }, 400);
  }

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: detectMediaType(image), data: image },
          },
          { type: 'text', text: IDENTIFY_PROMPT },
        ],
      }],
    }),
  });

  // On relaie la réponse d'Anthropic telle quelle (status compris) : l'app
  // sait déjà en extraire le texte et le parser.
  const data = await upstream.json().catch(() => ({ error: { message: 'Réponse Anthropic illisible.' } }));
  return json(data, upstream.status);
}

async function handlePrices(url, env) {
  const q = url.searchParams.get('q');
  if (!q) {
    return json({ error: 'Paramètre "q" manquant.' }, 400);
  }
  const pageSize = url.searchParams.get('pageSize') || '20';

  const headers = { 'Content-Type': 'application/json' };
  // La clé Pokémon TCG est optionnelle (elle évite seulement le rate limiting).
  if (env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = env.POKEMONTCG_API_KEY;

  const target = `${POKEMONTCG_API}?q=${encodeURIComponent(q)}&pageSize=${encodeURIComponent(pageSize)}`;
  const upstream = await fetch(target, { headers });
  const data = await upstream.json().catch(() => ({ data: [] }));
  return json(data, upstream.status);
}

// JustTCG (https://justtcg.com) — cotes basées sur TCGplayer (USD uniquement).
// La clé secrète (format "tcg_...") est ajoutée ici, jamais expédiée dans l'app.
async function handleJustTcg(url, env) {
  if (!env.JUSTTCG_API_KEY) {
    return json({ error: 'Proxy mal configuré : JUSTTCG_API_KEY manquante.' }, 500);
  }
  const params = new URLSearchParams();
  // game est toujours pokemon ; on ne relaie qu'un petit ensemble de paramètres
  // pour limiter l'usage du proxy à la recherche de cartes Pokémon.
  params.set('game', 'pokemon');
  for (const key of ['q', 'condition', 'printing', 'limit', 'tcgplayerId', 'cardId']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }

  const upstream = await fetch(`${JUSTTCG_API}?${params}`, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.JUSTTCG_API_KEY },
  });
  const data = await upstream.json().catch(() => ({ data: [] }));
  return json(data, upstream.status);
}

// PokemonPriceTracker (https://pokemonpricetracker.com) — cotes TCGplayer (USD)
// ET CardMarket (EUR). La clé secrète est passée en Bearer côté serveur.
async function handlePokemonPriceTracker(url, env) {
  if (!env.POKEMONPRICETRACKER_API_KEY) {
    return json({ error: 'Proxy mal configuré : POKEMONPRICETRACKER_API_KEY manquante.' }, 500);
  }
  const params = new URLSearchParams();
  // L'API v2 cherche via le paramètre `search`. On relaie aussi quelques
  // filtres optionnels selon ce que l'app fournit.
  for (const key of ['search', 'name', 'set', 'number', 'limit', 'id']) {
    const v = url.searchParams.get(key);
    if (v) params.set(key, v);
  }

  const upstream = await fetch(`${POKEMONPRICETRACKER_API}?${params}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.POKEMONPRICETRACKER_API_KEY}`,
    },
  });
  const data = await upstream.json().catch(() => ({ data: [] }));
  return json(data, upstream.status);
}
