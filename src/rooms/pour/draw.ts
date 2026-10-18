import type { Theme } from '../../design/tokens';
import { pastel } from '../../design/tokens';
import { clamp, lerp, smoothstep, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { contactShadow, gloss } from '../../render/paint';
import { drawFace, type Face } from '../../render/face';
import { WAVE_N, type Glass } from './Glass';
import type { Drink } from './drinks';

/** A glass on the table, measured on its inside. */
export interface GlassShape {
  cx: number;
  /** y of the inside bottom, and the inside height. */
  bottom: number;
  H: number;
  /** Half-widths inside, at the bottom and at the rim (it flares a little). */
  wb: number;
  wt: number;
  wall: number;
  /** The thick glass foot under the inside bottom. */
  base: number;
}

/** A glass about `W` px wide, standing on the floor at `floorY`. */
export function glassShape(cx: number, floorY: number, W: number): GlassShape {
  const base = W * 0.1;
  const H = W * 1.25;
  return { cx, bottom: floorY - base, H, wb: W * 0.39, wt: W * 0.47, wall: Math.max(2.5, W * 0.035), base };
}

/** y of a fill height `f` (0..1), and the inside half-width there. */
export const yAt = (g: GlassShape, f: number) => g.bottom - f * g.H;
export const halfAt = (g: GlassShape, f: number) => lerp(g.wb, g.wt, clamp(f, 0, 1.05));

/** Inside outline, with softly rounded bottom corners. */
function insidePath(g: GlassShape) {
  const p = new Path2D();
  const r = g.wb * 0.22;
  const top = yAt(g, 1);
  p.moveTo(g.cx - g.wt, top);
  p.lineTo(g.cx - g.wb, g.bottom - r);
  p.quadraticCurveTo(g.cx - g.wb, g.bottom, g.cx - g.wb + r, g.bottom);
  p.lineTo(g.cx + g.wb - r, g.bottom);
  p.quadraticCurveTo(g.cx + g.wb, g.bottom, g.cx + g.wb, g.bottom - r);
  p.lineTo(g.cx + g.wt, top);
  p.closePath();
  return p;
}

/** Outside outline: the walls plus the heavy foot. */
function outsidePath(g: GlassShape) {
  const p = new Path2D();
  const w = g.wall;
  const r = g.wb * 0.28;
  const top = yAt(g, 1) - 1;
  const foot = g.bottom + g.base;
  p.moveTo(g.cx - g.wt - w, top);
  p.lineTo(g.cx - g.wb - w, foot - r);
  p.quadraticCurveTo(g.cx - g.wb - w, foot, g.cx - g.wb - w + r, foot);
  p.lineTo(g.cx + g.wb + w - r, foot);
  p.quadraticCurveTo(g.cx + g.wb + w, foot, g.cx + g.wb + w, foot - r);
  p.lineTo(g.cx + g.wt + w, top);
  p.closePath();
  return p;
}

/** Is (x, y) on the glass (for taps)? */
export function onGlass(g: GlassShape, x: number, y: number) {
  const f = (g.bottom - y) / g.H;
  return f > -0.15 && f < 1.1 && Math.abs(x - g.cx) < halfAt(g, f) + g.wall + 10;
}

export interface GlassLook {
  face: Face;
  /** 0..1: the fill line lit up (a perfect pour). */
  glow: number;
  /** 0..1: the fill line nudging for attention. */
  nudge: number;
  time: number;
  /** Drawn inside the drink, clipped to it (bubbles). */
  inside?: (ctx: CanvasRenderingContext2D) => void; /** Drawn inside the glass, clipped to it, over the drink (pearls, ice). */
  extras?: (ctx: CanvasRenderingContext2D) => void;
}

/** The surface of what's in the glass, as a path from left wall to right. */
function surfacePath(p: Path2D, ctx: { g: GlassShape; glass: Glass }, f: number, bump: (u: number) => number) {
  const { g, glass } = ctx;
  for (let i = 0; i <= WAVE_N; i++) {
    const u = i / WAVE_N;
    const half = halfAt(g, f) + 2;
    const x = g.cx - half + u * half * 2;
    const y = yAt(g, f + glass.surface(u)) - bump(u);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
}

export function drawGlass(ctx: CanvasRenderingContext2D, t: Theme, g: GlassShape, glass: Glass, d: Drink, look: GlassLook) {
  const day = t.name === 'day';
  const W = g.wt * 2;
  contactShadow(ctx, t, g.cx, g.bottom + g.base, g.wb * 1.5, g.base * 0.9, 0.2);

  // The back of the glass: barely there.
  const outside = outsidePath(g);
  ctx.fillStyle = rgba('#ffffff', day ? 0.28 : 0.07);
  ctx.fill(outside);

  // The drink.
  const inside = insidePath(g);
  ctx.save();
  ctx.clip(inside);
  if (glass.level > 0.002) {
    const body = new Path2D();
    surfacePath(body, { g, glass }, glass.level, () => 0);
    body.lineTo(g.cx + g.wt + 4, g.bottom + 4);
    body.lineTo(g.cx - g.wt - 4, g.bottom + 4);
    body.closePath();
    const grad = ctx.createLinearGradient(0, yAt(g, glass.level), 0, g.bottom);
    grad.addColorStop(0, d.color);
    grad.addColorStop(1, d.deep);
    ctx.fillStyle = grad;
    ctx.fill(body);
    if (look.inside) {
      ctx.save();
      ctx.clip(body);
      look.inside(ctx);
      ctx.restore();
    }
    // A bright line where the light catches the surface.
    const line = new Path2D();
    surfacePath(line, { g, glass }, glass.level, () => 0);
    ctx.strokeStyle = rgba(mix(d.color, '#ffffff', 0.6), 0.85);
    ctx.lineWidth = 2;
    ctx.stroke(line);
  }
  if (glass.foam > 0.004) {
    // Froth: a soft, lumpy band riding on the drink.
    const top = glass.level + glass.foam;
    const lumps = (u: number) =>
      (Math.sin(u * 19 + look.time * 2.2) * 0.5 + Math.sin(u * 7.3 - look.time * 1.3) * 0.5) * Math.min(3, glass.foam * 40);
    const foam = new Path2D();
    surfacePath(foam, { g, glass }, top, lumps);
    for (let i = WAVE_N; i >= 0; i--) {
      const u = i / WAVE_N;
      const half = halfAt(g, glass.level) + 2;
      foam.lineTo(g.cx - half + u * half * 2, yAt(g, glass.level + glass.surface(u)) + 1.5);
    }
    foam.closePath();
    ctx.fillStyle = rgba(d.foam, 0.95);
    ctx.fill(foam);
    ctx.fillStyle = rgba(mix(d.foam, d.color, 0.35), 0.5);
    for (let i = 0; i < 9; i++) {
      const u = (i + 0.5) / 9;
      const half = halfAt(g, glass.level);
      ctx.beginPath();
      ctx.arc(g.cx - half + u * half * 2, yAt(g, glass.level + glass.foam * 0.4), 1.4 + (i % 3) * 0.6, 0, TAU);
      ctx.fill();
    }
  }
  look.extras?.(ctx);
  ctx.restore();

  // The fill line: a little notch on each wall, joined by a faint dashed line.
  const ly = yAt(g, glass.line);
  const lh = halfAt(g, glass.line);
  const pulse = look.nudge * (0.5 + 0.5 * Math.sin(look.time * 9));
  const ink = mix(t.ink, '#ffffff', day ? 0 : 0.2);
  if (look.glow > 0.01) {
    // A soft, flat oval of light along the line.
    ctx.save();
    ctx.translate(g.cx, ly);
    ctx.scale(1, 0.3);
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, lh * 1.4);
    gl.addColorStop(0, rgba(pastel.butter, 0.55 * look.glow));
    gl.addColorStop(1, rgba(pastel.butter, 0));
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(0, 0, lh * 1.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(look.glow > 0.01 ? mix(ink, pastel.butter, look.glow) : ink, 0.5 + pulse * 0.4 + look.glow * 0.4);
  ctx.lineWidth = 2.6 + pulse * 1.4 + look.glow * 1.2;
  ctx.beginPath();
  ctx.moveTo(g.cx - lh + 1, ly);
  ctx.lineTo(g.cx - lh + W * 0.11, ly);
  ctx.moveTo(g.cx + lh - 1, ly);
  ctx.lineTo(g.cx + lh - W * 0.11, ly);
  ctx.stroke();
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = rgba(ink, 0.22 + look.glow * 0.3);
  ctx.beginPath();
  ctx.moveTo(g.cx - lh + W * 0.15, ly);
  ctx.lineTo(g.cx + lh - W * 0.15, ly);
  ctx.stroke();
  ctx.restore();

  // A face on the front of the glass.
  ctx.save();
  ctx.translate(g.cx, yAt(g, 0.3));
  // At dusk an empty glass is dark behind the face, so it's drawn light until the drink rises.
  const faceInk = day || glass.level > 0.42 ? t.faceInk : mix(t.ink, t.faceInk, smoothstep(0.2, 0.42, glass.level));
  drawFace(ctx, look.face, W * 0.4, { ink: faceInk, blush: pastel.pink, alpha: 0.92 });
  ctx.restore();

  // The front of the glass: rim, walls, foot and a long highlight.
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba('#ffffff', day ? 0.85 : 0.35);
  ctx.lineWidth = 1.6;
  ctx.stroke(outside);
  ctx.strokeStyle = rgba(t.ink, day ? 0.12 : 0.18);
  ctx.lineWidth = 1;
  ctx.stroke(inside);
  const top = yAt(g, 1);
  ctx.strokeStyle = rgba('#ffffff', day ? 0.9 : 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, Math.max(2.5, W * 0.035), 0, 0, TAU);
  ctx.stroke();
  // The foot: a thick, bright slab of glass.
  ctx.fillStyle = rgba('#ffffff', day ? 0.45 : 0.12);
  ctx.beginPath();
  ctx.rect(g.cx - g.wb, g.bottom + 1, g.wb * 2, g.base - 2);
  ctx.fill();
  ctx.restore();
  gloss(ctx, g.cx - g.wb * 0.62, yAt(g, 0.62), W * 0.07, W * 0.42, day ? 0.55 : 0.25, 0.06);
}

/** The jug, measured from where it's held (the handle side, half way up). */
export interface JugShape {
  W: number;
  H: number;
}

export const jugShape = (glassW: number): JugShape => ({ W: glassW * 0.92, H: glassW * 1.12 });

/** The spout's tip in the jug's own frame, and the way it points. */
const SPOUT = (j: JugShape) => ({ x: -j.W * 1.1, y: -j.H * 0.5 - 2 });

/** The jug tips over this far (radians) at full tilt. */
export const JUG_TILT = 1.35;

/** Where the spout is, and the way the drink leaves it, for a jug held at (x, y). */
export function spout(j: JugShape, x: number, y: number, tilt: number) {
  const a = -tilt * JUG_TILT;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = SPOUT(j);
  return { x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c, dx: -c, dy: -s };
}

function jugBody(j: JugShape) {
  const p = new Path2D();
  const { W, H } = j;
  const sp = SPOUT(j);
  p.moveTo(-W * 0.06, -H * 0.5);
  p.lineTo(-W * 0.86, -H * 0.5);
  // The spout: a little lip that pinches out at the top left.
  p.quadraticCurveTo(-W * 0.95, -H * 0.5, sp.x, sp.y);
  p.quadraticCurveTo(-W * 0.98, -H * 0.36, -W * 0.94, -H * 0.24);
  // A soft belly down to a flat base.
  p.bezierCurveTo(-W * 1.04, H * 0.05, -W * 1.02, H * 0.4, -W * 0.86, H * 0.5);
  p.lineTo(-W * 0.12, H * 0.5);
  p.bezierCurveTo(W * 0.02, H * 0.4, W * 0.04, H * 0.05, -W * 0.06, -H * 0.5);
  p.closePath();
  return p;
}

export function drawJug(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink) {
  const day = t.name === 'day';
  const a = -tilt * JUG_TILT;
  const body = jugBody(j);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);

  // The handle: a fat loop on the side it's held by.
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba('#ffffff', day ? 0.75 : 0.3);
  ctx.lineWidth = j.W * 0.1;
  ctx.beginPath();
  ctx.moveTo(-j.W * 0.06, -j.H * 0.3);
  ctx.bezierCurveTo(j.W * 0.32, -j.H * 0.32, j.W * 0.32, j.H * 0.22, -j.W * 0.04, j.H * 0.22);
  ctx.stroke();

  ctx.fillStyle = rgba('#ffffff', day ? 0.32 : 0.08);
  ctx.fill(body);

  // The drink inside stays level as the jug tips, rising to the spout.
  ctx.save();
  ctx.clip(body);
  ctx.rotate(-a);
  const tip = spout(j, 0, 0, tilt);
  const rest = j.H * 0.02;
  const level = lerp(rest * Math.cos(a) - j.W * 0.5 * Math.sin(a), tip.y + 3, smoothstep(0.05, 0.42, tilt));
  const span = j.W * 2.5;
  const grad = ctx.createLinearGradient(0, level, 0, level + j.H);
  grad.addColorStop(0, d.color);
  grad.addColorStop(1, d.deep);
  ctx.fillStyle = grad;
  ctx.fillRect(-span, level, span * 2, span);
  ctx.strokeStyle = rgba(mix(d.color, '#ffffff', 0.6), 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-span, level);
  ctx.lineTo(span, level);
  ctx.stroke();
  ctx.restore();

  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba('#ffffff', day ? 0.9 : 0.38);
  ctx.lineWidth = 1.8;
  ctx.stroke(body);
  ctx.strokeStyle = rgba(t.ink, day ? 0.1 : 0.16);
  ctx.lineWidth = 1;
  ctx.stroke(body);
  gloss(ctx, -j.W * 0.78, -j.H * 0.05, j.W * 0.08, j.H * 0.32, day ? 0.6 : 0.25, 0.1);
  ctx.restore();
}

/** One drop in the stream between the spout and wherever it lands. */
export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vol: number;
  /** Stream thickness where this drop left the spout (px). */
  w: number;
  alive: boolean;
}

/** The stream: drops left in order, joined into one soft ribbon. */
export function drawStream(ctx: CanvasRenderingContext2D, drops: Drop[], d: Drink) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // It thins as it falls and speeds up, like a real pour.
  const width = (b: Drop) => b.w * clamp(Math.sqrt(160 / Math.max(1, Math.hypot(b.vx, b.vy))), 0.45, 1);
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass === 0 ? d.color : rgba('#ffffff', 0.45);
    for (let i = 1; i < drops.length; i++) {
      const a = drops[i - 1];
      const b = drops[i];
      if (!a.alive || !b.alive || Math.hypot(a.x - b.x, a.y - b.y) > 40) continue;
      const w = width(b);
      const off = pass ? -w * 0.2 : 0;
      ctx.lineWidth = pass === 0 ? w : Math.max(0.7, w * 0.2);
      ctx.beginPath();
      ctx.moveTo(a.x + off, a.y);
      ctx.lineTo(b.x + off, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
