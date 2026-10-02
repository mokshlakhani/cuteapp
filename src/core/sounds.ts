import { audio } from './audio';
import { clamp, lerp, rand } from './math';

/**
 * The sound vocabulary of soft spot.
 *
 * Rooms never build sounds from raw oscillators; they speak these words.
 * Every pitched sound is snapped to the same F-major pentatonic scale the
 * ambient music is written in, so toys always harmonise with the music and
 * with each other — nothing ever sounds "wrong", even when mashing.
 */

const PENTA = [0, 2, 4, 7, 9];
const ROOT_MIDI = 53; // F3

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Frequency of the n-th note of the shared pentatonic scale (0 = F3). */
export function scale(n: number) {
  const i = Math.round(n);
  const oct = Math.floor(i / 5);
  const deg = ((i % 5) + 5) % 5;
  return midiHz(ROOT_MIDI + oct * 12 + PENTA[deg]);
}

const lastAt: Record<string, number> = {};
/** Tiny per-word rate limit so collisions never machine-gun. */
function gate(word: string, ms: number) {
  const now = performance.now();
  if (now - (lastAt[word] ?? 0) < ms) return false;
  lastAt[word] = now;
  return true;
}

export const ui = {
  /** Soft rounded button press. */
  tap(pan = 0) {
    audio.tone({ freq: scale(12), to: scale(13), glide: 0.06, decay: 0.09, gain: 0.07, pan, reverb: 0.15 });
  },
  toggle(on: boolean) {
    audio.tone({ freq: scale(on ? 11 : 13), to: scale(on ? 13 : 11), glide: 0.07, decay: 0.12, gain: 0.07, reverb: 0.2 });
  },
  /** Moving between rooms: a breathy swell plus two soft bell notes. */
  whoosh(forward = true) {
    audio.noise({
      dur: 0.45,
      attack: 0.12,
      gain: 0.05,
      filter: 'bandpass',
      freq: forward ? 500 : 1600,
      to: forward ? 1800 : 450,
      q: 0.7,
      reverb: 0.4,
    });
    const a = forward ? 10 : 12;
    const b = forward ? 12 : 10;
    audio.tone({ freq: scale(a), decay: 0.6, gain: 0.04, reverb: 0.6, delay: 0.05 });
    audio.tone({ freq: scale(b), decay: 0.8, gain: 0.04, reverb: 0.6, delay: 0.16 });
  },
  sheet(open: boolean) {
    audio.noise({ dur: 0.18, gain: 0.035, filter: 'bandpass', freq: open ? 700 : 1400, to: open ? 1400 : 700, q: 0.9 });
  },
};

export const material = {
  /** Rubbery bounce. size: radius in px, strength 0..1. */
  boop(size: number, strength: number, pan = 0) {
    if (!gate('boop', 45)) return;
    const s = clamp(strength, 0, 1);
    const n = clamp(Math.round(lerp(12, 5, clamp((size - 20) / 90, 0, 1))), 4, 13);
    const f = scale(n);
    audio.tone({ freq: f * 1.25, to: f, glide: 0.07, decay: 0.12 + s * 0.08, gain: 0.05 + s * 0.12, pan, reverb: 0.15, attack: 0.004 });
  },
  /** Soft collision between two soft things. */
  plop(size: number, strength: number, pan = 0) {
    if (!gate('plop', 60)) return;
    const s = clamp(strength, 0, 1);
    const n = clamp(Math.round(lerp(10, 4, clamp((size - 20) / 90, 0, 1))), 3, 11);
    const f = scale(n);
    audio.tone({ freq: f, to: f * 0.7, glide: 0.1, decay: 0.12, gain: 0.04 + s * 0.09, pan, reverb: 0.12 });
    audio.noise({ dur: 0.04, gain: 0.02 + s * 0.03, filter: 'lowpass', freq: 1400, pan });
  },
  /** A heavier, warm landing. */
  thump(strength: number, pan = 0) {
    if (!gate('thump', 70)) return;
    const s = clamp(strength, 0, 1);
    audio.tone({ freq: 120, to: 62, glide: 0.12, decay: 0.18, gain: 0.12 + s * 0.16, pan, attack: 0.003 });
    audio.noise({ dur: 0.06, gain: 0.03 + s * 0.04, filter: 'lowpass', freq: 600, pan });
  },
  /** A small, kind "pop" — things appearing or disappearing. */
  pop(pitch = 0.5, pan = 0, delay = 0) {
    const f = scale(Math.round(lerp(9, 15, pitch)));
    audio.tone({ freq: f * 0.8, to: f * 1.4, glide: 0.05, decay: 0.08, gain: 0.07, pan, reverb: 0.2, delay });
  },
  /** A tiny glint of bells for gentle "ta-da" moments. */
  sparkle(pan = 0) {
    const base = 14 + Math.floor(rand(0, 3));
    [0, 2, 4].forEach((step, i) => audio.tone({ freq: scale(base + step), decay: 0.5, gain: 0.035, pan, reverb: 0.6, delay: i * 0.07 }));
  },

  // ——— elastic family (rubber bands) ———

  /**
   * A rubber band snapping on. tension 0..1 changes the character:
   * low = soft high twang, mid = tighter, high = deeper and more resonant.
   */
  twang(tension: number, pan = 0) {
    const t = clamp(tension, 0, 1);
    // Climb the scale while tension builds, then sink lower as it gets heavy.
    const climb = t < 0.6 ? lerp(5, 9, t / 0.6) : lerp(9, 3, (t - 0.6) / 0.4);
    const f = scale(Math.round(climb + rand(-0.5, 0.5)));
    audio.pluck({
      freq: f,
      sustain: 0.35 + t * 0.4,
      brightness: 0.35 + t * 0.25,
      bend: 1.12 - t * 0.04,
      gain: 0.32,
      pan,
      lowpass: 2600 + t * 1400,
    });
    // The band slapping the rind: a soft body thud.
    audio.tone({ freq: 150 - t * 40, to: 80, glide: 0.08, decay: 0.1, gain: 0.08 + t * 0.06, pan });
    if (t > 0.45) {
      // Deep resonant body that grows with tension.
      audio.pluck({
        freq: scale(-3) * (1 - (t - 0.45) * 0.15),
        sustain: 0.8,
        brightness: 0.15,
        bend: 1.03,
        gain: 0.12 + (t - 0.45) * 0.35,
        pan,
        lowpass: 900,
      });
    }
  },
  /** Quiet strain. intensity 0..1. */
  creak(intensity: number, pan = 0) {
    const k = clamp(intensity, 0, 1);
    audio.creak({
      dur: 0.35 + k * 0.5,
      rate: 26 + k * 40,
      rateEnd: 14 + k * 20,
      freq: 520 + rand(-60, 60) + k * 160,
      gain: 0.05 + k * 0.1,
      pan,
    });
  },
  /** The big, soft, satisfying release. */
  burst(pan = 0) {
    audio.tone({ freq: 140, to: 38, glide: 0.35, decay: 0.45, gain: 0.42, pan, attack: 0.002 });
    audio.noise({ dur: 0.35, gain: 0.22, filter: 'lowpass', freq: 3200, to: 300, pan, reverb: 0.35, attack: 0.002 });
    audio.noise({ dur: 0.05, gain: 0.12, filter: 'bandpass', freq: 2200, q: 1.4, pan });
    // Juicy splatter grains trailing behind.
    for (let i = 0; i < 7; i++) {
      audio.noise({
        dur: 0.05 + Math.random() * 0.05,
        gain: 0.03,
        filter: 'bandpass',
        freq: 600 + Math.random() * 900,
        q: 2,
        pan: pan + rand(-0.3, 0.3),
        delay: 0.06 + i * 0.045 + Math.random() * 0.03,
      });
    }
    // Bands flicking away.
    for (let i = 0; i < 4; i++) {
      audio.pluck({
        freq: scale(9 + Math.floor(Math.random() * 5)),
        sustain: 0.2,
        brightness: 0.4,
        bend: 1.2,
        gain: 0.12,
        pan: rand(-0.5, 0.5),
        delay: 0.03 + i * 0.05,
      });
    }
  },

  // ——— jelly family ———

  /** Elastic squeak while something soft is stretched. amount 0..1. */
  squeak(amount: number, pan = 0) {
    if (!gate('squeak', 70)) return;
    const a = clamp(amount, 0, 1);
    const f = scale(Math.round(lerp(10, 15, a)));
    audio.tone({
      freq: f * 0.9,
      to: f * 1.12,
      glide: 0.1,
      decay: 0.12,
      gain: 0.03 + a * 0.04,
      pan,
      type: 'triangle',
      lowpass: 2400,
      vibrato: { rate: 26, depth: f * 0.02 },
      reverb: 0.1,
    });
  },
  /** Releasing a stretch: a round "bwoing". */
  snapBack(amount: number, pan = 0) {
    if (!gate('snapBack', 90)) return;
    const a = clamp(amount, 0, 1);
    const f = scale(Math.round(lerp(8, 5, a)));
    audio.tone({
      freq: f * 1.5,
      to: f,
      glide: 0.16,
      decay: 0.28,
      gain: 0.07 + a * 0.08,
      pan,
      vibrato: { rate: 9, depth: f * 0.04 },
      reverb: 0.2,
    });
  },
  /** A gentle squish: soft, cute, never gross. */
  squish(amount: number, pan = 0) {
    if (!gate('squish', 110)) return;
    const a = clamp(amount, 0, 1);
    audio.noise({ dur: 0.16, gain: 0.04 + a * 0.05, filter: 'bandpass', freq: 1400, to: 380, q: 3, pan, attack: 0.02 });
    const f = scale(Math.round(lerp(7, 4, a)));
    audio.tone({ freq: f * 1.2, to: f * 0.85, glide: 0.14, decay: 0.16, gain: 0.05 + a * 0.05, pan });
  },
  /** A soft slice through jelly. */
  slice(pan = 0) {
    if (!gate('slice', 40)) return;
    audio.noise({ dur: 0.1, gain: 0.07, filter: 'highpass', freq: 1800, to: 5200, q: 0.7, pan, attack: 0.01 });
    audio.tone({ freq: scale(16 + Math.floor(rand(0, 2))), decay: 0.18, gain: 0.03, pan, reverb: 0.35, delay: 0.02 });
    audio.tone({ freq: scale(7), to: scale(5), glide: 0.1, decay: 0.12, gain: 0.05, pan, delay: 0.05 });
  },
};
