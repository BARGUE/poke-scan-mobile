import { Directory, File, Paths } from 'expo-file-system';

// Les photos produites par la caméra / le manipulateur d'image vivent dans le
// cache, que le système peut vider à tout moment : l'historique et la
// collection se retrouvaient alors avec des vignettes cassées. On copie donc
// chaque photo scannée dans le dossier Documents de l'app.

function scansDir() {
  const dir = new Directory(Paths.document, 'scans');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function isPersisted(uri) {
  return typeof uri === 'string' && uri.startsWith(scansDir().uri);
}

// Copie l'image dans le stockage permanent et renvoie sa nouvelle URI. En cas
// d'échec on garde l'URI d'origine : mieux vaut une vignette éphémère que
// perdre le scan.
export async function persistImage(uri) {
  if (!uri || isPersisted(uri)) return uri;
  try {
    const ext = (uri.split('?')[0].match(/\.(jpe?g|png|webp|heic)$/i)?.[1] || 'jpg').toLowerCase();
    const dest = new File(scansDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    await new File(uri).copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('Copie de la photo impossible, URI temporaire conservée', e);
    return uri;
  }
}

// Supprime les photos qui ne sont plus référencées ni par l'historique ni par
// la collection (les deux partagent la même photo pour un même scan).
export function deleteImagesIfUnused(uris, stillUsed) {
  const keep = new Set(stillUsed);
  for (const uri of new Set(uris)) {
    if (!uri || keep.has(uri) || !isPersisted(uri)) continue;
    try {
      const f = new File(uri);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn('Suppression de la photo impossible', e);
    }
  }
}
