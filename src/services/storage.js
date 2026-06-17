import AsyncStorage from '@react-native-async-storage/async-storage';
import { cardSlotId } from '../utils/collection';

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
// L'identité d'un emplacement (année + taille de série + numéro) est calculée
// par cardSlotId : elle ignore le libellé exact du set, que l'IA renvoie de
// façon inconsistante. Re-scanner la même carte met à jour l'emplacement au
// lieu de créer un doublon, même si l'IA nomme le set différemment.

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
    const key = cardSlotId(entry);
    const filtered = existing.filter(e => cardSlotId(e) !== key);
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
