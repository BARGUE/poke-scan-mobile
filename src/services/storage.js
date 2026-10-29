import AsyncStorage from '@react-native-async-storage/async-storage';
import { cardSlotId, setIdOf } from '../utils/collection';
import { persistImage, deleteImagesIfUnused } from './images';

const HISTORY_KEY = 'pokemon_scan_history';
const COLLECTION_KEY = 'pokemon_collection';
export const HISTORY_LIMIT = 50;

async function readList(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeList(key, list) {
  return AsyncStorage.setItem(key, JSON.stringify(list));
}

// Après une suppression, on efface les photos que plus aucune entrée (ni
// historique ni collection) n'utilise.
async function cleanupImages(removedEntries) {
  const uris = removedEntries.map(e => e.imageUri).filter(Boolean);
  if (!uris.length) return;
  const [history, collection] = await Promise.all([getHistory(), getCollection()]);
  deleteImagesIfUnused(uris, [...history, ...collection].map(e => e.imageUri));
}

export async function saveToHistory(card, prices, imageUri) {
  try {
    const existing = await getHistory();
    const bestSource = prices[prices.bestDeal];
    // Set confirmé par l'API (cf. prices.js) : quand on l'a, il fournit une année
    // de sortie fiable. Le libellé affiché reste celui de l'IA (français).
    const matchedSet = prices?.matchedSet || null;
    const entry = {
      // Date.now() seul peut se répéter si deux scans finissent dans la même ms.
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: card.name,
      nameEn: card.nameEn,
      emoji: card.emoji,
      set: card.set,
      setCode: card.setCode,
      number: card.number,
      rarity: card.rarity,
      type: card.type,
      hp: card.hp,
      year: matchedSet?.year || card.year,
      condition: card.condition,
      imageUri: await persistImage(imageUri),
      prices,
      bestPrice: bestSource?.mid,
      bestCurrency: bestSource?.currency,
      bestSource: prices.bestDeal,
      scannedAt: new Date().toISOString(),
    };
    const updated = [entry, ...existing];
    await writeList(HISTORY_KEY, updated.slice(0, HISTORY_LIMIT));
    // La collection est un album permanent (non limité, distinct de l'historique).
    // On n'y range la carte que si l'API a CONFIRMÉ son set (matchedSet) : sans
    // ça on ne connaît ni le bon nom de set ni la taille de la grille.
    if (matchedSet) await addToCollection(entry);
    // Scans sortis de l'historique (au-delà de la limite) : on libère leur photo
    // si la collection ne l'utilise pas.
    await cleanupImages(updated.slice(HISTORY_LIMIT));
    return entry;
  } catch (e) {
    console.error('Erreur sauvegarde historique', e);
    return null;
  }
}

// --- Collection (album permanent par set) -------------------------------
// L'identité d'un emplacement (set officiel + numéro, cf. utils/collection.js)
// ignore les variations de libellé : re-scanner la même carte met à jour
// l'emplacement au lieu de créer un doublon.

export function getCollection() {
  return readList(COLLECTION_KEY);
}

export async function addToCollection(entry) {
  try {
    const existing = await getCollection();
    const key = cardSlotId(entry);
    const replaced = existing.filter(e => cardSlotId(e) === key);
    const updated = [entry, ...existing.filter(e => cardSlotId(e) !== key)];
    await writeList(COLLECTION_KEY, updated);
    await cleanupImages(replaced);
  } catch (e) {
    console.error('Erreur sauvegarde collection', e);
  }
}

export async function removeFromCollection(id) {
  const existing = await getCollection();
  await writeList(COLLECTION_KEY, existing.filter(item => item.id !== id));
  await cleanupImages(existing.filter(item => item.id === id));
}

// Retire toutes les cartes d'un set (identifié par son id officiel).
export async function removeSetFromCollection(setId) {
  const existing = await getCollection();
  await writeList(COLLECTION_KEY, existing.filter(item => setIdOf(item) !== setId));
  await cleanupImages(existing.filter(item => setIdOf(item) === setId));
}

export async function clearCollection() {
  const existing = await getCollection();
  await AsyncStorage.removeItem(COLLECTION_KEY);
  await cleanupImages(existing);
}

export function getHistory() {
  return readList(HISTORY_KEY);
}

export async function clearHistory() {
  const existing = await getHistory();
  await AsyncStorage.removeItem(HISTORY_KEY);
  await cleanupImages(existing);
}

export async function deleteFromHistory(id) {
  const existing = await getHistory();
  await writeList(HISTORY_KEY, existing.filter(item => item.id !== id));
  await cleanupImages(existing.filter(item => item.id === id));
}
