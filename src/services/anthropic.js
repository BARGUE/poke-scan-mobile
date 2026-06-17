// L'app n'appelle plus Anthropic directement : elle passe par notre proxy
// Cloudflare Worker, qui détient la clé secrète côté serveur (voir proxy/).
// Aucune clé API n'est donc présente dans le bundle de l'app.
const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL;

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
  if (!PROXY_URL) {
    throw new Error('URL du proxy manquante (EXPO_PUBLIC_PROXY_URL).');
  }

  const response = await fetch(`${PROXY_URL}/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      detail = err.error?.message || detail;
    } catch {
      // réponse non-JSON
    }
    throw new Error(`Erreur d'analyse : ${detail}`);
  }

  // Le proxy relaie la réponse d'Anthropic telle quelle.
  const data = await response.json();
  const rawText = data.content?.find(b => b.type === 'text')?.text || '';
  return parseJsonFromText(rawText);
}
