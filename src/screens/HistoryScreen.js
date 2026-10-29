import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, RefreshControl, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getHistory, deleteFromHistory, clearHistory } from '../services/storage';
import { toEur } from '../services/prices';
import { FONTS, RADIUS, SHADOWS, RARITY_COLORS } from '../theme';
import { useTheme } from '../ThemeContext';
import CardResultView from '../components/CardResultView';

const SOURCE_LABELS = { cardmarket: 'Cardmarket', tcgplayer: 'TCGplayer' };

// Normalise pour la recherche : minuscules, sans accents.
function fold(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function HistoryItem({ item, onDelete, onPress }) {
  const { colors, formatPrice } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rarityStyle = RARITY_COLORS[item.rarity] || { bg: '#F1EFE8', text: '#444441' };

  return (
    <TouchableOpacity style={styles.itemCard} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.itemRow}>
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.itemThumb} />
        ) : (
          <View style={[styles.itemThumb, styles.itemThumbPlaceholder]}>
            <Text style={{ fontSize: 26 }}>{item.emoji || '🃏'}</Text>
          </View>
        )}
        <View style={styles.itemMeta}>
          <Text style={styles.itemName} numberOfLines={1}>{item.emoji} {item.name}</Text>
          <Text style={styles.itemSet} numberOfLines={1}>
            {[item.set, item.number].filter(Boolean).join(' · ') || 'Set inconnu'}
          </Text>
          {!!item.rarity && (
            <View style={[styles.badge, { backgroundColor: rarityStyle.bg }]}>
              <Text style={[styles.badgeText, { color: rarityStyle.text }]}>{item.rarity}</Text>
            </View>
          )}
          <Text style={styles.itemDate}>{formatDate(item.scannedAt)}</Text>
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>
            {item.prices?.estimated ? '≈ ' : ''}{formatPrice(item.bestPrice, item.bestCurrency)}
          </Text>
          <Text style={styles.itemPriceSub}>{SOURCE_LABELS[item.bestSource] || item.bestSource}</Text>
          <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, formatPrice } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [currencyFilter, setCurrencyFilter] = useState('all'); // 'all' | 'EUR' | 'USD'
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setHistory(await getHistory());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDelete = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette carte de l\'historique ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          await deleteFromHistory(id);
          await load();
        },
      },
    ]);
  };

  const handleClear = () => {
    Alert.alert('Vider l\'historique', 'Supprimer toutes les cartes de l\'historique ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Vider', style: 'destructive', onPress: async () => {
          await clearHistory();
          setHistory([]);
        },
      },
    ]);
  };

  // Filtre par devise de détection (€ Cardmarket / $ TCGplayer) puis par texte
  // (nom FR/EN, set, numéro).
  const filteredHistory = useMemo(() => {
    const q = fold(query.trim());
    return history.filter(item =>
      (currencyFilter === 'all' || (item.bestCurrency || 'EUR') === currencyFilter)
      && (!q || fold([item.name, item.nameEn, item.set, item.number].join(' ')).includes(q))
    );
  }, [history, currencyFilter, query]);

  // Valeur estimée des cartes affichées. Si un filtre devise est actif, toutes
  // les cartes sont dans la même devise : on somme et on affiche tel quel. En
  // « Tous », les devises sont mélangées : on ramène chaque valeur en euros.
  const totalCurrency = currencyFilter === 'all' ? 'EUR' : currencyFilter;
  const totalValue = filteredHistory.reduce((sum, item) => {
    const v = item.bestPrice || 0;
    return sum + (currencyFilter === 'all' ? toEur(v, item.bestCurrency) : v);
  }, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Historique</Text>
        {history.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearBtn}>Vider</Text>
          </TouchableOpacity>
        )}
      </View>

      {history.length > 0 && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{filteredHistory.length}</Text>
              <Text style={styles.statLabel}>Cartes scannées</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {formatPrice(totalValue, totalCurrency)}
              </Text>
              <Text style={styles.statLabel}>Valeur estimée</Text>
            </View>
          </View>

          <View style={styles.segment}>
            {[
              { value: 'all', label: 'Tous' },
              { value: 'EUR', label: '€ EUR' },
              { value: 'USD', label: '$ USD' },
            ].map(opt => {
              const active = opt.value === currencyFilter;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => setCurrencyFilter(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher une carte, un set…"
              placeholderTextColor={colors.textTertiary}
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        </>
      )}

      <FlatList
        data={filteredHistory}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <HistoryItem item={item} onDelete={handleDelete} onPress={setSelected} />
        )}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🃏</Text>
            {history.length > 0 ? (
              <>
                <Text style={styles.emptyTitle}>Aucun résultat</Text>
                <Text style={styles.emptySub}>Aucun scan ne correspond à ces filtres.</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Aucune carte scannée</Text>
                <Text style={styles.emptySub}>Vos scans apparaîtront ici après analyse.</Text>
              </>
            )}
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
  clearBtn: { fontSize: FONTS.size.md, color: COLORS.primary },

  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, ...SHADOWS.sm },
  statValue: { fontSize: FONTS.size.xl, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: FONTS.size.xs, color: COLORS.textSecondary },

  segment: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, gap: 4, marginHorizontal: 16, marginBottom: 12, borderWidth: 0.5, borderColor: COLORS.border },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: RADIUS.sm },
  segmentItemActive: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: FONTS.size.sm, fontWeight: '500', color: COLORS.textSecondary },
  segmentTextActive: { color: COLORS.textOnPrimary },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, paddingHorizontal: 12, marginHorizontal: 16, marginBottom: 12, borderWidth: 0.5, borderColor: COLORS.border },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: FONTS.size.md, color: COLORS.textPrimary },

  list: { paddingHorizontal: 16, gap: 10, paddingTop: 4 },

  itemCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 14, ...SHADOWS.sm },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  itemThumb: { width: 56, height: 78, borderRadius: 6 },
  itemThumbPlaceholder: { backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  itemMeta: { flex: 1, gap: 2 },
  itemName: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  itemSet: { fontSize: FONTS.size.sm, color: COLORS.textSecondary },
  itemDate: { fontSize: FONTS.size.xs, color: COLORS.textTertiary, marginTop: 4 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemPrice: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.success },
  itemPriceSub: { fontSize: FONTS.size.xs, color: COLORS.textTertiary },
  deleteBtn: { marginTop: 8, padding: 4 },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '500' },

  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary },
  emptySub: { fontSize: FONTS.size.md, color: COLORS.textSecondary, textAlign: 'center' },
});
