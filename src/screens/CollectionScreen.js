import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, RefreshControl, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getCollection, removeFromCollection, removeSetFromCollection } from '../services/storage';
import { entrySet, setIdOf, parseCardNumber } from '../utils/collection';
import { FONTS, RADIUS, SHADOWS } from '../theme';
import { useTheme } from '../ThemeContext';
import CardResultView from '../components/CardResultView';

// Regroupe la collection par SET officiel (matchedSet.id). Pour chaque set on
// construit une grille d'emplacements numérotés 1..total que les cartes scannées
// viennent révéler. La taille de la grille est celle imprimée par l'API, étendue
// si une carte porte un numéro plus grand (rares secrètes au-delà du total).
function buildCollection(cards) {
  const groups = {};
  for (const item of cards) {
    const set = entrySet(item);
    if (!set?.id) continue; // sécurité : seules les cartes à set confirmé entrent
    if (!groups[set.id]) groups[set.id] = { set, items: [] };
    groups[set.id].items.push(item);
  }

  return Object.values(groups)
    .map(({ set, items }) => {
      // Carte la plus récente pour chaque numéro (collection anté-chronologique).
      const byNumber = new Map();
      let maxNum = 0;
      for (const item of items) {
        const n = parseCardNumber(item.number);
        if (n != null) {
          if (!byNumber.has(n)) byNumber.set(n, item);
          if (n > maxNum) maxNum = n;
        }
      }

      const printed = Number(set.printedTotal) || 0;
      const total = Math.max(printed, maxNum);

      let slots;
      if (total > 0 && total <= 500) {
        slots = Array.from({ length: total }, (_, i) => {
          const n = i + 1;
          return { number: n, card: byNumber.get(n) || null };
        });
      } else {
        // Taille inconnue/aberrante : on n'affiche que les cartes découvertes.
        slots = [...items]
          .sort((a, b) => (parseCardNumber(a.number) ?? 1e9) - (parseCardNumber(b.number) ?? 1e9))
          .map(item => ({ number: parseCardNumber(item.number), card: item }));
      }

      return {
        key: set.id,
        title: set.name || 'Set inconnu',
        year: set.year || '',
        total: total || items.length,
        discovered: byNumber.size || items.length,
        slots,
      };
    })
    .sort((a, b) => {
      const ya = parseInt(a.year, 10) || 0;
      const yb = parseInt(b.year, 10) || 0;
      if (yb !== ya) return yb - ya;          // sets récents d'abord
      return a.title.localeCompare(b.title);  // puis ordre alphabétique
    });
}

// Disposition de la grille : 4 colonnes, cases au format d'une carte (~0,71).
const GRID_COLS = 4;
const GRID_GAP = 8;
const SCREEN_W = Dimensions.get('window').width;
const SLOT_W = Math.floor((SCREEN_W - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);
const SLOT_H = Math.round(SLOT_W / 0.71);

// Une case de la grille : photo de la carte si découverte, sinon le numéro grisé.
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
  const [expanded, setExpanded] = useState({}); // sets dépliés

  const collection = useMemo(() => buildCollection(collectionCards), [collectionCards]);

  const toggleSet = useCallback((key) => {
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
  const handleRemoveCard = (card) => {
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

  // Supprime un set entier de la collection.
  const handleDeleteSet = (set) => {
    Alert.alert(
      'Supprimer le set',
      `Supprimer « ${set.title} » et ses ${set.discovered} carte(s) de votre collection ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            await removeSetFromCollection(set.key);
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
        keyExtractor={set => set.key}
        renderItem={({ item: set }) => {
          const isOpen = !!expanded[set.key];
          return (
            <View style={styles.seriesBlock}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSet(set.key)}
                onLongPress={() => handleDeleteSet(set)}
                delayLongPress={400}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isOpen ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={colors.textSecondary}
                />
                <View style={styles.sectionTitleWrap}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>{set.title}</Text>
                  {!!set.year && <Text style={styles.sectionYear}>{set.year}</Text>}
                </View>
                <Text style={styles.sectionCount}>{set.discovered}/{set.total}</Text>
                <TouchableOpacity
                  style={styles.sectionDelete}
                  onPress={() => handleDeleteSet(set)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.grid}>
                  {set.slots.map((slot, i) => (
                    <CollectionSlot
                      key={slot.card?.id || `empty-${slot.number}-${i}`}
                      slot={slot}
                      onPress={setSelected}
                      onLongPress={handleRemoveCard}
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
            <Text style={styles.emptySub}>Les cartes dont le set est reconnu sont rangées ici, set par set.</Text>
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
  sectionTitleWrap: { flex: 1 },
  sectionTitle: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  sectionYear: { fontSize: FONTS.size.xs, color: COLORS.textTertiary, marginTop: 1 },
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
  emptySub: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
});
