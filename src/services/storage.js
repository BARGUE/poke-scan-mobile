import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'pokemon_scan_history';
const COLLECTION_KEY = 'pokemon_collection';

export async function saveToHistory(card, prices, imageUri) {
  try {
    const existing = await getHistory();
    const bestSource = prices[prices.bestDeal];
    const entry = {
      id: Date.now().toString(),
      name: card.name,
      nameEn: card.nameEn,
      emoji: card.emoji,
      set: card.set,
      number: card.number,
      rarity: card.rarity,
      type: card.type,
      hp: card.hp,
      year: card.year,
      condition: card.condition,
      imageUri,
      prices,
      bestPrice: bestSource?.mid,
      bestCurrency: bestSource?.currency,
      bestSource: prices.bestDeal,
      scannedAt: new Date().toISOString(),
    };
    const updated = [entry, ...existing].slice(0, 50);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    // La collection est un stockage permanent : on y ajoute aussi la carte,
    // indépendamment de l'historique (qui, lui, est limité et effaçable).
    await addToCollection(entry);
    return entry;
  } catch (e) {
    console.error('Erreur sauvegarde historique', e);
  }
}

// --- Collection (album permanent) ---------------------------------------
// Identité d'un emplacement : série + année + numéro. Re-scanner la même
// carte met à jour l'emplacement au lieu d'en créer un doublon.
function collectionKey(entry) {
  const set = entry.set || 'Série inconnue';
  const year = entry.year || '';
  const num = (entry.number || entry.name || entry.id || '').toString().trim();
  return `${set}__${year}__${num}`;
}

export async function getCollection() {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function addToCollection(entry) {
  try {
    const existing = await getCollection();
    const key = collectionKey(entry);
    const filtered = existing.filter(e => collectionKey(e) !== key);
    const updated = [entry, ...filtered];
    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erreur sauvegarde collection', e);
  }
}

export async function removeFromCollection(id) {
  const existing = await getCollection();
  const updated = existing.filter(item => item.id !== id);
  await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
}

export async function clearCollection() {
  await AsyncStorage.removeItem(COLLECTION_KEY);
}

export async function getHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function clearHistory() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

export async function deleteFromHistory(id) {
  const existing = await getHistory();
  const updated = existing.filter(item => item.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}
