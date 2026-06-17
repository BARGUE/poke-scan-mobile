// Traductions FR pour l'affichage. La donnée brute renvoyée par l'IA reste en
// anglais (elle sert aussi à construire les URLs de recherche sur les sites
// marchands) ; on ne traduit qu'au moment de l'affichage.

// États (champ `condition` du prompt : Near Mint|Lightly Played|...).
const CONDITION_FR = {
  'near mint': 'Quasi neuf',
  'lightly played': 'Légèrement joué',
  'moderately played': 'Moyennement joué',
  'heavily played': 'Très joué',
  'damaged': 'Endommagé',
};

// Types Pokémon (et Trainer/Energy).
const TYPE_FR = {
  grass: 'Plante',
  fire: 'Feu',
  water: 'Eau',
  lightning: 'Électrique',
  electric: 'Électrique',
  psychic: 'Psy',
  fighting: 'Combat',
  darkness: 'Obscurité',
  dark: 'Obscurité',
  metal: 'Métal',
  steel: 'Métal',
  dragon: 'Dragon',
  fairy: 'Fée',
  colorless: 'Incolore',
  normal: 'Normal',
  trainer: 'Dresseur',
  energy: 'Énergie',
};

// Cherche une traduction dans la table ; renvoie la valeur d'origine si inconnue.
function lookup(table, value) {
  if (value == null || value === '') return value;
  const key = String(value).trim().toLowerCase();
  return table[key] || value;
}

export function translateCondition(value) {
  return lookup(CONDITION_FR, value);
}

// Formate une date (ISO ou autre format parsable) en JJ/MM/AAAA.
// Renvoie la valeur d'origine si elle n'est pas interprétable comme une date.
export function formatDateFr(value) {
  if (value == null || value === '') return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const jour = String(d.getDate()).padStart(2, '0');
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const annee = d.getFullYear();
  return `${jour}/${mois}/${annee}`;
}

// Le type peut être composé (« Fire/Water », « Water Energy ») : on traduit
// chaque mot reconnu et on conserve les séparateurs.
export function translateType(value) {
  if (value == null || value === '') return value;
  return String(value)
    .split(/(\s*\/\s*|\s+)/)
    .map(part => (/^\s*$|^\s*\/\s*$/.test(part) ? part : lookup(TYPE_FR, part)))
    .join('');
}
