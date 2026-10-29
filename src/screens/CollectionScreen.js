import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, RefreshControl, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getCollection, removeFromCollection, removeSetFromCollection } from '../services/storage';
import { entrySet, parseCardNumber } from '../utils/collection';
import { toEur } from '../services/prices';
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
    if (!groups[set.id]) groups[set.id] = { set: {}, items: [] };
    // Les anciens scans n'ont ni série ni symbole : on complète les infos du set
    // avec celles de n'importe quelle carte du même set qui les possède.
    const group = groups[set.id];
    for (const [k, v] of Object.entries(set)) {
      if (group.set[k] == null || group.set[k] === '') group.set[k] = v;
    }
    group.items.push(item);
  }

  return Object.values(groups)
    .map(({ set, items }) => {
      // Carte la plus récente pour chaque numéro (collection anté-chronologique).
      // Les cartes sans numéro lisible n'ont pas de case dans la grille : on les
      // garde à part pour les afficher à la suite (elles étaient invisibles).
      const byNumber = new Map();
      const unnumbered = [];
      let maxNum = 0;
      for (const item of items) {
        const n = parseCardNumber(item.number);
        if (n != null) {
          if (!byNumber.has(n)) byNumber.set(n, item);
          if (n > maxNum) maxNum = n;
        } else {
          unnumbered.push(item);
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
        slots.push(...unnumbered.map(card => ({ number: null, card })));
      } else {
        // Taille inconnue/aberrante : on n'affiche que les cartes découvertes.
        slots = [...items]
          .sort((a, b) => (parseCardNumber(a.number) ?? 1e9) - (parseCardNumber(b.number) ?? 1e9))
          .map(item => ({ number: parseCardNumber(item.number), card: item }));
      }

      const owned = slots.filter(s => s.card).map(s => s.card);
      return {
        key: set.id,
        title: set.name || 'Set inconnu',
        series: set.series || 'Autres séries',
        code: set.code || '',
        symbol: set.symbol || null,
        year: set.year || '',
        total: total || items.length,
        // Progression = cases numérotées remplies (les cartes sans numéro ne
        // comptent pas dans « X / total »).
        discovered: total > 0 && total <= 500 ? byNumber.size : owned.length,
        cardCount: owned.length,
        valueEur: owned.reduce((sum, c) => sum + toEur(c.bestPrice, c.bestCurrency), 0),
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

// Regroupe les extensions par série (« Scarlet & Violet », « Sword & Shield »…)
// et aplatit le tout pour la FlatList : un en-tête de série suivi de ses sets.
// Les séries les plus récentes viennent en premier (les sets sont déjà triés).
function withSeriesHeaders(sets) {
  const bySeries = new Map();
  for (const set of sets) {
    if (!bySeries.has(set.series)) bySeries.set(set.series, []);
    bySeries.get(set.series).push(set);
  }
  const rows = [];
  for (const [series, list] of bySeries) {
    rows.push({
      kind: 'series',
      key: `series:${series}`,
      title: series,
      setCount: list.length,
      cardCount: list.reduce((n, s) => n + s.cardCount, 0),
    });
    rows.push(...list.map(s => ({ kind: 'set', ...s })));
  }
  return rows;
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
  const { colors, formatPrice } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [collectionCards, setCollectionCards] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState({}); // sets dépliés

  const collection = useMemo(() => buildCollection(collectionCards), [collectionCards]);
  const rows = useMemo(() => withSeriesHeaders(collection), [collection]);
  const totals = useMemo(() => ({
    cards: collection.reduce((n, s) => n + s.cardCount, 0),
    value: collection.reduce((v, s) => v + s.valueEur, 0),
  }), [collection]);

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
      `Supprimer « ${set.title} » et ses ${set.cardCount} carte(s) de votre collection ?`,
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

      {collection.length > 0 && (
        <View style={styles.statsRow}>
          {[
            [totals.cards, 'Cartes'],
            [collection.length, 'Sets'],
            // Valeur en euros : les cotes USD sont converties (approximation).
            [formatPrice(totals.value, 'EUR'), 'Valeur estimée', colors.success],
          ].map(([value, label, color]) => (
            <View key={label} style={styles.statCard}>
              <Text style={[styles.statValue, color && { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={row => row.key}
        renderItem={({ item: set }) => {
          if (set.kind === 'series') {
            return (
              <View style={styles.seriesHeader}>
                <Text style={styles.seriesTitle} numberOfLines={1}>{set.title}</Text>
                <Text style={styles.seriesMeta}>
                  {set.setCount} set{set.setCount > 1 ? 's' : ''} · {set.cardCount} carte{set.cardCount > 1 ? 's' : ''}
                </Text>
              </View>
            );
          }
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
                {/* Symbole de l'extension : le même que celui imprimé sur la carte. */}
                {set.symbol ? (
                  <Image source={{ uri: set.symbol }} style={styles.setSymbol} resizeMode="contain" />
                ) : null}
                <View style={styles.sectionTitleWrap}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle} numberOfLines={1}>{set.title}</Text>
                    {!!set.code && (
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeBadgeText}>{set.code}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sectionYear}>
                    {[set.year, formatPrice(set.valueEur, 'EUR')].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, (set.discovered / set.total) * 100)}%` }]} />
                  </View>
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
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceSecondary, marginTop: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: COLORS.success },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 12, ...SHADOWS.sm },
  statValue: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: FONTS.size.xs, color: COLORS.textSecondary },
  sectionCount: { fontSize: FONTS.size.xs, fontWeight: '500', color: COLORS.textTertiary },
  sectionDelete: { padding: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setSymbol: { width: 22, height: 22 },
  codeBadge: { backgroundColor: COLORS.surfaceSecondary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  codeBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.textSecondary, letterSpacing: 0.5 },

  seriesHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 14, marginBottom: 2, paddingHorizontal: 4 },
  seriesTitle: { flexShrink: 1, fontSize: FONTS.size.xs, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  seriesMeta: { fontSize: FONTS.size.xs, color: COLORS.textTertiary },

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
