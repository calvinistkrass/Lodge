import { normalizeUrl } from './api';
import { getState } from './store';

// Erkennt Einladungslinks wie lodge://invite/CODE, https://host/invite/CODE oder einen nackten Code.
export function inviteCodeFromUrl(url) {
  const m = /invite\/([A-Za-z0-9_-]+)/.exec(url || '');
  return m ? m[1] : null;
}

export function parseInviteInput(input) {
  const v = (input || '').trim();
  return inviteCodeFromUrl(v) || (/^[A-Za-z0-9_-]{4,}$/.test(v) ? v : null);
}

// Einladungen zeigen auf die Web-App (z. B. deine Vercel-Domain), damit sie im Browser aufgehen.
export function inviteLink(code) {
  const web = process.env.EXPO_PUBLIC_WEB_URL || getState().serverUrl;
  return `${normalizeUrl(web)}/invite/${code}`;
}

const pad = (n) => String(n).padStart(2, '0');

export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDay(ts, t) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return t('common.today');
  if (d.toDateString() === yesterday.toDateString()) return t('common.yesterday');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatStamp(ts, t) {
  return `${formatDay(ts, t)} ${formatTime(ts)}`;
}
