import AsyncStorage from '@react-native-async-storage/async-storage';
import { cardSlotId, setIdOf } from '../utils/collection';

const HISTORY_KEY = 'pokemon_scan_history';
const COLLECTION_KEY = 'pokemon_collection';

export async function saveToHistory(card, prices, imageUri) {
  try {
    const existing = await getHistory();
    const bestSource = prices[prices.bestDeal];
    // Set confirmé par l'API (cf. prices.js) : quand on l'a, il fournit une année
    // de sortie fiable. Le libellé affiché reste celui de l'IA (français).
    const matchedSet = prices?.matchedSet || null;
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
      year: matchedSet?.year || card.year,
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
    // La collection est un album permanent (non limité, distinct de l'historique).
    // On n'y range la carte que si l'API a CONFIRMÉ son set (matchedSet) : sans
    // ça on ne connaît ni le bon nom de set ni la taille de la grille.
    if (matchedSet) await addToCollection(entry);
    return entry;
  } catch (e) {
    console.error('Erreur sauvegarde historique', e);
  }
}

// --- Collection (album permanent par set) -------------------------------
// L'identité d'un emplacement (set officiel + numéro, cf. utils/collection.js)
// ignore les variations de libellé : re-scanner la même carte met à jour
// l'emplacement au lieu de créer un doublon.

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

// Retire toutes les cartes d'un set (identifié par son id officiel).
export async function removeSetFromCollection(setId) {
  const existing = await getCollection();
  const updated = existing.filter(item => setIdOf(item) !== setId);
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
