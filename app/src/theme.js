import { useColorScheme } from 'react-native';
import { useStore } from './store';

const PALETTES = {
  dark: {
    bg: '#121318',
    rail: '#0c0d11',
    sidebar: '#17181f',
    panel: '#1d1f27',
    elevated: '#252832',
    input: '#262a35',
    hover: 'rgba(255,255,255,0.06)',
    active: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.07)',
    text: '#eef0f6',
    textMuted: '#a2a7b8',
    textFaint: '#6b7084',
    overlay: 'rgba(5,6,10,0.66)',
    isDark: true,
  },
  midnight: {
    bg: '#000000',
    rail: '#000000',
    sidebar: '#0a0a0d',
    panel: '#111116',
    elevated: '#18181f',
    input: '#1a1a22',
    hover: 'rgba(255,255,255,0.06)',
    active: 'rgba(255,255,255,0.11)',
    border: 'rgba(255,255,255,0.08)',
    text: '#f2f2f7',
    textMuted: '#9c9cab',
    textFaint: '#62626f',
    overlay: 'rgba(0,0,0,0.75)',
    isDark: true,
  },
  light: {
    bg: '#ffffff',
    rail: '#e6e8ef',
    sidebar: '#f2f3f7',
    panel: '#ffffff',
    elevated: '#ffffff',
    input: '#eceef3',
    hover: 'rgba(20,24,40,0.05)',
    active: 'rgba(20,24,40,0.09)',
    border: 'rgba(20,24,40,0.09)',
    text: '#14161f',
    textMuted: '#555b6e',
    textFaint: '#8a90a2',
    overlay: 'rgba(15,18,30,0.45)',
    isDark: false,
  },
};

export const ACCENTS = ['#7c5cff', '#2bb3ff', '#22c993', '#ff8a3d', '#ff4f8b', '#f5c400', '#00c2c7', '#e5484d'];

export const STATUS_COLORS = {
  online: '#23c55e',
  idle: '#f5b400',
  dnd: '#ef4444',
  invisible: '#7b8091',
  offline: '#7b8091',
};

export const DANGER = '#ef4757';
export const SUCCESS = '#23c55e';

export function useTheme() {
  const settings = useStore((s) => s.settings);
  const scheme = useColorScheme();
  const name = settings.theme === 'system' ? (scheme === 'light' ? 'light' : 'dark') : settings.theme;
  const p = PALETTES[name] || PALETTES.dark;
  return {
    ...p,
    name,
    accent: settings.accent,
    accentSoft: settings.accent + '26',
    danger: DANGER,
    success: SUCCESS,
    fs: (n) => Math.round(n * settings.fontScale),
    motion: !settings.reduceMotion,
    compact: settings.compact,
  };
}

// Text auf farbigem Hintergrund lesbar halten.
export function onColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 170 ? '#101218' : '#ffffff';
}
