// Regroupement de la collection par SET officiel.
//
// Contrairement à l'ancienne approche (heuristique année + taille), on s'appuie
// désormais sur `matchedSet` renvoyé par l'API (cf. services/prices.js) : il
// fournit l'identité officielle du set (id, nom, taille imprimée, année). Une
// carte n'entre dans la collection que lorsque ce set a été CONFIRMÉ — c'est la
// seule façon de connaître le bon nom et la taille exacte de la grille.

// Le set confirmé d'une entrée, ou null si l'API n'a pas tranché l'édition.
export function entrySet(entry) {
  return entry?.prices?.matchedSet || null;
}

// Identité stable d'un set = son id officiel ("sv8pt5").
export function setIdOf(entry) {
  return entrySet(entry)?.id || null;
}

// Numéro de carte ("25/198" -> 25, "TG05/TG30" -> 5, "H1" -> 1).
export function parseCardNumber(number) {
  if (!number) return null;
  const first = String(number).split('/')[0];
  const m = first.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// Identité d'un emplacement = set + numéro. Re-scanner la même carte retombe
// sur le même emplacement (mise à jour) au lieu de créer un doublon.
export function cardSlotId(entry) {
  const setId = setIdOf(entry);
  const num = parseCardNumber(entry?.number);
  return `${setId || 's:?'}#${num != null ? num : 'n:' + (entry?.name || '')}`;
}
