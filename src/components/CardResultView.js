import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, RADIUS, SHADOWS, RARITY_COLORS } from '../theme';
import { useTheme } from '../ThemeContext';

// Construit l'URL de recherche de la carte sur le site marchand.
// On ne connaît pas l'ID produit exact, donc on ouvre une recherche
// pré-remplie avec le nom + numéro de la carte.
function buildSourceUrl(sourceId, card, marketCurrency = 'EUR') {
  if (!card) return null;
  const number = (card.number || '').split('/')[0].trim();
  if (sourceId === 'cardmarket') {
    const q = [card.nameEn || card.name, number].filter(Boolean).join(' ');
    return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`;
  }
  if (sourceId === 'ebay') {
    const q = [card.nameEn || card.name, card.number, 'pokemon'].filter(Boolean).join(' ');
    const domain = marketCurrency === 'USD' ? 'ebay.com' : 'ebay.fr';
    return `https://www.${domain}/sch/i.html?_nkw=${encodeURIComponent(q)}`;
  }
  if (sourceId === 'tcgplayer') {
    const q = [card.nameEn || card.name, number].filter(Boolean).join(' ');
    return `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(q)}`;
  }
  return null;
}

async function openSource(url) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Impossible d\'ouvrir le lien', 'Aucune application disponible pour ouvrir cette page.');
  }
}

export default function CardResultView({
  card, prices, imageUri, onClose,
  footerLabel, footerIcon = 'scan-outline', onFooterPress,
}) {
  const insets = useSafeAreaInsets();
  const { colors, formatPrice } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const TrendIcon = ({ trend }) => {
    if (trend === 'up') return <Text style={{ color: colors.primary, fontSize: 12 }}>↑</Text>;
    if (trend === 'down') return <Text style={{ color: colors.success, fontSize: 12 }}>↓</Text>;
    return <Text style={{ color: colors.textTertiary, fontSize: 12 }}>→</Text>;
  };

  const RarityBadge = ({ rarity }) => {
    const style = RARITY_COLORS[rarity] || { bg: '#F1EFE8', text: '#444441' };
    return (
      <View style={[styles.badge, { backgroundColor: style.bg }]}>
        <Text style={[styles.badgeText, { color: style.text }]}>{rarity || 'N/A'}</Text>
      </View>
    );
  };

  const PriceRow = ({ label, color, sub, data, isBest, url }) => {
    if (!data) return null;
    return (
      <TouchableOpacity
        style={styles.priceRow}
        onPress={() => openSource(url)}
        disabled={!url}
        activeOpacity={0.6}
      >
        <View style={styles.priceSource}>
          <View style={[styles.sourceDot, { backgroundColor: color }]} />
          <View>
            <Text style={[styles.priceLabel, isBest && { color: colors.success }]}>{label}</Text>
            <Text style={styles.priceSub}>{sub}</Text>
          </View>
        </View>
        <View style={styles.priceValues}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.priceMid, isBest && { color: colors.success }]}>
              {formatPrice(data.mid, data.currency)}
            </Text>
            <TrendIcon trend={data.trend} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.priceRange}>
              {formatPrice(data.low, data.currency)} – {formatPrice(data.high, data.currency)}
            </Text>
            {url && <Ionicons name="open-outline" size={13} color={colors.textTertiary} />}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Les sources affichées dépendent de ce que l'IA a renvoyé : Cardmarket + eBay
  // pour le marché EUR, TCGplayer + eBay (+ Cardmarket) pour le marché USD.
  const SOURCE_ORDER = ['tcgplayer', 'cardmarket', 'ebay'];
  const sourceMeta = {
    tcgplayer: { label: 'TCGplayer', color: colors.tcgplayer, sub: 'Marché US' },
    cardmarket: { label: 'Cardmarket', color: colors.cardmarket, sub: 'Marché EU' },
    ebay: { label: 'eBay', color: colors.ebay },
  };
  const sources = SOURCE_ORDER
    .filter(id => prices?.[id])
    .map(id => {
      const data = prices[id];
      const meta = sourceMeta[id];
      const sub = meta.sub || (data.currency === 'USD' ? 'eBay.com' : 'eBay.fr');
      return { id, label: meta.label, color: meta.color, sub, data, url: buildSourceUrl(id, card, data.currency) };
    });
  const bestSrc = sources.find(s => s.id === prices?.bestDeal) || sources[0];
  // Pour la bannière "Meilleur prix" : on privilégie le lien DIRECT vers la fiche
  // renvoyé par l'IA s'il est valide, sinon on retombe sur la recherche pré-remplie.
  const aiUrl = bestSrc?.data?.url;
  const bestDealUrl = (typeof aiUrl === 'string' && /^https?:\/\//.test(aiUrl)) ? aiUrl : bestSrc?.url;

  return (
    <ScrollView
      style={styles.resultScroll}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
    >
      <View style={styles.resultHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.resultHeaderTitle}>Résultat</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.cardIdentity}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.cardThumb} />
        ) : (
          <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
            <Text style={{ fontSize: 36 }}>{card.emoji || '🃏'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{card.emoji} {card.name}</Text>
          <Text style={styles.cardMeta}>{card.set}</Text>
          <Text style={styles.cardMeta}>{card.number}{card.hp ? ` · ${card.hp} HP` : ''}</Text>
          <RarityBadge rarity={card.rarity} />
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Prix du marché</Text>
        {prices?.estimated && (
          <View style={styles.estimateNote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={styles.estimateNoteText}>
              Estimation indicative : aucune cote de marché trouvée pour cette carte.
            </Text>
          </View>
        )}
        {sources.map(src => (
          <PriceRow key={src.id} {...src} isBest={src.id === prices?.bestDeal} />
        ))}
        {bestSrc && (
          <TouchableOpacity
            style={styles.bestDealBanner}
            onPress={() => openSource(bestDealUrl)}
            disabled={!bestDealUrl}
            activeOpacity={0.7}
          >
            <Ionicons name="star" size={18} color={colors.success} />
            <Text style={styles.bestDealText}>
              Meilleur prix sur <Text style={{ fontWeight: '500' }}>{bestSrc.label}</Text>{' '}
              : <Text style={{ fontWeight: '500' }}>{formatPrice(bestSrc.data?.mid, bestSrc.data?.currency)}</Text>
            </Text>
            {bestDealUrl && <Ionicons name="open-outline" size={16} color={colors.success} />}
          </TouchableOpacity>
        )}
        {!prices?.estimated && prices?.lastUpdated ? (
          <Text style={styles.updatedAt}>Cotes mises à jour le {prices.lastUpdated}</Text>
        ) : null}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Détails de la carte</Text>
        {[
          ['Set', card.set],
          ['Numéro', card.number],
          ['Type', card.type],
          ['HP', card.hp || '—'],
          ['Année', card.year || '—'],
          ['État estimé', card.condition || '—'],
        ].map(([k, v]) => (
          <View key={k} style={styles.detailRow}>
            <Text style={styles.detailKey}>{k}</Text>
            <Text style={styles.detailVal}>{v}</Text>
          </View>
        ))}
      </View>

      {footerLabel && (
        <TouchableOpacity style={[styles.btnPrimary, { marginHorizontal: 16 }]} onPress={onFooterPress}>
          <Ionicons name={footerIcon} size={18} color="#fff" />
          <Text style={styles.btnPrimaryText}>{footerLabel}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  resultScroll: { flex: 1, backgroundColor: COLORS.bg },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', ...SHADOWS.sm },
  resultHeaderTitle: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary },

  cardIdentity: { flexDirection: 'row', gap: 14, marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, ...SHADOWS.sm },
  cardThumb: { width: 80, height: 112, borderRadius: 6 },
  cardThumbPlaceholder: { backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: FONTS.size.lg, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 4 },
  cardMeta: { fontSize: FONTS.size.sm, color: COLORS.textSecondary, lineHeight: 20 },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: 6 },
  badgeText: { fontSize: FONTS.size.xs, fontWeight: '500' },

  sectionCard: { marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, ...SHADOWS.sm },
  sectionTitle: { fontSize: FONTS.size.xs, fontWeight: '500', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },

  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  priceSource: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sourceDot: { width: 10, height: 10, borderRadius: 5 },
  priceLabel: { fontSize: FONTS.size.md, color: COLORS.textPrimary },
  priceSub: { fontSize: FONTS.size.xs, color: COLORS.textSecondary },
  priceValues: { alignItems: 'flex-end' },
  priceMid: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  priceRange: { fontSize: FONTS.size.xs, color: COLORS.textSecondary },

  bestDealBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, padding: 12, marginTop: 12 },
  bestDealText: { fontSize: FONTS.size.sm, color: COLORS.success, flex: 1 },

  estimateNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  estimateNoteText: { fontSize: FONTS.size.xs, color: COLORS.textSecondary, flex: 1, lineHeight: 16 },
  updatedAt: { fontSize: FONTS.size.xs, color: COLORS.textTertiary, marginTop: 10, textAlign: 'center' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  detailKey: { fontSize: FONTS.size.sm, color: COLORS.textSecondary },
  detailVal: { fontSize: FONTS.size.sm, color: COLORS.textPrimary, fontWeight: '500' },

  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 14, paddingHorizontal: 24 },
  btnPrimaryText: { color: '#fff', fontSize: FONTS.size.md, fontWeight: '500' },
});
