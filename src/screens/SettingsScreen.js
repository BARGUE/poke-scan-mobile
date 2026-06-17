import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, RADIUS, SHADOWS } from '../theme';
import { useTheme } from '../ThemeContext';

// Sélecteur segmenté générique (un seul choix actif).
function Segmented({ options, value, onChange, styles, colors }) {
  return (
    <View style={styles.segment}>
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={15}
                color={active ? colors.textOnPrimary : colors.textSecondary}
              />
            )}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, scheme, setScheme, currency, setCurrency } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 }}
    >
      <Text style={styles.title}>Réglages</Text>

      {/* Apparence */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apparence</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelWrap}>
            <Ionicons name="contrast-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.settingLabel}>Thème</Text>
          </View>
        </View>
        <Segmented
          styles={styles}
          colors={colors}
          value={scheme}
          onChange={setScheme}
          options={[
            { value: 'light', label: 'Clair', icon: 'sunny-outline' },
            { value: 'dark', label: 'Sombre', icon: 'moon-outline' },
          ]}
        />
        <Text style={styles.settingHint}>
          « Système » suit le réglage clair/sombre de votre téléphone.
        </Text>
      </View>

      {/* Devise */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Devise</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelWrap}>
            <Ionicons name="cash-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.settingLabel}>Marché du scan</Text>
          </View>
        </View>
        <Segmented
          styles={styles}
          colors={colors}
          value={currency}
          onChange={setCurrency}
          options={[
            { value: 'EUR', label: '€ EUR' },
            { value: 'USD', label: '$ USD' },
          ]}
        />
        <Text style={styles.settingHint}>
          Détermine le marché interrogé lors d'un scan : en € les prix viennent du
          marché européen (Cardmarket), en $ du marché US (TCGplayer). Chaque prix
          reste ensuite affiché dans la devise où il a été détecté ; changer ce
          réglage ne reconvertit pas les prix déjà scannés.
        </Text>
      </View>

      {/* Comment ça marche */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Comment ça marche</Text>
        {[
          ['📷', 'Scanner', 'Prenez en photo votre carte ou importez depuis la galerie'],
          ['🤖', 'IA Vision', 'Claude analyse l\'image et identifie le nom, le set et la rareté'],
          ['💰', 'Prix en direct', currency === 'USD'
            ? 'Les prix sont recoupés sur plusieurs sources US (TCGplayer, JustTCG, Pokémon Price Tracker)'
            : 'Les prix sont recoupés sur plusieurs sources européennes (Cardmarket, Pokémon Price Tracker) + JustTCG converti en €'],
          ['🗂️', 'Collection', 'Vos cartes sont rangées dans un album permanent ; re-scanner une carte met à jour sa fiche au lieu de créer un doublon'],
          ['🕘', 'Historique', 'Vos 50 derniers scans avec leur valeur estimée, consultable et effaçable'],
        ].map(([emoji, title, desc]) => (
          <View key={title} style={styles.howRow}>
            <Text style={styles.howEmoji}>{emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.howTitle}>{title}</Text>
              <Text style={styles.howDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Sources de prix */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sources de prix</Text>
        {(currency === 'USD'
          ? [
              ['TCGplayer', colors.tcgplayer, 'Référence du marché US (USD) — via pokemontcg.io'],
              ['JustTCG', colors.justtcg, 'Cotes TCGplayer en temps réel (USD)'],
              ['Pokémon Price Tracker', colors.pokemonpricetracker, 'TCGplayer + eBay agrégés (USD)'],
            ]
          : [
              ['Cardmarket', colors.cardmarket, 'Marché européen (EUR) — via pokemontcg.io'],
              ['Pokémon Price Tracker', colors.pokemonpricetracker, 'Cote CardMarket européenne (EUR)'],
              ['JustTCG', colors.justtcg, 'Cote TCGplayer convertie en euros (≈ EUR)'],
            ]
        ).map(([name, color, desc]) => (
          <View key={name} style={styles.sourceRow}>
            <View style={[styles.sourceDot, { backgroundColor: color }]} />
            <View>
              <Text style={styles.sourceName}>{name}</Text>
              <Text style={styles.sourceDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>Pokémon Scanner v1.0.0</Text>
    </ScrollView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  title: { fontSize: FONTS.size.xxl, fontWeight: '500', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 20 },

  section: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginHorizontal: 16, marginBottom: 16, padding: 16, ...SHADOWS.sm },
  sectionTitle: { fontSize: FONTS.size.xs, fontWeight: '500', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },

  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  settingLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingLabel: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  settingHint: { fontSize: FONTS.size.xs, color: COLORS.textTertiary, lineHeight: 16, marginTop: 10 },

  segment: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: RADIUS.md, padding: 4, gap: 4, borderWidth: 0.5, borderColor: COLORS.border },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: RADIUS.sm },
  segmentItemActive: { backgroundColor: COLORS.primary },
  segmentText: { fontSize: FONTS.size.sm, fontWeight: '500', color: COLORS.textSecondary },
  segmentTextActive: { color: COLORS.textOnPrimary },

  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  howEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
  howTitle: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary, marginBottom: 2 },
  howDesc: { fontSize: FONTS.size.sm, color: COLORS.textSecondary, lineHeight: 18 },

  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: COLORS.border },
  sourceDot: { width: 12, height: 12, borderRadius: 6 },
  sourceName: { fontSize: FONTS.size.md, fontWeight: '500', color: COLORS.textPrimary },
  sourceDesc: { fontSize: FONTS.size.sm, color: COLORS.textSecondary },

  footer: { textAlign: 'center', fontSize: FONTS.size.xs, color: COLORS.textTertiary, marginTop: 8, marginBottom: 20 },
});
