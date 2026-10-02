import { audio } from './audio';
import { settings } from './settings';
import { scale } from './sounds';
import { pick, rand } from './math';

/**
 * Generative ambient music: warm pads, rare soft bells, the odd piano note.
 * It never loops audibly and never competes with the toys — it sits ~20 dB
 * below interaction sounds and is written in the same F pentatonic world.
 */

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Fmaj9 → Am7 → B♭maj9 → C6/9 (voiced low and close).
const CHORDS: number[][] = [
  [41, 57, 60, 64, 67],
  [45, 55, 60, 64, 67],
  [46, 57, 60, 62, 65],
  [48, 55, 60, 62, 64],
];

const BAR = 8; // seconds per chord

class Music {
  private timer: number | null = null;
  private nextChordAt = 0;
  private chordIndex = 0;
  private nextBellAt = 0;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    audio.onUnlock(() => {
      settings.onChange(() => this.sync());
      this.sync();
    });
  }

  private sync() {
    const want = settings.value.music && audio.ready;
    if (want && this.timer == null) {
      this.nextChordAt = audio.now + 0.3;
      this.nextBellAt = audio.now + 3;
      this.timer = window.setInterval(() => this.tick(), 250);
    } else if (!want && this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    const now = audio.now;
    const horizon = now + 1.2;
    while (this.nextChordAt < horizon) {
      this.pad(CHORDS[this.chordIndex], this.nextChordAt);
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.nextChordAt += BAR;
    }
    if (this.nextBellAt < horizon) {
      this.bell(this.nextBellAt);
      this.nextBellAt += rand(3.5, 8);
    }
  }

  private pad(notes: number[], when: number) {
    const ctx = audio.context;
    if (!ctx) return;
    const out = audio.bus('music');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, when);
    lp.frequency.linearRampToValueAtTime(900, when + BAR * 0.5);
    lp.frequency.linearRampToValueAtTime(550, when + BAR + 3);
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    const peak = 0.028;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 2.6);
    g.gain.setValueAtTime(peak, when + BAR - 0.5);
    g.gain.linearRampToValueAtTime(0.0001, when + BAR + 3);
    lp.connect(g).connect(out);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(audio.reverbInput);
    const end = when + BAR + 3.2;
    notes.forEach((m, i) => {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = midiHz(m);
        o.detune.value = detune + rand(-2, 2);
        const vg = ctx.createGain();
        vg.gain.value = i === 0 ? 0.9 : 0.45;
        o.connect(vg).connect(lp);
        o.start(when);
        o.stop(end);
      }
    });
  }

  private bell(when: number) {
    const delay = Math.max(0, when - audio.now);
    const n = pick([10, 11, 12, 13, 14, 15]);
    const f = scale(n);
    const piano = Math.random() < 0.35;
    if (piano) {
      audio.tone({ freq: f, type: 'triangle', decay: 1.6, gain: 0.03, lowpass: 1800, reverb: 0.5, delay, bus: 'music' });
    } else {
      audio.tone({ freq: f, decay: 2.8, gain: 0.022, reverb: 0.8, delay, bus: 'music' });
      audio.tone({ freq: f * 2.76, decay: 1.2, gain: 0.006, reverb: 0.8, delay, bus: 'music' });
    }
    // Sometimes a second, answering note.
    if (Math.random() < 0.4) {
      const f2 = scale(n + pick([-2, -1, 2]));
      audio.tone({ freq: f2, decay: 2.4, gain: 0.016, reverb: 0.8, delay: delay + rand(0.35, 0.7), bus: 'music' });
    }
  }
}

export const music = new Music();
