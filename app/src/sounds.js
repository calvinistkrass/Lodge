import { Platform } from 'react-native';
import { getState } from './store';

// Kurze, weiche Töne – synthetisch erzeugt, damit keine Audiodateien nötig sind.
// Jeder Ton: [Frequenz, Start (s), Dauer (s), Lautstärke-Faktor?, Wellenform?]
const PATTERNS = {
  join: [
    [523, 0, 0.09],
    [784, 0.08, 0.14],
  ],
  leave: [
    [784, 0, 0.09],
    [523, 0.08, 0.14],
  ],
  mute: [[440, 0, 0.08]],
  unmute: [[660, 0, 0.08]],
  deafen: [
    [520, 0, 0.07],
    [390, 0.07, 0.11],
  ],
  undeafen: [
    [390, 0, 0.07],
    [520, 0.07, 0.11],
  ],
  cameraOn: [
    [988, 0, 0.05, 0.8, 'triangle'],
    [1319, 0.06, 0.09, 0.8, 'triangle'],
  ],
  cameraOff: [
    [1319, 0, 0.05, 0.8, 'triangle'],
    [988, 0.06, 0.09, 0.8, 'triangle'],
  ],
  screenOn: [
    [587, 0, 0.07],
    [740, 0.07, 0.07],
    [880, 0.14, 0.13],
  ],
  screenOff: [
    [880, 0, 0.07],
    [740, 0.07, 0.07],
    [587, 0.14, 0.13],
  ],
  message: [
    [880, 0, 0.06],
    [1175, 0.05, 0.1],
  ],
  mention: [
    [1047, 0, 0.07],
    [1397, 0.07, 0.07],
    [1760, 0.14, 0.14],
  ],
  friendRequest: [
    [659, 0, 0.08, 0.9, 'triangle'],
    [988, 0.09, 0.08, 0.9, 'triangle'],
    [1319, 0.18, 0.16, 0.9, 'triangle'],
  ],
  ring: [
    [659, 0, 0.18],
    [784, 0.2, 0.18],
    [659, 0.6, 0.18],
    [784, 0.8, 0.18],
  ],
  ringback: [
    [440, 0, 0.9, 0.55],
    [480, 0, 0.9, 0.55],
  ],
  declined: [
    [494, 0, 0.14],
    [392, 0.15, 0.14],
    [330, 0.3, 0.24],
  ],
};

// Welche Einstellung welchen Ton erlaubt.
const MESSAGE_SOUNDS = new Set(['message', 'mention', 'friendRequest']);
const CALL_SOUNDS = new Set(['ring', 'ringback', 'declined']);

export const SOUND_NAMES = Object.keys(PATTERNS);

let ctx;

function allowed(name, force) {
  if (force) return true;
  const s = getState().settings;
  if (MESSAGE_SOUNDS.has(name)) return s.messageSound;
  if (CALL_SOUNDS.has(name)) return s.callSound !== false;
  return s.sounds;
}

export function playSound(name, { force } = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!allowed(name, force)) return;
  const volume = getState().settings.soundVolume ?? 0.7;
  if (volume <= 0) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, start, dur, level = 1, type = 'sine'] of PATTERNS[name] || []) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const peak = 0.17 * volume * level * (type === 'sine' ? 1 : 0.7);
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(peak, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch {}
}

// Wiederholt einen Ton (Klingeln), bis stopLoop aufgerufen wird oder maxMs vergangen sind.
const loops = {};

export function startLoop(name, intervalMs, maxMs = 30000) {
  stopLoop(name);
  playSound(name);
  const timer = setInterval(() => playSound(name), intervalMs);
  const limit = setTimeout(() => stopLoop(name), maxMs);
  loops[name] = { timer, limit };
}

export function stopLoop(name) {
  const l = loops[name];
  if (!l) return;
  clearInterval(l.timer);
  clearTimeout(l.limit);
  delete loops[name];
}
