// Palette sombre (thème par défaut historique de l'app).
export const darkColors = {
  primary: '#FF4655',
  primaryDark: '#C8313D',
  primaryLight: 'rgba(255,70,85,0.14)',
  success: '#34D399',
  successLight: 'rgba(52,211,153,0.14)',
  info: '#5AA2F5',
  infoLight: 'rgba(90,162,245,0.14)',
  amber: '#F5B43C',
  amberLight: 'rgba(245,180,60,0.14)',

  bg: '#0B0B10',
  surface: '#16161F',
  surfaceSecondary: '#1F1F2B',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  textPrimary: '#F4F4F7',
  textSecondary: '#9B9BA6',
  textTertiary: '#62626E',
  textOnPrimary: '#FFFFFF',

  cardmarket: '#5AA2F5',
  ebay: '#F5B43C',
  tcgplayer: '#7B61FF',
};

// Palette claire.
export const lightColors = {
  primary: '#FF4655',
  primaryDark: '#C8313D',
  primaryLight: 'rgba(255,70,85,0.12)',
  success: '#0F9D6B',
  successLight: 'rgba(15,157,107,0.12)',
  info: '#2563EB',
  infoLight: 'rgba(37,99,235,0.12)',
  amber: '#D97706',
  amberLight: 'rgba(217,119,6,0.12)',

  bg: '#F4F4F7',
  surface: '#FFFFFF',
  surfaceSecondary: '#ECECF1',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.16)',

  textPrimary: '#1A1A22',
  textSecondary: '#5C5C68',
  textTertiary: '#9B9BA6',
  textOnPrimary: '#FFFFFF',

  cardmarket: '#2563EB',
  ebay: '#D97706',
  tcgplayer: '#6D28D9',
};

// Couleur de marque (Pokéball, accent rouge) — indépendante du thème.
export const BRAND = '#FF4655';

// Compat : export par défaut = palette sombre, pour tout code hors composants.
export const COLORS = darkColors;

export const RARITY_COLORS = {
  'Common': { bg: '#EAF3DE', text: '#27500A' },
  'Uncommon': { bg: '#E6F1FB', text: '#0C447C' },
  'Rare': { bg: '#FAEEDA', text: '#633806' },
  'Holo Rare': { bg: '#EEEDFE', text: '#3C3489' },
  'Ultra Rare': { bg: '#FAECE7', text: '#712B13' },
  'Secret Rare': { bg: '#FBEAF0', text: '#72243E' },
  'Special Illustration Rare': { bg: '#FBEAF0', text: '#4B1528' },
};

export const FONTS = {
  regular: { fontWeight: '400' },
  medium: { fontWeight: '500' },
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    title: 28,
  },
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
};
