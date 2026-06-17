const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

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

// Extrait un objet JSON même si le modèle ajoute du texte autour.
function parseJsonFromText(rawText) {
  const clean = (rawText || '').replace(/```json|```/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Réponse de l'IA illisible (aucun JSON trouvé).");
  }
  return JSON.parse(match[0]);
}

export async function identifyCard(base64Image) {
  if (!API_KEY) {
    throw new Error('Clé API Anthropic manquante (EXPO_PUBLIC_ANTHROPIC_API_KEY).');
  }
  const prompt = `Tu es un expert en cartes Pokémon TCG. Analyse cette image de carte Pokémon et retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas d'explication), avec ces champs exactement :
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

  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
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
            source: {
              type: 'base64',
              media_type: detectMediaType(base64Image),
              data: base64Image,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err.error?.message || detail;
    } catch {
      // réponse non-JSON
    }
    throw new Error(`Erreur API Anthropic : ${detail}`);
  }

  const data = await response.json();
  const rawText = data.content?.find(b => b.type === 'text')?.text || '';
  return parseJsonFromText(rawText);
}
