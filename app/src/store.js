import { useSyncExternalStore, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_SETTINGS = {
  language: 'system',
  theme: 'dark',
  accent: '#7c5cff',
  fontScale: 1,
  compact: false,
  reduceMotion: false,
  showTimestamps: false,
  enterToSend: true,
  sendTyping: true,
  sounds: true,
  messageSound: true,
  desktopNotifications: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  joinMuted: false,
  userVolumes: {},
};

const initialState = {
  ready: false,
  serverUrl: '',
  token: null,
  me: null,
  servers: [],
  dms: [],
  friends: [],
  voiceRooms: {},
  messages: {}, // channelId -> { items, hasMore, loaded }
  typing: {}, // channelId -> { userId: timestamp }
  unread: {}, // channelId -> count
  reactionIcons: [],
  serverIcons: [],
  colors: [],
  connected: false,
  nav: { section: 'home', serverId: null, channelId: null, dmId: null, homeTab: 'friends' },
  lastChannel: {}, // serverId -> channelId
  settings: DEFAULT_SETTINGS,
  modal: null, // { type, props }
  screen: null, // Vollbild: { type, props }
  toast: null,
  incomingCall: null,
};

let state = initialState;
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(update) {
  const patch = typeof update === 'function' ? update(state) : update;
  if (!patch) return;
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

// Selektor-Hook; flache Gleichheit verhindert unnötige Renders bei abgeleiteten Objekten.
export function useStore(selector) {
  const cache = useRef({ value: undefined, has: false });
  const getSnapshot = useCallback(() => {
    const next = selector(state);
    if (cache.current.has && shallowEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next, has: true };
    return next;
  }, [selector]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ---------- Persistenz ----------

const KEY = 'lodge:v1';

export async function loadPersisted() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : {};
    setState({
      serverUrl: saved.serverUrl || defaultServerUrl(),
      token: saved.token || null,
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      lastChannel: saved.lastChannel || {},
      ready: true,
    });
  } catch {
    setState({ serverUrl: defaultServerUrl(), ready: true });
  }
}

let persistTimer;
subscribe(() => {
  if (!state.ready) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { serverUrl, token, settings, lastChannel } = state;
    AsyncStorage.setItem(KEY, JSON.stringify({ serverUrl, token, settings, lastChannel })).catch(() => {});
  }, 300);
});

function defaultServerUrl() {
  // Beim Bauen festgelegt (z. B. in Vercel unter Environment Variables).
  if (process.env.EXPO_PUBLIC_SERVER_URL) return process.env.EXPO_PUBLIC_SERVER_URL;
  // Im Browser, wenn die Web-App vom Lodge-Server selbst ausgeliefert wird.
  if (typeof window !== 'undefined' && window.location && /^https?:/.test(window.location.protocol)) {
    const { protocol, hostname, port } = window.location;
    if (port === '3000' || window.__LODGE_SERVED__) return `${protocol}//${hostname}:${port}`;
  }
  if (typeof window !== 'undefined' && window.lodgeDesktop?.defaultServerUrl) return window.lodgeDesktop.defaultServerUrl;
  return 'http://localhost:3000';
}

// ---------- Hilfsfunktionen ----------

export function updateSettings(patch) {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}

export function showToast(text, kind = 'info') {
  const id = Date.now();
  setState({ toast: { id, text, kind } });
  setTimeout(() => {
    if (getState().toast?.id === id) setState({ toast: null });
  }, 2600);
}

// Vollbildansichten liegen unter normalen Dialogen, damit z. B. ein Bestätigungsdialog
// die Einstellungen nicht schließt.
const SCREENS = ['settings', 'serverSettings'];

export function openModal(type, props = {}) {
  if (SCREENS.includes(type)) setState({ screen: { type, props }, modal: null });
  else setState({ modal: { type, props } });
}

export function closeModal() {
  setState((s) => (s.modal ? { modal: null } : { screen: null }));
}

export function navigate(patch) {
  setState((s) => {
    const nav = { ...s.nav, ...patch };
    const unread = { ...s.unread };
    const viewed = nav.section === 'server' ? nav.channelId : nav.dmId;
    if (viewed) delete unread[viewed];
    const lastChannel = nav.section === 'server' && nav.serverId && nav.channelId ? { ...s.lastChannel, [nav.serverId]: nav.channelId } : s.lastChannel;
    return { nav, unread, lastChannel };
  });
}

export function findUser(userId) {
  const s = state;
  if (s.me?.id === userId) return s.me;
  for (const f of s.friends) if (f.user.id === userId) return f.user;
  for (const d of s.dms) for (const m of d.members) if (m.id === userId) return m;
  for (const sv of s.servers) for (const m of sv.members) if (m.id === userId) return m;
  return null;
}

export function dmTitle(dm, meId) {
  if (dm.name) return dm.name;
  const others = dm.members.filter((m) => m.id !== meId);
  if (!others.length) return '—';
  return others.map((m) => m.displayName).join(', ');
}
