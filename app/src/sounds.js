import { Platform } from 'react-native';
import { getState } from './store';

// Kurze, weiche Töne – synthetisch erzeugt, damit keine Audiodateien nötig sind.
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
  message: [
    [880, 0, 0.06],
    [1175, 0.05, 0.1],
  ],
  ring: [
    [659, 0, 0.18],
    [784, 0.2, 0.18],
    [659, 0.6, 0.18],
    [784, 0.8, 0.18],
  ],
};

let ctx;

export function playSound(name) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const s = getState().settings;
  if (name !== 'message' && name !== 'ring' && !s.sounds) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, start, dur] of PATTERNS[name] || []) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.12, t0 + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch {}
}
