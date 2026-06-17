// Identité et regroupement des séries de la collection.
//
// L'IA renvoie le nom du set de façon inconsistante (« Expédition de base » vs
// « Expédition » pour la même série). On ne peut donc PAS se fier au libellé
// exact pour regrouper/dédupliquer. On s'appuie plutôt sur une identité stable
// indépendante du libellé : l'année + la taille de la série (le « /Y » du
// numéro, ex. « 025/165 » -> 165). Le nom du set ne sert plus qu'à l'affichage.

// Extrait le numéro de la carte ("25/198" -> 25, "TG05" -> 5).
export function parseCardNumber(number) {
  if (!number) return null;
  const m = String(number).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Extrait la taille de la série à partir du "/Y" ("25/198" -> 198).
export function parseSetTotal(number) {
  if (!number) return null;
  const m = String(number).match(/\/\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Année sur 4 chiffres ("2002", "vers 2002" -> "2002"), sinon "".
function parseYear(year) {
  const m = String(year || '').match(/\d{4}/);
  return m ? m[0] : '';
}

// Normalise un nom de set pour comparaison : minuscules, sans accents, sans
// ponctuation ni espaces superflus. Sert uniquement de repli quand on ne connaît
// pas la taille de la série.
export function normalizeSetName(set) {
  return String(set || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Identité stable d'une série, indépendante du libellé exact renvoyé par l'IA.
// Deux cartes d'une même série partagent l'année et la taille du set.
// Repli sur le nom normalisé quand la taille est inconnue (numéro sans « /Y »).
export function seriesId(entry) {
  const year = parseYear(entry?.year);
  const total = parseSetTotal(entry?.number);
  if (total) return `y:${year}|t:${total}`;
  return `y:${year}|s:${normalizeSetName(entry?.set)}`;
}

// Identité d'un emplacement dans la collection (= une carte précise d'une série).
// Re-scanner la même carte retombe sur le même emplacement au lieu d'un doublon.
export function cardSlotId(entry) {
  const num = parseCardNumber(entry?.number);
  const numKey = num != null ? `#${num}` : `n:${normalizeSetName(entry?.name)}`;
  return `${seriesId(entry)}|${numKey}`;
}

// Choisit le libellé d'affichage d'une série parmi les variantes rencontrées :
// le nom le plus fréquent, puis le plus long en cas d'égalité (« Expédition de
// base » l'emporte sur « Expédition »).
export function pickSetName(items) {
  const counts = new Map();
  for (const it of items) {
    const name = (it.set || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = 'Série inconnue';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
