// L'app n'appelle plus Anthropic directement : elle passe par notre proxy
// Cloudflare Worker, qui détient la clé secrète côté serveur (voir proxy/).
// Aucune clé API n'est donc présente dans le bundle de l'app.
const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL;
const IDENTIFY_TIMEOUT_MS = 90_000;

// fetch sans délai maximal peut rester bloqué indéfiniment sur un réseau
// instable (et l'écran d'analyse avec lui).
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  if (!PROXY_URL) {
    throw new Error('URL du proxy manquante (EXPO_PUBLIC_PROXY_URL).');
  }

  let response;
  try {
    response = await fetchWithTimeout(`${PROXY_URL}/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    }, IDENTIFY_TIMEOUT_MS);
  } catch (e) {
    throw new Error(e.name === 'AbortError'
      ? "L'analyse a pris trop de temps. Vérifiez votre connexion et réessayez."
      : 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }

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

  // Le proxy relaie la réponse d'Anthropic telle quelle. Le JSON (imposé par un
  // schéma côté proxy) est dans le dernier bloc texte.
  const data = await response.json();
  const rawText = data.content?.filter(b => b.type === 'text').pop()?.text || '';
  return parseJsonFromText(rawText);
}
