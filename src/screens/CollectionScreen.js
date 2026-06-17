import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, RefreshControl, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getCollection, removeFromCollection, removeSeriesFromCollection } from '../services/storage';
import { parseCardNumber, parseSetTotal, seriesId, pickSetName } from '../utils/collection';
import { FONTS, RADIUS, SHADOWS } from '../theme';
import { useTheme } from '../ThemeContext';
import CardResultView from '../components/CardResultView';

// Regroupe la collection par série (identité année + taille, indépendante du
// libellé exact renvoyé par l'IA). Pour chaque série on construit une grille
// d'emplacements : si on connaît la taille de la série (format "X/Y"), on génère
// un emplacement par numéro (1..Y) que la carte scannée vient remplir ; sinon on
// n'affiche que les cartes découvertes.
function buildCollection(cards) {
  const groups = {};
  for (const item of cards) {
    const key = seriesId(item);
    if (!groups[key]) groups[key] = { key, items: [] };
    groups[key].items.push(item);
  }

  return Object.values(groups)
    .map(g => {
      const set = pickSetName(g.items);
      const year = g.items.find(it => it.year)?.year || '';
      // Carte la plus récente pour chaque numéro (la collection est anté-chronologique).
      const byNumber = new Map();
      let maxTotal = 0;
      for (const item of g.items) {
        const n = parseCardNumber(item.number);
        if (n != null && !byNumber.has(n)) byNumber.set(n, item);
        const t = parseSetTotal(item.number);
        if (t && t > maxTotal) maxTotal = t;
      }

      let slots;
      // On ne génère la grille complète que si la taille est plausible.
      if (maxTotal > 0 && maxTotal <= 500) {
        slots = Array.from({ length: maxTotal }, (_, i) => {
          const n = i + 1;
          return { number: n, card: byNumber.get(n) || null };
        });
      } else {
        slots = [...g.items]
          .sort((a, b) => (parseCardNumber(a.number) ?? 1e9) - (parseCardNumber(b.number) ?? 1e9))
          .map(item => ({ number: parseCardNumber(item.number), card: item }));
      }

      return {
        key: g.key,
        title: year ? `${set} · ${year}` : set,
        total: maxTotal || g.items.length,
        discovered: byNumber.size || g.items.length,
        year,
        slots,
      };
    })
    .sort((a, b) => {
      const ya = parseInt(a.year, 10) || 0;
      const yb = parseInt(b.year, 10) || 0;
      if (yb !== ya) return yb - ya;          // séries récentes d'abord
      return a.title.localeCompare(b.title);  // puis ordre alphabétique
    });
}

// Disposition de la grille : 4 colonnes, cases au format d'une carte (~0,71).
const GRID_COLS = 4;
const GRID_GAP = 8;
const SCREEN_W = Dimensions.get('window').width;
const SLOT_W = Math.floor((SCREEN_W - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
const SLOT_H = Math.round(SLOT_W / 0.71);

// Une case de la grille : photo de la carte si découverte, sinon le numéro.
function CollectionSlot({ slot, onPress, onLongPress, styles }) {
  const { card, number } = slot;
  if (card) {
    return (
      <TouchableOpacity
        style={styles.slot}
        onPress={() => onPress(card)}
        onLongPress={() => onLongPress(card)}
        delayLongPress={400}
        activeOpacity={0.7}
      >
        {card.imageUri ? (
          <Image source={{ uri: card.imageUri }} style={styles.slotImage} resizeMode="cover" />
        ) : (
          <View style={[styles.slotImage, styles.slotEmpty]}>
            <Text style={{ fontSize: 22 }}>{card.emoji || '🃏'}</Text>
          </View>
        )}
        {number != null && (
          <View style={styles.slotNumBadge}>
            <Text style={styles.slotNumBadgeText}>#{number}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.slot, styles.slotEmpty]}>
      <Text style={styles.slotEmptyNum}>#{number}</Text>
    </View>
  );
}

export default function CollectionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [collectionCards, setCollectionCards] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState({}); // séries dépliées

  const collection = useMemo(() => buildCollection(collectionCards), [collectionCards]);

  const toggleSeries = useCallback((key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const load = useCallback(async () => {
    setCollectionCards(await getCollection());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Retire une carte de la collection.
  const handleRemoveFromCollection = (card) => {
    Alert.alert(
      'Retirer de la collection',
      `Retirer « ${card.name} » de votre collection ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer', style: 'destructive', onPress: async () => {
            await removeFromCollection(card.id);
            await load();
          },
        },
      ],
    );
  };

  // Supprime une série entière de la collection.
  const handleDeleteSeries = (series) => {
    Alert.alert(
      'Supprimer la série',
      `Supprimer « ${series.title} » et ses ${series.discovered} carte(s) de votre collection ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            await removeSeriesFromCollection(series.key);
            await load();
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Collection</Text>
      </View>

      <FlatList
        data={collection}
        keyExtractor={series => series.key}
        renderItem={({ item: series }) => {
          const isOpen = !!expanded[series.key];
          return (
            <View style={styles.seriesBlock}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSeries(series.key)}
                onLongPress={() => handleDeleteSeries(series)}
                delayLongPress={400}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isOpen ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.sectionTitle} numberOfLines={1}>{series.title}</Text>
                <Text style={styles.sectionCount}>{series.discovered}/{series.total}</Text>
                <TouchableOpacity
                  style={styles.sectionDelete}
                  onPress={() => handleDeleteSeries(series)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.grid}>
                  {series.slots.map((slot, i) => (
                    <CollectionSlot
                      key={slot.card?.id || `empty-${slot.number}-${i}`}
                      slot={slot}
                      onPress={setSelected}
                      onLongPress={handleRemoveFromCollection}
                      styles={styles}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗂️</Text>
            <Text style={styles.emptyTitle}>Collection vide</Text>
            <Text style={styles.emptySub}>Les cartes scannées sont rangées ici par série.</Text>
          </View>
        }
      />

      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={styles.modalContainer}>
            <CardResultView
              card={selected}
              prices={selected.prices}
              imageUri={selected.imageUri}
              onClose={() => setSelected(null)}
            />
          </View>
        )}
      </Modal>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  headerTitle: { fontSize: FONTS.size.xxl, fontWeight: '500', color: COLORS.textPrimary },

  list: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },

  seriesBlock: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 12, marginTop: 8, ...SHADOWS.sm },
  sectionTitle: { flex: 1, fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  sectionCount: { fontSize: FONTS.size.xs, fontWeight: '500', color: COLORS.textTertiary },
  sectionDelete: { padding: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingTop: 10 },
  slot: { width: SLOT_W, height: SLOT_H, borderRadius: 6, overflow: 'hidden' },
  slotImage: { width: '100%', height: '100%' },
  slotEmpty: { backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  slotEmptyNum: { fontSize: FONTS.size.sm, fontWeight: '500', color: COLORS.textTertiary },
  slotNumBadge: { position: 'absolute', bottom: 3, left: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  slotNumBadgeText: { fontSize: 10, fontWeight: '500', color: '#fff' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary },
  emptySub: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center' },
});
