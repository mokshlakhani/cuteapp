import { Spring } from '../design/motion';
import { springs } from '../design/tokens';
import { clamp, rand, TAU } from '../core/math';
import { rgba } from '../core/color';

/**
 * Faces are the soul of every toy. One controller + one renderer is shared
 * by all rooms so a watermelon and a jelly emote in exactly the same way.
 *
 * The face is drawn in the toy's own (deformed) coordinate frame, so when
 * the toy squashes or stretches, the face squashes and stretches with it.
 */
export type Expression =
  | 'calm' // • ‿ •
  | 'happy' // ^ ▽ ^
  | 'wide' // O o O   (being stretched)
  | 'squeeze' // > ~ <   (being squished)
  | 'dizzy' // @ ~ @   (after a big bounce)
  | 'surprised' // O o O  (just cut / startled)
  | 'nervous' // • ~ •  + sweat
  | 'strain' // > ~ <  + sweat + tremble
  | 'sleepy'; // ‿ . ‿

type EyeStyle = 'dot' | 'arc' | 'big' | 'chevron' | 'spiral' | 'closed';
type MouthStyle = 'smile' | 'open' | 'o' | 'wavy' | 'flat' | 'tiny';

const LOOK: Record<Expression, { eyes: EyeStyle; mouth: MouthStyle; sweat?: boolean; tremble?: number; blush: number }> = {
  calm: { eyes: 'dot', mouth: 'smile', blush: 0.55 },
  happy: { eyes: 'arc', mouth: 'open', blush: 0.75 },
  wide: { eyes: 'big', mouth: 'o', blush: 0.6 },
  squeeze: { eyes: 'chevron', mouth: 'wavy', blush: 0.95 },
  dizzy: { eyes: 'spiral', mouth: 'wavy', blush: 0.5 },
  surprised: { eyes: 'big', mouth: 'tiny', blush: 0.6 },
  nervous: { eyes: 'dot', mouth: 'flat', sweat: true, blush: 0.7, tremble: 0.2 },
  strain: { eyes: 'chevron', mouth: 'wavy', sweat: true, blush: 1, tremble: 1 },
  sleepy: { eyes: 'closed', mouth: 'tiny', blush: 0.5 },
};

export class Face {
  /** What the face relaxes back to when nothing is happening. */
  base: Expression = 'calm';
  private override: Expression | null = null;
  private hold = 0;
  private shown: Expression = 'calm';
  private blinkT = 0;
  private nextBlink = rand(1.5, 4);
  private t = rand(0, 10);
  readonly pop = new Spring(1, springs.wobbly);
  readonly lookX = new Spring(0, springs.gentle);
  readonly lookY = new Spring(0, springs.gentle);

  get expression(): Expression {
    return this.override ?? this.base;
  }

  /** Show an expression for `hold` seconds, then drift back to base. */
  set(expr: Expression, hold = 0.9) {
    if (this.override === expr) {
      this.hold = Math.max(this.hold, hold);
      return;
    }
    this.override = expr;
    this.hold = hold;
  }

  look(x: number, y: number) {
    this.lookX.target = clamp(x, -1, 1);
    this.lookY.target = clamp(y, -1, 1);
  }

  update(dt: number) {
    this.t += dt;
    if (this.override) {
      this.hold -= dt;
      if (this.hold <= 0) this.override = null;
    }
    const e = this.expression;
    if (e !== this.shown) {
      this.shown = e;
      this.pop.value = 0.72;
      this.pop.velocity = 0;
    }
    this.pop.update(dt);
    this.lookX.update(dt);
    this.lookY.update(dt);
    // Blinks: quick close/open, only for open eyes.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.16;
      this.nextBlink = rand(2.2, 5.5);
      if (Math.random() < 0.18) this.nextBlink = 0.25; // occasional double blink
    }
    if (this.blinkT > 0) this.blinkT -= dt;
  }

  /** 0 = open, 1 = shut. */
  get blink() {
    if (this.blinkT <= 0) return 0;
    const k = 1 - this.blinkT / 0.16;
    return Math.sin(k * Math.PI);
  }

  get time() {
    return this.t;
  }
}

export interface FaceStyle {
  ink: string;
  blush: string;
  /** Overall opacity — used for subtle tinting into translucent jelly. */
  alpha?: number;
}

/**
 * Draw a face centred at the current origin. `s` is the face width in px.
 * The caller sets up the transform (including any deformation).
 */
export function drawFace(ctx: CanvasRenderingContext2D, face: Face, s: number, style: FaceStyle) {
  const look = LOOK[face.expression];
  const pop = face.pop.value;
  const tremble = (look.tremble ?? 0) * s * 0.006;
  const tx = tremble ? Math.sin(face.time * 70) * tremble : 0;
  const lx = face.lookX.value * s * 0.05 + tx;
  const ly = face.lookY.value * s * 0.035;

  ctx.save();
  ctx.globalAlpha *= style.alpha ?? 1;

  // Blush — soft and round, below and outside the eyes.
  const blushA = look.blush;
  for (const side of [-1, 1]) {
    const bx = side * s * 0.4 + lx * 0.5;
    const by = s * 0.1 + ly * 0.5;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, s * 0.13);
    g.addColorStop(0, rgba(style.blush, 0.55 * blushA));
    g.addColorStop(1, rgba(style.blush, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx, by, s * 0.13, s * 0.085, 0, 0, TAU);
    ctx.fill();
  }

  ctx.translate(lx, ly);
  ctx.scale(pop, pop);
  ctx.fillStyle = style.ink;
  ctx.strokeStyle = style.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4, s * 0.042);

  const ex = s * 0.27;
  const ey = -s * 0.04;
  for (const side of [-1, 1]) drawEye(ctx, look.eyes, side * ex, ey, s, side, face);
  drawMouth(ctx, look.mouth, 0, s * 0.13, s, face);

  if (look.sweat) {
    const sx = s * 0.47;
    const sy = -s * 0.24 + Math.sin(face.time * 3) * s * 0.01;
    const r = s * 0.06;
    ctx.fillStyle = 'rgba(190,225,245,0.95)';
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 1.6);
    ctx.bezierCurveTo(sx + r, sy - r * 0.2, sx + r, sy + r, sx, sy + r);
    ctx.bezierCurveTo(sx - r, sy + r, sx - r, sy - r * 0.2, sx, sy - r * 1.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(sx - r * 0.3, sy + r * 0.1, r * 0.25, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawEye(ctx: CanvasRenderingContext2D, style: EyeStyle, x: number, y: number, s: number, side: number, face: Face) {
  const blink = face.blink;
  switch (style) {
    case 'dot':
    case 'big': {
      const big = style === 'big';
      const rx = s * (big ? 0.085 : 0.062);
      const ry = s * (big ? 0.1 : 0.078) * (1 - blink * 0.88);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
      if (blink < 0.5) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(x - rx * 0.32, y - ry * 0.38, rx * (big ? 0.38 : 0.36), 0, TAU);
        ctx.fill();
        if (big) {
          ctx.beginPath();
          ctx.arc(x + rx * 0.35, y + ry * 0.35, rx * 0.16, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case 'arc': {
      const w = s * 0.075;
      ctx.beginPath();
      ctx.moveTo(x - w, y + w * 0.35);
      ctx.quadraticCurveTo(x, y - w * 1.15, x + w, y + w * 0.35);
      ctx.stroke();
      break;
    }
    case 'closed': {
      const w = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(x - w, y - w * 0.1);
      ctx.quadraticCurveTo(x, y + w * 0.8, x + w, y - w * 0.1);
      ctx.stroke();
      break;
    }
    case 'chevron': {
      // > on the left, < on the right
      const w = s * 0.065;
      const d = -side;
      ctx.beginPath();
      ctx.moveTo(x - d * w, y - w * 0.85);
      ctx.lineTo(x + d * w * 0.9, y);
      ctx.lineTo(x - d * w, y + w * 0.85);
      ctx.stroke();
      break;
    }
    case 'spiral': {
      const turns = 2.2;
      const rmax = s * 0.08;
      const rot = face.time * 7 * side;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const k = i / 40;
        const a = rot + k * turns * TAU;
        const r = rmax * k;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.save();
      ctx.lineWidth *= 0.75;
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

function drawMouth(ctx: CanvasRenderingContext2D, style: MouthStyle, x: number, y: number, s: number, face: Face) {
  switch (style) {
    case 'smile': {
      const w = s * 0.07;
      ctx.beginPath();
      ctx.moveTo(x - w, y - w * 0.15);
      ctx.quadraticCurveTo(x, y + w * 0.9, x + w, y - w * 0.15);
      ctx.stroke();
      break;
    }
    case 'open': {
      const w = s * 0.085;
      ctx.beginPath();
      ctx.moveTo(x - w, y - w * 0.25);
      ctx.quadraticCurveTo(x, y - w * 0.05, x + w, y - w * 0.25);
      ctx.quadraticCurveTo(x + w * 0.8, y + w * 1.3, x, y + w * 1.25);
      ctx.quadraticCurveTo(x - w * 0.8, y + w * 1.3, x - w, y - w * 0.25);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#F08C96';
      ctx.beginPath();
      ctx.ellipse(x, y + w * 1.1, w * 0.6, w * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'o': {
      const w = s * 0.05;
      const breathe = 1 + Math.sin(face.time * 5) * 0.06;
      ctx.beginPath();
      ctx.ellipse(x, y + w * 0.3, w * 0.85, w * 1.05 * breathe, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#F08C96';
      ctx.beginPath();
      ctx.ellipse(x, y + w * 1.1, w * 0.6, w * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'tiny': {
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.01, s * 0.025, s * 0.03, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'wavy': {
      const w = s * 0.085;
      const ph = face.time * 9;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const k = i / 16;
        const px = x - w + k * w * 2;
        const py = y + Math.sin(k * TAU * 1.5 + ph * 0.2) * w * 0.22;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case 'flat': {
      const w = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - w, y + w * 0.2);
      ctx.quadraticCurveTo(x, y - w * 0.1, x + w, y + w * 0.2);
      ctx.stroke();
      break;
    }
  }
}
