import { io } from 'socket.io-client';
import { Platform } from 'react-native';
import { getState, setState, showToast, findUser, dmTitle } from './store';
import { playSound } from './sounds';
import { translate, resolveLanguage } from './i18n';

let socket = null;

export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export const normalizeUrl = (url) => url.trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/, 'http://');

export async function request(method, path, body, { serverUrl, token } = {}) {
  const s = getState();
  const base = normalizeUrl(serverUrl ?? s.serverUrl);
  const auth = token ?? s.token;
  let res;
  try {
    res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth && path !== '/me' && !path.startsWith('/auth')) logout();
    throw new ApiError(data.error || 'unknown', res.status);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  patch: (p, b) => request('PATCH', p, b || {}),
  del: (p, b) => request('DELETE', p, b),
};

export async function checkServer(url) {
  try {
    const res = await fetch(`${normalizeUrl(url)}/api/health`);
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

// ---------- Sitzung ----------

export async function login(username, password) {
  const data = await request('POST', '/auth/login', { username, password });
  await startSession(data.token);
}

export async function register(username, displayName, password) {
  const data = await request('POST', '/auth/register', { username, displayName, password });
  await startSession(data.token);
}

export async function startSession(token) {
  setState({ token });
  const data = await request('GET', '/bootstrap', null, { token });
  setState({
    me: data.user,
    servers: data.servers,
    dms: data.dms,
    friends: data.friends,
    voiceRooms: data.voice,
    reactionIcons: data.reactionIcons,
    serverIcons: data.serverIcons,
    colors: data.colors,
    messages: {},
    unread: {},
  });
  connectSocket();
}

export function logout() {
  require('./voice/engine').voice.leave();
  socket?.disconnect();
  socket = null;
  setState({ token: null, me: null, servers: [], dms: [], friends: [], messages: {}, voiceRooms: {}, connected: false, modal: null, screen: null, incomingCall: null, nav: { section: 'home', serverId: null, channelId: null, dmId: null, homeTab: 'friends' } });
}

export function getSocket() {
  return socket;
}

// ---------- Echtzeit ----------

const upsert = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
};

function patchUserEverywhere(s, user) {
  const merge = (m) => (m.id === user.id ? { ...m, ...user } : m);
  return {
    servers: s.servers.map((sv) => (sv.members.some((m) => m.id === user.id) ? { ...sv, members: sv.members.map(merge) } : sv)),
    dms: s.dms.map((d) => (d.members.some((m) => m.id === user.id) ? { ...d, members: d.members.map(merge) } : d)),
    friends: s.friends.map((f) => (f.user.id === user.id ? { ...f, user: { ...f.user, ...user } } : f)),
  };
}

// Eigene Nachrichten sofort anzeigen, auch falls das Echtzeit-Event verspätet kommt.
export function upsertMessage(msg) {
  setMessages(msg.channelId, (items) => (items.some((m) => m.id === msg.id) ? items.map((m) => (m.id === msg.id ? msg : m)) : [...items, msg]));
}

function setMessages(channelId, fn) {
  setState((s) => {
    const cur = s.messages[channelId];
    if (!cur) return null;
    return { messages: { ...s.messages, [channelId]: { ...cur, items: fn(cur.items) } } };
  });
}

function notify(msg, mentioned) {
  const s = getState();
  const t = (k, v) => translate(resolveLanguage(s.settings.language), k, v);
  if (s.me?.status === 'dnd') return;
  playSound(mentioned ? 'mention' : 'message');
  if (!s.settings.desktopNotifications || Platform.OS !== 'web' || typeof Notification === 'undefined') return;
  if (typeof document !== 'undefined' && document.hasFocus()) return;
  const dm = s.dms.find((d) => d.id === msg.channelId);
  const title = dm ? dmTitle(dm, s.me.id) : msg.author?.displayName || t('appName');
  const show = () => new Notification(title, { body: `${msg.author?.displayName}: ${msg.content.slice(0, 120)}`, silent: true });
  if (Notification.permission === 'granted') show();
  else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && show());
}

function connectSocket() {
  const s = getState();
  socket?.disconnect();
  socket = io(normalizeUrl(s.serverUrl), { auth: { token: s.token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });

  socket.on('connect', async () => {
    setState({ connected: true });
    // Nach einem Verbindungsabbruch den Stand neu laden.
    try {
      const data = await request('GET', '/bootstrap');
      setState({ me: data.user, servers: data.servers, dms: data.dms, friends: data.friends, voiceRooms: data.voice });
    } catch {}
  });
  socket.on('disconnect', () => setState({ connected: false }));
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') logout();
  });

  socket.on('me:update', (me) => setState({ me }));
  socket.on('user:update', (user) => setState((st) => patchUserEverywhere(st, user)));

  socket.on('server:upsert', (server) => setState((st) => ({ servers: upsert(st.servers, server) })));
  socket.on('server:remove', ({ id }) =>
    setState((st) => ({
      servers: st.servers.filter((x) => x.id !== id),
      nav: st.nav.serverId === id ? { ...st.nav, section: 'home', serverId: null, channelId: null } : st.nav,
    }))
  );

  socket.on('dm:upsert', (dm) => setState((st) => ({ dms: upsert(st.dms, dm) })));
  socket.on('dm:remove', ({ id }) =>
    setState((st) => ({
      dms: st.dms.filter((x) => x.id !== id),
      nav: st.nav.dmId === id ? { ...st.nav, dmId: null, homeTab: 'friends' } : st.nav,
    }))
  );

  socket.on('friends:update', (friends) => {
    const before = getState().friends.filter((f) => f.status === 'pending' && f.direction === 'incoming').length;
    setState({ friends });
    const after = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming').length;
    if (after > before && getState().me?.status !== 'dnd') playSound('friendRequest');
  });

  socket.on('message:new', (msg) => {
    const st = getState();
    setMessages(msg.channelId, (items) => (items.some((m) => m.id === msg.id) ? items : [...items, msg]));
    // Tippanzeige des Autors entfernen.
    if (st.typing[msg.channelId]?.[msg.author?.id]) {
      const typing = { ...st.typing, [msg.channelId]: { ...st.typing[msg.channelId] } };
      delete typing[msg.channelId][msg.author.id];
      setState({ typing });
    }
    if (msg.author?.id === st.me?.id) return;
    const viewing = (st.nav.section === 'server' && st.nav.channelId === msg.channelId) || (st.nav.section === 'home' && st.nav.dmId === msg.channelId);
    const focused = typeof document === 'undefined' || document.hasFocus();
    if (!viewing) setState((x) => ({ unread: { ...x.unread, [msg.channelId]: (x.unread[msg.channelId] || 0) + 1 } }));
    const isDm = st.dms.some((d) => d.id === msg.channelId);
    const mentioned = st.me && msg.content.includes(`@${st.me.username}`);
    if ((!viewing || !focused) && (isDm || mentioned)) notify(msg, mentioned);
    // Auch im offenen Chat ein leiser Hinweis, wenn eine Direktnachricht oder Erwähnung ankommt.
    else if ((isDm || mentioned) && st.me?.status !== 'dnd') playSound(mentioned ? 'mention' : 'message');
    if (isDm) setState((x) => ({ dms: x.dms.map((d) => (d.id === msg.channelId ? { ...d, lastActivity: msg.createdAt } : d)) }));
  });
  socket.on('message:update', (msg) => setMessages(msg.channelId, (items) => items.map((m) => (m.id === msg.id ? msg : m))));
  socket.on('message:delete', ({ id, channelId }) => setMessages(channelId, (items) => items.filter((m) => m.id !== id)));

  socket.on('typing', ({ channelId, userId }) => {
    setState((st) => ({ typing: { ...st.typing, [channelId]: { ...(st.typing[channelId] || {}), [userId]: Date.now() } } }));
  });

  socket.on('voice:room', ({ roomId, participants }) => {
    const st0 = getState();
    // Kamera/Bildschirm anderer im eigenen Sprachkanal hörbar machen.
    if (require('./voice/engine').voice.roomId === roomId) {
      const before = new Map((st0.voiceRooms[roomId] || []).map((p) => [p.socketId, p]));
      for (const p of participants) {
        const old = before.get(p.socketId);
        if (!old || p.socketId === socket.id) continue;
        if (p.video !== old.video) playSound(p.video ? 'cameraOn' : 'cameraOff');
        if (p.screen !== old.screen) playSound(p.screen ? 'screenOn' : 'screenOff');
      }
    }
    // Anrufer hat aufgelegt, bevor man angenommen hat.
    if (!participants.length && st0.incomingCall?.dmId === roomId) setState({ incomingCall: null });
    setState((st) => {
      const voiceRooms = { ...st.voiceRooms };
      if (participants.length) voiceRooms[roomId] = participants;
      else delete voiceRooms[roomId];
      return { voiceRooms };
    });
  });

  socket.on('call:ring', ({ dmId, caller }) => {
    const { voice } = require('./voice/engine');
    if (voice.roomId === dmId) return;
    setState({ incomingCall: { dmId, caller } });
    setTimeout(() => {
      if (getState().incomingCall?.dmId === dmId) setState({ incomingCall: null });
    }, 30000);
  });

  require('./voice/engine').voice.attachSocket(socket);
}

export function sendTyping(channelId) {
  if (getState().settings.sendTyping) socket?.emit('typing', { channelId });
}

export async function loadMessages(channelId, older = false) {
  const s = getState();
  const cur = s.messages[channelId];
  if (cur && !older) return;
  const before = older && cur?.items[0] ? `&before=${cur.items[0].createdAt}` : '';
  const items = await api.get(`/channels/${channelId}/messages?limit=50${before}`);
  setState((st) => {
    const existing = st.messages[channelId]?.items || [];
    const merged = older ? [...items, ...existing] : items;
    return { messages: { ...st.messages, [channelId]: { items: merged, hasMore: items.length === 50, loaded: true } } };
  });
}

export async function openDm(userIds, extra = {}) {
  const dm = await api.post('/dms', { userIds, ...extra });
  setState((st) => ({ dms: upsert(st.dms, dm) }));
  const { navigate } = require('./store');
  navigate({ section: 'home', dmId: dm.id, homeTab: 'dm' });
  return dm;
}

export { showToast, findUser };
