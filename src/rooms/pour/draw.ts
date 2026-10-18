import type { Theme } from '../../design/tokens';
import { pastel } from '../../design/tokens';
import { clamp, lerp, smoothstep, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { contactShadow } from '../../render/paint';
import { drawFace, type Face } from '../../render/face';
import { WAVE_N, type Glass } from './Glass';
import type { Drink } from './drinks';

/**
 * Glassware for the pour room, drawn in the soft spot language (one lamp,
 * upper left; warm shadows; faces) but with real thickness: walls that are
 * bright at the silhouette and clear in the middle, a rim seen slightly from
 * above, a heavy foot that the drink tints, and a caustic of drink-coloured
 * light thrown onto the table.
 */

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

/** We look at the counter from slightly above: circles read as ellipses this flat. */
const VIEW = 0.085;

/** A glass about `W` px wide, standing on the floor at `floorY`. */
export function glassShape(cx: number, floorY: number, W: number): GlassShape {
  const base = W * 0.11;
  const H = W * 1.22;
  return { cx, bottom: floorY - base, H, wb: W * 0.4, wt: W * 0.47, wall: Math.max(2.5, W * 0.03), base };
}

/** y of a fill height `f` (0..1), and the inside half-width there. */
export const yAt = (g: GlassShape, f: number) => g.bottom - f * g.H;
export const halfAt = (g: GlassShape, f: number) => lerp(g.wb, g.wt, clamp(f, 0, 1.05));
/** Half-height of the ellipse a level makes at fill height `f`. */
const ryAt = (g: GlassShape, f: number) => halfAt(g, f) * VIEW;
/** How far toward the viewer a point `u` (0..1 across) sits on an ellipse: 0 at the sides, 1 in the middle. */
const front = (u: number) => Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));

/** Inside outline, with softly rounded bottom corners. */
function insidePath(g: GlassShape) {
  const p = new Path2D();
  const r = g.wb * 0.24;
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
  const r = g.wb * 0.3;
  const top = yAt(g, 1);
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

export interface GlassLook {
  face: Face;
  time: number;
  /** 0..1: how far the etched line has drawn in (a new glass). */
  lineIn: number;
  /** 0..1: the glint running along the line, left to right (a perfect pour). */
  glint: number;
  /** 0..1: the line lit up, once the glint has passed. */
  lit: number;
  /** 0..1: the line nudging for attention (a miss). */
  nudge: number;
  /** Squash (1 = none) and lean (radians) about the foot. */
  squash?: number;
  lean?: number;
  /** Drawn mirrored in the counter: no shadow, no caustic, no face. */
  reflection?: boolean;
  /** Show the little pointer beside the line (off on the tiny home card). */
  pointer?: boolean;
  /** Fill height of the face (higher when pearls or ice sit at the bottom). */
  faceAt?: number;
  /** Drawn inside the drink, clipped to it (bubbles). */
  inside?: (ctx: CanvasRenderingContext2D) => void;
  /** Drawn inside the glass, clipped to it, over the drink (pearls, ice). */
  extras?: (ctx: CanvasRenderingContext2D) => void;
}

/** One edge of a level's ellipse, with the waves on it: `side` +1 = front, −1 = back. */
function edge(p: Path2D, g: GlassShape, glass: Glass, f: number, side: number, bump: (u: number) => number, move = true, reverse = false) {
  const half = halfAt(g, f);
  const ry = ryAt(g, f);
  for (let k = 0; k <= WAVE_N; k++) {
    const i = reverse ? WAVE_N - k : k;
    const u = i / WAVE_N;
    const x = g.cx - half + u * half * 2;
    const y = yAt(g, f + glass.surface(u)) - bump(u) + side * ry * front(u);
    if (k === 0 && move) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
}

const flat = () => 0;

/** The table under the glass: a warm shadow, and the drink's light thrown through it. */
function drawCounter(ctx: CanvasRenderingContext2D, t: Theme, g: GlassShape, glass: Glass, d: Drink) {
  const W = g.wt * 2;
  const floor = g.bottom + g.base;
  // The lamp is up and to the left, so the shadow falls a little right.
  contactShadow(ctx, t, g.cx + W * 0.06, floor, g.wb * 1.55, g.base * 0.8, 0.24);
  const k = smoothstep(0.02, 0.35, glass.level) * (t.name === 'day' ? 0.55 : 0.4);
  if (k < 0.01) return;
  // Light through the drink lands as a soft coloured pool, brightest at its heart.
  const cx = g.cx + W * 0.3;
  const cy = floor + W * 0.015;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.16);
  const r = W * 0.5;
  const c = ctx.createRadialGradient(-r * 0.15, 0, 0, 0, 0, r);
  c.addColorStop(0, rgba(mix(d.color, '#ffffff', 0.55), k));
  c.addColorStop(0.35, rgba(d.color, k * 0.55));
  c.addColorStop(1, rgba(d.color, 0));
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawGlass(ctx: CanvasRenderingContext2D, t: Theme, g: GlassShape, glass: Glass, d: Drink, look: GlassLook) {
  const day = t.name === 'day';
  const W = g.wt * 2;
  const floor = g.bottom + g.base;
  const mirror = !!look.reflection;
  if (!mirror) drawCounter(ctx, t, g, glass, d);

  ctx.save();
  // Squash and lean about the middle of the foot.
  const sq = look.squash ?? 1;
  const lean = look.lean ?? 0;
  if (sq !== 1 || lean) {
    ctx.translate(g.cx, floor);
    ctx.rotate(lean);
    ctx.scale(1 / Math.sqrt(sq), sq);
    ctx.translate(-g.cx, -floor);
  }

  const outside = outsidePath(g);
  const inside = insidePath(g);
  const top = yAt(g, 1);
  const rimRy = ryAt(g, 1);
  const lit = rgba('#ffffff', day ? 0.9 : 0.42);

  // The back of the glass: barely there, and the far half of the rim.
  ctx.fillStyle = rgba('#ffffff', day ? 0.14 : 0.045);
  ctx.fill(outside);
  ctx.strokeStyle = day ? rgba(t.ink, 0.16) : rgba('#ffffff', 0.16);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, rimRy, 0, Math.PI, TAU);
  ctx.stroke();

  // The drink.
  ctx.save();
  ctx.clip(inside);
  const level = glass.level;
  if (level > 0.002) {
    const body = new Path2D();
    edge(body, g, glass, level, 1, flat);
    body.lineTo(g.cx + g.wt + 4, g.bottom + 4);
    body.lineTo(g.cx - g.wt - 4, g.bottom + 4);
    body.closePath();
    const vy = ctx.createLinearGradient(0, yAt(g, level), 0, g.bottom);
    vy.addColorStop(0, d.color);
    vy.addColorStop(1, d.deep);
    ctx.fillStyle = vy;
    ctx.fill(body);
    // Round, not flat: deeper toward the walls, deepest on the side away from the lamp.
    const vx = ctx.createLinearGradient(g.cx - g.wt, 0, g.cx + g.wt, 0);
    const sh = day ? 1.5 : 1;
    vx.addColorStop(0, rgba(d.deep, 0.32 * sh));
    vx.addColorStop(0.2, rgba(d.deep, 0));
    vx.addColorStop(0.62, rgba(d.deep, 0));
    vx.addColorStop(1, rgba(d.deep, Math.min(1, 0.5 * sh)));
    ctx.fillStyle = vx;
    ctx.fill(body);
    if (look.inside) {
      ctx.save();
      ctx.clip(body);
      look.inside(ctx);
      ctx.restore();
    }
    // The top of the drink, seen from a little above, lit by the lamp.
    const face = new Path2D();
    edge(face, g, glass, level, -1, flat);
    edge(face, g, glass, level, 1, flat, false, true);
    face.closePath();
    const half = halfAt(g, level);
    const tg = ctx.createLinearGradient(g.cx - half, 0, g.cx + half, 0);
    tg.addColorStop(0, mix(d.color, '#ffffff', 0.5));
    tg.addColorStop(1, mix(d.color, d.deep, 0.15));
    ctx.fillStyle = tg;
    ctx.fill(face);
    // The meniscus: the near edge catches a line of light.
    const near = new Path2D();
    edge(near, g, glass, level, 1, flat);
    ctx.strokeStyle = rgba('#ffffff', day ? 0.75 : 0.55);
    ctx.lineWidth = 1.4;
    ctx.stroke(near);
  }
  if (glass.foam > 0.004) {
    // Froth: a soft, lumpy collar riding on the drink, with its own lit top.
    const ftop = level + glass.foam;
    const amp = Math.min(3, glass.foam * 40);
    const lumps = (u: number) => (Math.sin(u * 19 + look.time * 2.2) * 0.5 + Math.sin(u * 7.3 - look.time * 1.3) * 0.5) * amp;
    const foam = new Path2D();
    edge(foam, g, glass, ftop, 1, lumps);
    edge(foam, g, glass, level, 1, flat, false, true);
    foam.closePath();
    ctx.fillStyle = rgba(d.foam, 0.96);
    ctx.fill(foam);
    const cap = new Path2D();
    edge(cap, g, glass, ftop, -1, lumps);
    edge(cap, g, glass, ftop, 1, lumps, false, true);
    cap.closePath();
    ctx.fillStyle = mix(d.foam, '#ffffff', 0.5);
    ctx.fill(cap);
    ctx.fillStyle = rgba(mix(d.foam, d.color, 0.4), 0.55);
    const half = halfAt(g, level);
    for (let i = 0; i < 11; i++) {
      const u = (i + 0.5) / 11;
      ctx.beginPath();
      ctx.arc(g.cx - half + u * half * 2, yAt(g, level + glass.foam * 0.45) + ryAt(g, level) * front(u), 1.2 + (i % 3) * 0.55, 0, TAU);
      ctx.fill();
    }
  }
  look.extras?.(ctx);
  ctx.restore();

  if (!mirror) drawLine(ctx, t, g, glass, look);

  // A face on the front of the glass, under its front wall.
  if (!mirror) {
    ctx.save();
    ctx.translate(g.cx, yAt(g, look.faceAt ?? 0.3));
    // At dusk an empty glass is dark behind the face, so it's drawn light until the drink rises.
    const faceInk = day || level > 0.42 ? t.faceInk : mix(t.ink, t.faceInk, smoothstep(0.2, 0.42, level));
    drawFace(ctx, look.face, W * 0.38, { ink: faceInk, blush: pastel.pink, alpha: 0.92 });
    ctx.restore();
  }

  // The front wall: bright where you look along the glass (its edges), clear
  // where you look through it (its middle).
  // Against a light room glass edges look dark (they bend the darker
  // surroundings in); against a dark one they look bright.
  const edgeC = day ? t.ink : '#ffffff';
  const wallA = day ? 0.2 : 0.2;
  const fr = ctx.createLinearGradient(g.cx - g.wt - g.wall, 0, g.cx + g.wt + g.wall, 0);
  fr.addColorStop(0, rgba(edgeC, wallA));
  fr.addColorStop(0.07, rgba(edgeC, wallA * 0.35));
  fr.addColorStop(0.5, rgba(edgeC, wallA * 0.04));
  fr.addColorStop(0.93, rgba(edgeC, wallA * 0.3));
  fr.addColorStop(1, rgba(edgeC, wallA * 0.8));
  const walls = new Path2D();
  walls.addPath(outside);
  walls.addPath(inside);
  ctx.fillStyle = fr;
  ctx.fill(walls, 'evenodd');

  // The foot: a thick lens of glass, tinted by what's above it.
  const footPath = new Path2D();
  const fr2 = g.wb * 0.3;
  footPath.moveTo(g.cx - g.wb - g.wall, g.bottom - g.wb * 0.05);
  footPath.lineTo(g.cx - g.wb - g.wall, floor - fr2);
  footPath.quadraticCurveTo(g.cx - g.wb - g.wall, floor, g.cx - g.wb - g.wall + fr2, floor);
  footPath.lineTo(g.cx + g.wb + g.wall - fr2, floor);
  footPath.quadraticCurveTo(g.cx + g.wb + g.wall, floor, g.cx + g.wb + g.wall, floor - fr2);
  footPath.lineTo(g.cx + g.wb + g.wall, g.bottom - g.wb * 0.05);
  footPath.closePath();
  const fg = ctx.createLinearGradient(0, g.bottom, 0, floor);
  const tint = level > 0.01 ? mix('#ffffff', d.color, 0.45) : '#ffffff';
  fg.addColorStop(0, rgba(tint, day ? 0.5 : 0.2));
  fg.addColorStop(1, rgba(tint, day ? 0.22 : 0.08));
  ctx.fillStyle = fg;
  ctx.fill(footPath);
  // The inside floor of the glass, and the foot's lower edge, catch light.
  ctx.strokeStyle = rgba('#ffffff', day ? 0.6 : 0.28);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.bottom, g.wb * 0.86, ryAt(g, 0), 0, 0.15, Math.PI - 0.15);
  ctx.stroke();

  // Silhouette and the near half of the rim: a dark edge with a bright inner
  // lip by day, a bright edge at dusk.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = day ? rgba(t.ink, 0.3) : lit;
  ctx.lineWidth = 1.4;
  ctx.stroke(outside);
  ctx.strokeStyle = day ? rgba('#ffffff', 0.85) : rgba(t.ink, 0.2);
  ctx.lineWidth = 1;
  ctx.stroke(inside);
  ctx.beginPath();
  ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, rimRy, 0, 0, Math.PI);
  ctx.strokeStyle = day ? rgba(t.ink, 0.28) : lit;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  if (day) {
    ctx.beginPath();
    ctx.ellipse(g.cx, top + 1.2, g.wt + g.wall * 0.2, rimRy, 0, 0.12, Math.PI - 0.12);
    ctx.strokeStyle = rgba('#ffffff', 0.95);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  if (!mirror) {
    // The long window highlight down the lamp side, and a thin rim light on the other.
    const hx = g.cx - g.wt * 0.74;
    const h0 = yAt(g, 0.9);
    const h1 = yAt(g, 0.12);
    const hl = ctx.createLinearGradient(0, h0, 0, h1);
    hl.addColorStop(0, rgba('#ffffff', 0));
    hl.addColorStop(0.18, rgba('#ffffff', day ? 0.62 : 0.32));
    hl.addColorStop(0.7, rgba('#ffffff', day ? 0.32 : 0.14));
    hl.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.roundRect(hx - W * 0.028, h0, W * 0.056, h1 - h0, W * 0.028);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', day ? 0.85 : 0.5);
    ctx.beginPath();
    ctx.roundRect(hx + W * 0.055, yAt(g, 0.82), W * 0.016, g.H * 0.16, W * 0.008);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', day ? 0.4 : 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.cx + g.wt - g.wall * 0.2, yAt(g, 0.88));
    ctx.lineTo(g.cx + g.wb + (g.wt - g.wb) * 0.2 - g.wall * 0.2, yAt(g, 0.2));
    ctx.stroke();
    // A pin-prick of light where the lamp catches the rim.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(g.cx - g.wt * 0.55, top + rimRy * 0.85, 1.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The fill line: a ring etched round the glass, so from a little above it's
 * the near half of an ellipse — engraved (a dark cut with a lit lower lip),
 * with a small pointer outside the glass. It draws in when a glass arrives,
 * and on a perfect pour a glint runs along it and leaves it lit.
 */
function drawLine(ctx: CanvasRenderingContext2D, t: Theme, g: GlassShape, glass: Glass, look: GlassLook) {
  if (look.lineIn <= 0) return;
  const day = t.name === 'day';
  const ly = yAt(g, glass.line);
  const rx = halfAt(g, glass.line) - 1;
  const ry = ryAt(g, glass.line);
  const reach = Math.PI * clamp(look.lineIn, 0, 1);
  const pulse = look.nudge * (0.5 + 0.5 * Math.sin(look.time * 9));
  const gold = mix(pastel.butter, '#ffffff', day ? 0 : 0.15);
  ctx.save();
  ctx.lineCap = 'round';
  // From the left wall (angle π) round the front toward the right wall (0).
  const arc = (from: number, to: number) => {
    ctx.beginPath();
    ctx.ellipse(g.cx, ly, rx, ry, 0, Math.PI - from, Math.PI - to, true);
  };
  // The cut and its lit lip.
  ctx.strokeStyle = rgba(t.ink, (day ? 0.42 : 0.55) + pulse * 0.3);
  ctx.lineWidth = 1.8 + pulse * 1.2;
  arc(0, reach);
  ctx.stroke();
  ctx.save();
  ctx.translate(0, 1.4);
  ctx.strokeStyle = rgba('#ffffff', day ? 0.75 : 0.32);
  ctx.lineWidth = 1;
  arc(0, reach);
  ctx.stroke();
  ctx.restore();

  // Lit: gold behind the glint, with the glint itself a bright bead of light.
  const litTo = Math.PI * clamp(Math.max(look.glint, look.lit > 0.99 ? 1 : 0), 0, 1);
  if (look.lit > 0.01 && litTo > 0) {
    // A deeper gold under a bright one, so it reads on pale drinks too.
    const a = Math.min(1, look.lit * 1.2);
    ctx.strokeStyle = rgba(mix(gold, t.ink, 0.45), a * 0.85);
    ctx.lineWidth = 4;
    arc(0, litTo);
    ctx.stroke();
    ctx.strokeStyle = rgba(gold, a);
    ctx.lineWidth = 2.2;
    arc(0, litTo);
    ctx.stroke();
  }
  if (look.glint > 0 && look.glint < 1) {
    const a = Math.PI - Math.PI * look.glint;
    const gx = g.cx + rx * Math.cos(a);
    const gy = ly + ry * Math.sin(a);
    const r = g.wt * 0.32;
    const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    gl.addColorStop(0, rgba('#ffffff', 0.95));
    gl.addColorStop(0.15, rgba(gold, 0.7));
    gl.addColorStop(1, rgba(gold, 0));
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.ellipse(gx, gy, r, r * 0.4, 0, 0, TAU);
    ctx.fill();
  }

  // The pointer: a small soft triangle just outside the right wall.
  const k = look.pointer === false ? 0 : smoothstep(0.4, 1, look.lineIn);
  if (k > 0) {
    const px = g.cx + g.wt + g.wall + 7 + (1 - k) * 10;
    const s = 5.5;
    ctx.globalAlpha = k * (look.lit > 0.01 ? 1 : day ? 0.5 : 0.6);
    ctx.fillStyle = look.lit > 0.01 ? mix(t.ink, gold, look.lit) : t.ink;
    ctx.beginPath();
    ctx.moveTo(px, ly);
    ctx.lineTo(px + s * 1.3, ly - s);
    ctx.quadraticCurveTo(px + s * 1.6, ly, px + s * 1.3, ly + s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** The jug, measured from where it's held (the handle side, half way up). */
export interface JugShape {
  W: number;
  H: number;
}

export const jugShape = (glassW: number): JugShape => ({ W: glassW * 0.8, H: glassW * 0.99 });

/** The spout's tip in the jug's own frame. */
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
  p.moveTo(-W * 0.08, -H * 0.5);
  p.lineTo(-W * 0.84, -H * 0.5);
  // The spout: a little lip that pinches out at the top left.
  p.quadraticCurveTo(-W * 0.95, -H * 0.5, sp.x, sp.y);
  p.quadraticCurveTo(-W * 0.99, -H * 0.37, -W * 0.93, -H * 0.27);
  // A full belly down to a flat base.
  p.bezierCurveTo(-W * 1.06, H * 0.02, -W * 1.04, H * 0.38, -W * 0.86, H * 0.5);
  p.lineTo(-W * 0.12, H * 0.5);
  p.bezierCurveTo(W * 0.06, H * 0.38, W * 0.06, H * 0.02, -W * 0.08, -H * 0.5);
  p.closePath();
  return p;
}

export function drawJug(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink, alpha = 1) {
  if (alpha <= 0.01) return;
  const day = t.name === 'day';
  const a = -tilt * JUG_TILT;
  const body = jugBody(j);
  const { W, H } = j;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);

  // The handle: a solid loop of glass, lit along its outer curve.
  ctx.lineCap = 'round';
  const loop = () => {
    ctx.beginPath();
    ctx.moveTo(-W * 0.06, -H * 0.3);
    ctx.bezierCurveTo(W * 0.36, -H * 0.34, W * 0.36, H * 0.24, -W * 0.03, H * 0.22);
  };
  ctx.strokeStyle = day ? rgba(t.ink, 0.22) : rgba('#ffffff', 0.2);
  ctx.lineWidth = W * 0.11;
  loop();
  ctx.stroke();
  ctx.strokeStyle = day ? rgba('#ffffff', 0.7) : rgba(t.ink, 0.16);
  ctx.lineWidth = W * 0.035;
  loop();
  ctx.stroke();
  ctx.save();
  ctx.translate(-W * 0.012, -W * 0.02);
  ctx.strokeStyle = rgba('#ffffff', day ? 0.85 : 0.4);
  ctx.lineWidth = 1.4;
  loop();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = rgba('#ffffff', day ? 0.18 : 0.05);
  ctx.fill(body);

  // The drink inside stays level as the jug tips, rising to the spout.
  ctx.save();
  ctx.clip(body);
  ctx.rotate(-a);
  const tip = spout(j, 0, 0, tilt);
  const rest = -H * 0.02;
  const level = lerp(rest * Math.cos(a) - W * 0.5 * Math.sin(a), tip.y + 3, smoothstep(0.05, 0.42, tilt));
  const span = W * 2.5;
  const grad = ctx.createLinearGradient(0, level, 0, level + H);
  grad.addColorStop(0, d.color);
  grad.addColorStop(1, d.deep);
  ctx.fillStyle = grad;
  ctx.fillRect(-span, level, span * 2, span);
  // A lit band just under the surface, then the bright line of the surface itself.
  ctx.fillStyle = rgba(mix(d.color, '#ffffff', 0.45), 0.85);
  ctx.fillRect(-span, level, span * 2, Math.max(2, W * 0.035));
  ctx.strokeStyle = rgba('#ffffff', day ? 0.8 : 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-span, level);
  ctx.lineTo(span, level);
  ctx.stroke();
  ctx.restore();

  // Thick walls: bright at the silhouette, clear in the middle.
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = day ? rgba(t.ink, 0.08) : rgba('#ffffff', 0.12);
  ctx.lineWidth = W * 0.09;
  ctx.stroke(body);
  // Round: the far side away from the lamp sits in a little shade.
  const sh = ctx.createLinearGradient(-W * 1.05, 0, W * 0.05, 0);
  sh.addColorStop(0, rgba(t.ink, 0));
  sh.addColorStop(0.7, rgba(t.ink, 0));
  sh.addColorStop(1, rgba(t.ink, day ? 0.08 : 0.16));
  ctx.fillStyle = sh;
  ctx.fill(body);
  // The heavy base.
  ctx.fillStyle = rgba('#ffffff', day ? 0.3 : 0.1);
  ctx.fillRect(-W * 1.1, H * 0.43, W * 1.2, H * 0.08);
  ctx.restore();

  // Silhouette (dark by day, bright at dusk), the mouth's rim, and the lamp's highlight.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = day ? rgba(t.ink, 0.3) : rgba('#ffffff', 0.42);
  ctx.lineWidth = 1.5;
  ctx.stroke(body);
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = day ? rgba('#ffffff', 0.9) : rgba(t.ink, 0.18);
  ctx.lineWidth = 2.4;
  ctx.stroke(body);
  ctx.restore();
  ctx.strokeStyle = day ? rgba(t.ink, 0.22) : rgba('#ffffff', 0.36);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-W * 0.47, -H * 0.5, W * 0.38, W * 0.05, 0, 0, Math.PI);
  ctx.stroke();
  const hl = ctx.createLinearGradient(0, -H * 0.3, 0, H * 0.3);
  hl.addColorStop(0, rgba('#ffffff', 0));
  hl.addColorStop(0.25, rgba('#ffffff', day ? 0.6 : 0.3));
  hl.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.roundRect(-W * 0.86, -H * 0.3, W * 0.06, H * 0.6, W * 0.03);
  ctx.fill();
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

/** The stream: drops left in order, joined into one soft ribbon with a lit edge. */
export function drawStream(ctx: CanvasRenderingContext2D, drops: Drop[], d: Drink) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // It thins as it falls and speeds up, like a real pour.
  const width = (b: Drop) => b.w * clamp(Math.sqrt(160 / Math.max(1, Math.hypot(b.vx, b.vy))), 0.42, 1);
  const passes: [string, (w: number) => number, (w: number) => number][] = [
    [d.deep, (w) => w + 1, () => 0.6],
    [d.color, (w) => w, () => 0],
    [rgba('#ffffff', 0.55), (w) => Math.max(0.7, w * 0.22), (w) => -w * 0.22],
  ];
  for (const [color, lw, off] of passes) {
    ctx.strokeStyle = color;
    for (let i = 1; i < drops.length; i++) {
      const a = drops[i - 1];
      const b = drops[i];
      if (!a.alive || !b.alive || Math.hypot(a.x - b.x, a.y - b.y) > 40) continue;
      const w = width(b);
      ctx.lineWidth = lw(w);
      const o = off(w);
      ctx.beginPath();
      ctx.moveTo(a.x + o, a.y);
      ctx.lineTo(b.x + o, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Where the stream meets the drink: a small ring of ripples, and a bead of light. */
export function drawImpact(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, x: number, k: number, time: number, d: Drink) {
  if (k <= 0.02) return;
  const f = glass.top;
  const y = yAt(g, f);
  const half = halfAt(g, f);
  const rx = Math.min(half * 0.55, 6 + k * 10);
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.cx - half, y - 20, half * 2, 40);
  ctx.clip();
  for (let i = 0; i < 2; i++) {
    const p = (time * 2.6 + i * 0.5) % 1;
    ctx.strokeStyle = rgba(mix(d.color, '#ffffff', 0.7), (1 - p) * 0.75 * k);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * (0.5 + p), rx * (0.5 + p) * VIEW * 2.2, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
