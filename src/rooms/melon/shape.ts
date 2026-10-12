import { Spring } from '../../design/motion';
import { pastel, springs } from '../../design/tokens';
import { clamp, gauss, lerp, rand, randInt, TAU } from '../../core/math';
import { Face } from '../../render/face';

/**
 * The watermelon's shape: a long melon lying on its side, and the rubber
 * bands squeezing it.
 *
 * It's a body of revolution of (roughly) constant volume, in the melon's own
 * normalised frame: `xn` runs along its length from -1 (left end) to 1
 * (right end). Every band compresses it right where it sits — a groove that
 * bites deeper as more bands pile onto the same spot. The volume squeezed out
 * of the grooves has to go somewhere: part of it makes the melon longer, the
 * rest swells the free, unbanded parts. A pile round the middle makes a
 * peanut that rests on its two lobes. Kept free of three.js so it's testable.
 */

/** Half-length and radius of the melon at rest (scene units). */
export const MELON_A = 2.25;
export const MELON_R = 1.6;

/**
 * Sixteen candy tones, so a melon wearing sixty bands reads as a rainbow
 * wrap rather than a beige mass — still soft enough for the backdrop.
 */
export const BAND_COLORS = [
  pastel.pink,
  pastel.sky,
  pastel.butter,
  pastel.lilac,
  pastel.peach,
  pastel.mint,
  pastel.berry,
  pastel.sage,
  '#F2A3BC', // rose
  '#93C4E6', // cornflower
  '#F2C86B', // marigold
  '#BBA3E6', // violet
  '#F5AA7E', // tangerine
  '#8FD1BE', // teal
  '#B8D982', // lime
  '#F08F8F', // coral
];

/** The melon pops somewhere in this range of bands. Never shown, never the same. */
export const BREAK_RANGE = { min: 40, max: 65 } as const;

/** How far toward the ends a band can be placed (normalised). */
export const BAND_REACH = { min: -0.8, max: 0.8 };
/** Spacing of bands lying side by side (normalised). */
const BAND_GAP = 0.024;
/** Deepest a pile of bands can squeeze the melon (fraction of its radius). */
const PINCH_MAX = 0.62;
/** Resolution of the profile along the melon. */
const WN = 128;
/** Where squeezed-out volume bulges: a wide, smooth swell (σ ≈ 0.2). */
const BLUR = Array.from({ length: 41 }, (_, i) => gauss(i - 20, 13));
/** Flesh gives smoothly around a band: softened groove walls (σ ≈ 0.09). */
const SOFT = Array.from({ length: 21 }, (_, i) => gauss(i - 10, 5.8));
/** Samples along the length used to find what the melon rests on. */
const SUPPORT_SAMPLES = 41;

export interface Band {
  /** Position along the melon, normalised (animated as it settles). */
  x: Spring;
  /** 1 = loose ring flying on, 0 = snug. Overshoots below 0 when it snaps. */
  loose: Spring;
  /** Tilt of the ring (rad) and which way it leans. */
  tilt: number;
  lean: number;
  color: string;
  thick: number;
}

/** A colour that differs from the previous band's. */
export function nextBandColor(prev?: string) {
  let c = BAND_COLORS[Math.floor(Math.random() * BAND_COLORS.length)];
  if (c === prev) c = BAND_COLORS[(BAND_COLORS.indexOf(c) + 1) % BAND_COLORS.length];
  return c;
}

export class MelonShape {
  bands: Band[] = [];
  breakAt = 50;
  /** Smoothed visual tension 0..1 (what the player sees). */
  tension = 0;
  readonly squash = new Spring(0, springs.wobbly);
  readonly sway = new Spring(0, springs.wobbly);
  readonly swell = new Spring(0, springs.soft);
  /** Waist wobble: each band snaps the waist tighter and it rings back. */
  readonly throb = new Spring(0, { stiffness: 300, damping: 11 });
  /** Extra squeeze in the last moments before the pop (set by the room). */
  crush = 0;
  readonly face = new Face();
  shiver = 0;
  time = rand(0, 100);
  /** Where it's squeezed tightest (normalised): where it will give way. */
  grooveX = 0;
  private nextIdle = rand(3, 6);
  /** Radius along the melon (fraction of MELON_R), and scratch tables. */
  private readonly prof = new Float32Array(WN + 1);
  private readonly free = new Float32Array(WN + 1);
  private readonly raw = new Float32Array(WN + 1);
  private readonly pinch = new Float32Array(WN + 1);
  /** Extra length from squeezed-out volume. */
  private elong = 0;

  constructor() {
    this.reset();
  }

  reset() {
    this.bands = [];
    this.tension = 0;
    this.crush = 0;
    this.breakAt = randInt(BREAK_RANGE.min, BREAK_RANGE.max);
    this.squash.snap(0);
    this.sway.snap(0);
    this.swell.snap(0);
    this.throb.snap(0);
    this.shiver = 0;
    this.grooveX = 0;
    this.face.base = 'calm';
    this.build();
  }

  /** Raw fullness 0..1 (hidden from the player). */
  get fullness() {
    return clamp(this.bands.length / this.breakAt, 0, 1);
  }

  get ready() {
    return this.bands.length >= this.breakAt;
  }

  /** Put a band on at `xn` along the melon. It stays where it's put. */
  addBand(xn: number, color: string) {
    const from = clamp(xn, -0.9, 0.9);
    const b: Band = {
      x: new Spring(from, { stiffness: 160, damping: 15 }),
      loose: new Spring(1, springs.snap),
      tilt: rand(0.015, 0.12) * (Math.random() < 0.5 ? -1 : 1),
      lean: rand(0, TAU),
      color,
      thick: rand(0.9, 1.12),
    };
    b.x.target = this.slotFor(clamp(xn, BAND_REACH.min, BAND_REACH.max));
    b.loose.target = 0;
    this.bands.push(b);
    const t = this.fullness;
    // It flinches: squashes down, rolls a little, and the waist snaps in.
    this.squash.impulse(1.6 + t * 1.2);
    this.sway.impulse(rand(-1, 1) * (1.2 + t));
    this.throb.impulse(0.45 + t * 0.5);
    return b;
  }

  /**
   * A band snapped on top of others settles right beside them, so a pile
   * grows outward from where you put it; once there's no room nearby it
   * stacks on top.
   */
  private slotFor(x: number) {
    const free = (y: number) => this.bands.every((b) => Math.abs(b.x.target - y) > BAND_GAP * 0.6);
    if (free(x)) return x;
    const first = Math.random() < 0.5 ? -1 : 1;
    for (let k = 1; k <= 6; k++) {
      for (const side of [first, -first]) {
        const y = x + side * k * BAND_GAP;
        if (y >= BAND_REACH.min && y <= BAND_REACH.max && free(y)) return y;
      }
    }
    return clamp(x + rand(-1, 1) * BAND_GAP, BAND_REACH.min, BAND_REACH.max);
  }

  update(dt: number) {
    this.time += dt;
    for (const b of this.bands) {
      b.x.update(dt);
      b.loose.update(dt);
    }
    this.squash.update(dt);
    this.sway.update(dt);
    this.swell.update(dt);
    this.throb.update(dt);
    this.face.update(dt);
    // Visual tension eases toward a saturating curve of fullness: early bands
    // read clearly, the last stretch all looks "very tight".
    const target = (1 - Math.exp(-this.fullness * 2.4)) / (1 - Math.exp(-2.4));
    this.tension = lerp(this.tension, target, 1 - Math.exp(-dt * 4));
    this.nextIdle -= dt;
    if (this.nextIdle <= 0) {
      this.nextIdle = rand(3.5, 7);
      if (this.tension < 0.5) this.sway.impulse(rand(-0.9, 0.9));
    }
    this.build();
  }

  /** Rebuild the profile: grooves where the bands sit, bulges everywhere else. */
  private build() {
    const boost = 1 + this.crush * 2.5 + this.throb.value * 0.22;
    const per = 0.045 * boost;
    const r = this.prof;
    let deepest = 0;
    let groove = this.grooveX;
    for (let j = 0; j <= WN; j++) {
      const x = (j / WN) * 2 - 1;
      let sum = 0;
      let notch = 0;
      for (const b of this.bands) {
        const tight = clamp(1 - b.loose.value, -0.35, 1.2);
        const d = x - b.x.value;
        sum += tight * gauss(d, 0.07);
        notch += tight * gauss(d, 0.022);
      }
      this.pinch[j] = Math.min(0.8, PINCH_MAX * (1 - Math.exp((-Math.max(0, sum) * per) / PINCH_MAX)) + Math.min(notch * 0.012, 0.04));
    }
    blur(this.pinch, this.raw, SOFT);
    for (let j = 0; j <= WN; j++) {
      const x = (j / WN) * 2 - 1;
      const pinch = this.raw[j];
      const f = 1 - clamp(pinch / PINCH_MAX, 0, 1);
      r[j] = Math.sqrt(Math.max(0, 1 - x * x)) * (1 - pinch);
      this.pinch[j] = f * f;
      if (pinch > deepest) {
        deepest = pinch;
        groove = x;
      }
    }
    // The rind is stiff: it spreads a bulge over a wide, smooth swell
    // instead of puffing out in sharp ridges between the bands.
    const w = this.free;
    blur(this.pinch, w, BLUR);
    let a = 0;
    let bb = 0;
    let c = 0;
    let v0 = 0;
    for (let j = 0; j <= WN; j++) {
      const x = (j / WN) * 2 - 1;
      const rc = r[j];
      a += rc * rc;
      bb += rc * rc * w[j];
      c += rc * rc * w[j] * w[j];
      v0 += 1 - x * x;
    }
    this.grooveX = this.bands.length ? groove : 0;
    // Displaced volume: some makes it longer, the rest bulges the free parts.
    const lost = clamp(1 - a / v0, 0, 0.9);
    this.elong = 0.5 * lost;
    const pressure = 1 + this.swell.value * 2;
    const target = (v0 * pressure) / (1 + this.elong);
    // Solve a + 2·s·b + s²·c = target for the bulge s (volume of revolution).
    let s = 0;
    if (c > 1e-9) s = Math.max(0, (-bb + Math.sqrt(Math.max(0, bb * bb - c * (a - target)))) / c);
    for (let j = 0; j <= WN; j++) r[j] *= 1 + s * w[j];
    r[0] = r[WN] = 0;
  }

  /** Distance from the axis to the surface at `xn` (scene units, before squash). */
  surfaceAt(xn: number) {
    const f = (clamp(xn, -1, 1) + 1) * 0.5 * WN;
    const i = Math.min(WN - 1, Math.floor(f));
    const k = f - i;
    return MELON_R * (this.prof[i] * (1 - k) + this.prof[i + 1] * k);
  }

  /** The melon grows longer as it's squeezed. */
  get lengthScale() {
    return 1 + this.elong + this.swell.value * 0.3;
  }

  /**
   * How high the axis sits when the melon rests on the table: on its belly
   * at first, then on its lobes once the waist is pinched in.
   */
  get supportHeight() {
    let h = 0;
    for (let i = 0; i < SUPPORT_SAMPLES; i++) h = Math.max(h, this.surfaceAt(-1 + (2 * i) / (SUPPORT_SAMPLES - 1)));
    return h;
  }

  /** Vertical squash (+ = squashed down), clamped to stay cute. */
  get squashAmount() {
    const breathe = Math.sin(this.time * 1.7) * 0.008 * (1 - this.tension * 0.5);
    return clamp(this.squash.value * 0.02 + breathe, -0.18, 0.22);
  }
}

/** Normalised 1D convolution (edges renormalised), src → dst. */
function blur(src: Float32Array, dst: Float32Array, kernel: number[]) {
  const K = kernel.length >> 1;
  const n = src.length;
  for (let j = 0; j < n; j++) {
    let acc = 0;
    let wt = 0;
    for (let k = -K; k <= K; k++) {
      const i = j + k;
      if (i < 0 || i >= n) continue;
      acc += src[i] * kernel[k + K];
      wt += kernel[k + K];
    }
    dst[j] = acc / wt;
  }
}
