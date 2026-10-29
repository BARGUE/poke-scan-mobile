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
//   GET  /prices?q=<lucene>&pageSize=20                      -> Pokémon TCG API (cartes)
//   GET  /sets?q=<lucene>                                    -> Pokémon TCG API (extensions)
//
// Le prompt, le modèle et max_tokens sont fixés ici (et non envoyés par l'app)
// pour limiter l'usage du proxy au seul cas « identifier une carte Pokémon ».

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const POKEMONTCG_API = 'https://api.pokemontcg.io/v2/cards';
const POKEMONTCG_SETS_API = 'https://api.pokemontcg.io/v2/sets';

const MODEL = 'claude-sonnet-5-5';

// Taille max de l'image reçue (base64). Anthropic refuse les images > 5 Mo ;
// l'app envoie ~1100 px de large en JPEG, bien en dessous.
const MAX_IMAGE_B64 = 7_000_000;

const IDENTIFY_PROMPT = `Tu es un expert en cartes Pokémon TCG. Analyse cette image de carte Pokémon et remplis les champs demandés :
- name : nom de la carte en français si possible
- nameEn : nom anglais officiel
- set : nom de l'extension (set) si tu le reconnais, sinon null
- setCode : code d'extension imprimé en bas de la carte (ex : "SVI", "PAL", "OBF"), sinon null
- number : numéro de carte AVEC le total quand il est visible (ex : "025/165")
- rarity : une des valeurs Common, Uncommon, Rare, Holo Rare, Ultra Rare, Secret Rare, Special Illustration Rare
- type : type Pokémon en anglais (ex : "Fire"), ou "Trainer" / "Energy"
- hp : HP si applicable, sinon null
- condition : état estimé (Near Mint, Lightly Played, Moderately Played, Heavily Played, Damaged)
- year : année de sortie approximative (ex : "2023")
- emoji : un emoji représentant le Pokémon ou le type
L'image peut être une photo d'un écran d'ordinateur ou de téléphone affichant la carte (reflets, moiré, angle, qualité réduite). Analyse quand même la carte visible à l'écran ; ne refuse PAS sous prétexte que c'est une photo d'écran.
Si ce n'est vraiment pas une carte Pokémon, mets found à false, explique brièvement dans reason et laisse les autres champs à null.`;

// Schéma imposé à la réponse (sorties structurées) : le JSON renvoyé est
// garanti valide, plus besoin d'espérer que le modèle respecte le format.
const nullable = type => ({ anyOf: [{ type }, { type: 'null' }] });
const CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'reason', 'name', 'nameEn', 'set', 'setCode', 'number', 'rarity', 'type', 'hp', 'condition', 'year', 'emoji'],
  properties: {
    found: { type: 'boolean' },
    reason: nullable('string'),
    name: nullable('string'),
    nameEn: nullable('string'),
    set: nullable('string'),
    setCode: nullable('string'),
    number: nullable('string'),
    rarity: nullable('string'),
    type: nullable('string'),
    hp: nullable('string'),
    condition: nullable('string'),
    year: nullable('string'),
    emoji: nullable('string'),
  },
};

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
    if (url.pathname === '/sets' && request.method === 'GET') {
      return handleSets(url, env);
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
  if (typeof image !== 'string' || !image) {
    return json({ error: { message: 'Champ "image" (base64) manquant.' } }, 400);
  }
  if (image.length > MAX_IMAGE_B64) {
    return json({ error: { message: 'Image trop lourde, réessayez avec une photo plus petite.' } }, 413);
  }

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Si les filtres de sécurité refusent la requête, l'API la relance
      // automatiquement sur un modèle de repli au lieu d'échouer.
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: CARD_SCHEMA } },
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
  if (upstream.ok && data.stop_reason === 'refusal') {
    return json({ error: { message: "L'IA a refusé d'analyser cette image." } }, 422);
  }
  return json(data, upstream.status);
}

// GET /prices → recherche de cartes ; GET /sets → recherche d'extensions (sert
// à traduire le code imprimé sur la carte, ex. « PAL », en identifiant de set :
// le champ `ptcgoCode` n'est interrogeable que sur /sets, pas sur /cards).
async function handlePrices(url, env) {
  return forwardTcg(POKEMONTCG_API, url, env);
}

async function handleSets(url, env) {
  return forwardTcg(POKEMONTCG_SETS_API, url, env);
}

async function forwardTcg(endpoint, url, env) {
  const q = url.searchParams.get('q');
  if (!q) {
    return json({ error: 'Paramètre "q" manquant.' }, 400);
  }
  // Borné pour éviter qu'un appelant ne transforme le proxy en aspirateur.
  const pageSize = String(Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize'), 10) || 20)));

  const headers = { 'Content-Type': 'application/json' };
  // La clé Pokémon TCG est optionnelle (elle évite seulement le rate limiting).
  if (env.POKEMONTCG_API_KEY) headers['X-Api-Key'] = env.POKEMONTCG_API_KEY;

  const target = `${endpoint}?q=${encodeURIComponent(q)}&pageSize=${encodeURIComponent(pageSize)}`;
  // L'API Pokémon TCG renvoie régulièrement des 5xx ou des corps vides
  // passagers : on retente quelques fois avant d'abandonner.
  let status = 502;
  for (let attempt = 0; attempt < 3; attempt++) {
    const upstream = await fetch(target, { headers }).catch(() => null);
    if (!upstream) continue;
    status = upstream.status;
    const data = await upstream.json().catch(() => null);
    if (data && upstream.status < 500) return json(data, upstream.status);
  }
  return json({ data: [], error: 'API Pokémon TCG indisponible.' }, status);
}
