import { settings } from './settings';
import { clamp } from './math';

/**
 * Procedural audio engine.
 *
 * There are no audio files in the app. Every sound is synthesised from a
 * handful of shared primitives (tone, noise, pluck, creak) that all pass
 * through the same soft filtering, the same small room reverb and the same
 * gentle compressor. That shared signal path is what makes a rubber band and
 * a jelly sound like they live in the same world.
 */

export type Bus = 'sfx' | 'music';

export interface ToneOpts {
  freq: number;
  /** Glide to this frequency over `glide` seconds. */
  to?: number;
  glide?: number;
  type?: OscillatorType;
  attack?: number;
  decay?: number;
  gain?: number;
  pan?: number;
  reverb?: number;
  delay?: number;
  vibrato?: { rate: number; depth: number };
  lowpass?: number;
  bus?: Bus;
}

export interface NoiseOpts {
  dur?: number;
  attack?: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  pan?: number;
  reverb?: number;
  delay?: number;
  bus?: Bus;
}

export interface PluckOpts {
  freq: number;
  /** 0..1 how long the string rings. */
  sustain?: number;
  /** 0..1 how bright the excitation is. */
  brightness?: number;
  /** Starting pitch multiplier that relaxes to 1 — the "boing" of a band. */
  bend?: number;
  gain?: number;
  pan?: number;
  reverb?: number;
  delay?: number;
  lowpass?: number;
}

export interface CreakOpts {
  dur?: number;
  /** Clicks per second at start / end. */
  rate?: number;
  rateEnd?: number;
  freq?: number;
  gain?: number;
  pan?: number;
  delay?: number;
}

const MAX_VOICES = 40;

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private pluckCache = new Map<string, AudioBuffer>();
  private voices = 0;
  private unlockListeners: Array<() => void> = [];

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must be called from a user gesture (first touch). Safe to call often. */
  unlock() {
    if (!this.ctx) {
      try {
        // Respect the iOS silent switch and mix politely with other audio.
        const nav = navigator as Navigator & { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'ambient';
      } catch {
        /* not supported */
      }
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.build();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().then(() => this.fireUnlocked());
    } else {
      this.fireUnlocked();
    }
  }

  onUnlock(fn: () => void) {
    if (this.ready) fn();
    else this.unlockListeners.push(fn);
  }

  private fireUnlocked() {
    const l = this.unlockListeners;
    this.unlockListeners = [];
    l.forEach((f) => f());
  }

  private build() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;

    // A final gentle high-shelf cut keeps everything warm, never shrill.
    const warm = ctx.createBiquadFilter();
    warm.type = 'highshelf';
    warm.frequency.value = 6500;
    warm.gain.value = -6;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(warm).connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    const reverb = ctx.createConvolver();
    reverb.buffer = this.makeImpulse(2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.55;
    this.reverbSend.connect(reverb).connect(reverbOut).connect(this.master);

    // Shared white-noise source material.
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.applySettings();
    settings.onChange(() => this.applySettings());
  }

  private applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(settings.value.sfx ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.value.music ? 1 : 0, t, 0.4);
  }

  /** A soft, slightly dark room — just enough air to make sounds bloom. */
  private makeImpulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 3.2);
        lp += 0.22 * (Math.random() * 2 - 1 - lp); // darken the tail
        d[i] = lp * env * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  bus(b: Bus = 'sfx') {
    return b === 'music' ? this.musicBus : this.sfxBus;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Whether a new voice may start. Music bypasses voice stealing. */
  private claim(bus: Bus) {
    if (!this.ready) return false;
    if (bus === 'sfx' && !settings.value.sfx) return false;
    if (bus === 'music' && !settings.value.music) return false;
    if (this.voices >= MAX_VOICES && bus === 'sfx') return false;
    this.voices++;
    return true;
  }

  private release = () => {
    this.voices = Math.max(0, this.voices - 1);
  };

  /** Routes a voice to its bus + reverb, with stereo placement. */
  private out(node: AudioNode, pan = 0, reverb = 0, bus: Bus = 'sfx') {
    const ctx = this.ctx!;
    let tail: AudioNode = node;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.bus(bus));
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      tail.connect(s).connect(this.reverbSend);
    }
  }

  private envelope(g: GainNode, t: number, attack: number, decay: number, peak: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(o: ToneOpts) {
    const bus = o.bus ?? 'sfx';
    if (!this.claim(bus)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const attack = o.attack ?? 0.005;
    const decay = o.decay ?? 0.25;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? decay));
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      depth.gain.value = o.vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + attack + decay + 0.05);
    }
    const g = ctx.createGain();
    this.envelope(g, t, attack, decay, o.gain ?? 0.2);
    let head: AudioNode = osc;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      osc.connect(f);
      head = f;
    }
    head.connect(g);
    this.out(g, o.pan, o.reverb, bus);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
    osc.onended = this.release;
  }

  noise(o: NoiseOpts) {
    const bus = o.bus ?? 'sfx';
    if (!this.claim(bus)) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.15;
    const attack = o.attack ?? 0.004;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    this.envelope(g, t, attack, dur, o.gain ?? 0.2);
    src.connect(f).connect(g);
    this.out(g, o.pan, o.reverb, bus);
    const offset = Math.random() * 1.5;
    src.start(t, offset, attack + dur + 0.05);
    src.onended = this.release;
  }

  /** Karplus–Strong plucked string: the voice of every rubber band. */
  pluck(o: PluckOpts) {
    if (!this.claim('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const sustain = clamp(o.sustain ?? 0.5, 0, 1);
    const bright = clamp(o.brightness ?? 0.5, 0, 1);
    const freq = Math.round(o.freq);
    const key = `${freq}|${sustain.toFixed(2)}|${bright.toFixed(2)}`;
    let buf = this.pluckCache.get(key);
    if (!buf) {
      buf = this.makePluck(freq, sustain, bright);
      if (this.pluckCache.size > 96) this.pluckCache.delete(this.pluckCache.keys().next().value!);
      this.pluckCache.set(key, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bend = o.bend ?? 1;
    src.playbackRate.setValueAtTime(bend, t);
    src.playbackRate.exponentialRampToValueAtTime(1, t + 0.09);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass ?? 3800;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 0.35;
    src.connect(f).connect(g);
    this.out(g, o.pan, o.reverb ?? 0.12, 'sfx');
    src.start(t);
    src.onended = this.release;
  }

  private makePluck(freq: number, sustain: number, bright: number) {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const dur = 0.25 + sustain * 1.1;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    // Softened excitation: low brightness = rounder, rubberier pluck.
    let prev = 0;
    const smooth = 0.15 + (1 - bright) * 0.7;
    for (let i = 0; i < N; i++) {
      const r = Math.random() * 2 - 1;
      prev = prev * smooth + r * (1 - smooth);
      d[i] = prev;
    }
    const decay = 0.985 + sustain * 0.0135;
    const keep = bright * 0.3; // brighter strings keep more of their highs
    for (let i = N; i < len; i++) {
      const avg = 0.5 * (d[i - N] + d[i - N + 1]);
      d[i] = decay * (avg * (1 - keep) + d[i - N] * keep);
    }
    // Normalise + fade tail.
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const k = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) {
      const fade = i > len - 600 ? (len - i) / 600 : 1;
      d[i] *= k * fade;
    }
    return buf;
  }

  /** Stick–slip clicks: the quiet creak of something under strain. */
  creak(o: CreakOpts) {
    if (!this.claim('sfx')) return;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const dur = o.dur ?? 0.5;
    const len = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const r0 = o.rate ?? 40;
    const r1 = o.rateEnd ?? r0 * 0.6;
    const f = o.freq ?? 700;
    let t = 0;
    while (t < dur) {
      const k = t / dur;
      const rate = r0 + (r1 - r0) * k;
      const start = Math.floor(t * sr);
      const amp = Math.sin(Math.PI * k) * (0.6 + Math.random() * 0.4);
      const clickLen = Math.floor(sr * 0.012);
      for (let i = 0; i < clickLen && start + i < len; i++) {
        const e = Math.exp(-i / (sr * 0.0025));
        d[start + i] += Math.sin((2 * Math.PI * f * i) / sr) * e * amp;
      }
      t += (1 / rate) * (0.7 + Math.random() * 0.6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 0.18;
    src.connect(bp).connect(g);
    this.out(g, o.pan, 0.25, 'sfx');
    src.start(ctx.currentTime + (o.delay ?? 0));
    src.onended = this.release;
  }

  /** Raw access for the music scheduler (long-lived pad voices). */
  get context() {
    return this.ctx;
  }
  get reverbInput() {
    return this.reverbSend;
  }
}

export const audio = new AudioEngine();

/** Stereo position from a screen x (subtle — never hard-panned). */
export const panFor = (x: number, width: number) => clamp((x / Math.max(1, width)) * 2 - 1, -1, 1) * 0.45;
