import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from './theme';

const SCHEME_KEY = 'pref_color_scheme';   // 'system' | 'light' | 'dark'
const CURRENCY_KEY = 'pref_currency';     // 'EUR' | 'USD'

// Le réglage de devise ne sert qu'à choisir le marché interrogé au scan
// (EUR -> Cardmarket, USD -> TCGplayer). Les prix sont ensuite affichés dans la
// devise où ils ont été détectés, sans reconversion : changer le réglage ne
// modifie donc pas les prix déjà obtenus.
const LOCALES = { EUR: 'fr-FR', USD: 'en-US' };

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [scheme, setSchemeState] = useState('system');
  const [currency, setCurrencyState] = useState('EUR');

  useEffect(() => {
    AsyncStorage.multiGet([SCHEME_KEY, CURRENCY_KEY]).then(entries => {
      const map = Object.fromEntries(entries);
      if (map[SCHEME_KEY]) setSchemeState(map[SCHEME_KEY]);
      if (map[CURRENCY_KEY]) setCurrencyState(map[CURRENCY_KEY]);
    });
  }, []);

  const setScheme = useCallback((next) => {
    setSchemeState(next);
    AsyncStorage.setItem(SCHEME_KEY, next);
  }, []);

  const setCurrency = useCallback((next) => {
    setCurrencyState(next);
    AsyncStorage.setItem(CURRENCY_KEY, next);
  }, []);

  const isDark = scheme === 'system' ? systemScheme !== 'light' : scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  // On affiche chaque prix dans la devise où il a été détecté (srcCurrency),
  // sans le reconvertir vers le réglage courant. Le réglage de devise n'agit
  // qu'au moment du scan, pour choisir le marché interrogé.
  const formatPrice = useCallback((val, srcCurrency = 'EUR') => {
    if (val == null) return '—';
    return new Intl.NumberFormat(LOCALES[srcCurrency] || 'fr-FR', {
      style: 'currency', currency: srcCurrency, minimumFractionDigits: 2,
    }).format(val);
  }, []);

  const value = useMemo(() => ({
    scheme, isDark, colors,
    setScheme,
    currency, setCurrency,
    formatPrice,
  }), [scheme, isDark, colors, setScheme, currency, setCurrency, formatPrice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  return ctx;
}
