import type { Theme } from '../../design/tokens';
import { pastel, type } from '../../design/tokens';
import { clamp, lerp, smoothstep, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { contactShadow } from '../../render/paint';
import { drawFace, type Face } from '../../render/face';
import { WAVE_N, type Glass } from './Glass';
import type { Drink, Pourer } from './drinks';

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
  /** 0..1: steam on the glass (hot cocoa), hiding the line behind it. */
  fog?: number;
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

/** The meniscus: the drink curves and climbs the glass where it meets the wall. */
const meniscus = (u: number) => {
  const e = Math.min(u, 1 - u) / 0.15;
  return e >= 1 ? 0 : 4.6 * Math.pow(1 - e, 2.2);
};

/** The table under the glass: a warm shadow, and the drink's light thrown through it. */
function drawCounter(ctx: CanvasRenderingContext2D, t: Theme, g: GlassShape, glass: Glass, d: Drink) {
  const W = g.wt * 2;
  const floor = g.bottom + g.base;
  // The lamp is up and to the left, so the shadow falls a little right.
  contactShadow(ctx, t, g.cx + W * 0.06, floor, g.wb * 1.55, g.base * 0.8, 0.24);
  const k = smoothstep(0.02, 0.35, glass.level) * (t.light ? 0.55 : 0.4);
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
  const day = t.light;
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
    edge(body, g, glass, level, 1, meniscus);
    body.lineTo(g.cx + g.wt + 4, g.bottom + 4);
    body.lineTo(g.cx - g.wt - 4, g.bottom + 4);
    body.closePath();
    const vy = ctx.createLinearGradient(0, yAt(g, level) - 4, 0, g.bottom);
    // Luminous near the surface where the lamp gets in; noticeably deeper and richer toward the bottom.
    vy.addColorStop(0, mix(d.color, '#ffffff', 0.22));
    vy.addColorStop(0.24, d.color);
    vy.addColorStop(0.72, d.deep);
    vy.addColorStop(1, mix(d.deep, '#1A0C06', 0.28));
    ctx.fillStyle = vy;
    ctx.fill(body);
    // Round, not flat: deeper toward the walls, deepest on the side away from the lamp.
    const vx = ctx.createLinearGradient(g.cx - g.wt, 0, g.cx + g.wt, 0);
    const sh = day ? 1.5 : 1;
    vx.addColorStop(0, rgba(d.deep, 0.36 * sh));
    vx.addColorStop(0.18, rgba(d.deep, 0));
    vx.addColorStop(0.6, rgba(d.deep, 0));
    vx.addColorStop(1, rgba(d.deep, Math.min(1, 0.55 * sh)));
    ctx.fillStyle = vx;
    ctx.fill(body);
    // Soft upward bounce of refracted light at the bottom of the drink.
    const bounce = ctx.createLinearGradient(0, g.bottom - g.H * 0.08, 0, g.bottom);
    bounce.addColorStop(0, rgba(d.color, 0));
    bounce.addColorStop(1, rgba(mix(d.color, '#ffffff', 0.35), day ? 0.24 : 0.14));
    ctx.fillStyle = bounce;
    ctx.fill(body);
    if (look.inside) {
      ctx.save();
      ctx.clip(body);
      look.inside(ctx);
      ctx.restore();
    }
    // The top of the drink, seen from a little above, with a curved meniscus at the walls.
    const face = new Path2D();
    edge(face, g, glass, level, -1, meniscus);
    edge(face, g, glass, level, 1, meniscus, false, true);
    face.closePath();
    const half = halfAt(g, level);
    const surfY = yAt(g, level);
    const tg = ctx.createLinearGradient(g.cx - half, surfY - ryAt(g, level), g.cx + half, surfY + ryAt(g, level));
    tg.addColorStop(0, mix(d.color, '#ffffff', 0.54));
    tg.addColorStop(0.55, mix(d.color, '#ffffff', 0.22));
    tg.addColorStop(1, mix(d.color, d.deep, 0.22));
    ctx.fillStyle = tg;
    ctx.fill(face);
    // The lamp on the drink's surface: a bright surface highlight lozenge + crisp specular crescent.
    const sheen = ctx.createRadialGradient(g.cx - half * 0.34, surfY, 0, g.cx - half * 0.34, surfY, half * 0.58);
    sheen.addColorStop(0, rgba('#ffffff', day ? 0.68 : 0.42));
    sheen.addColorStop(0.5, rgba('#ffffff', day ? 0.25 : 0.14));
    sheen.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = sheen;
    ctx.fill(face);
    ctx.save();
    ctx.clip(face);
    ctx.fillStyle = rgba('#ffffff', day ? 0.52 : 0.32);
    ctx.beginPath();
    ctx.ellipse(g.cx - half * 0.28, surfY - ryAt(g, level) * 0.12, half * 0.34, Math.max(1.5, ryAt(g, level) * 0.44), -0.04, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Translucent meniscus wall fillets where the liquid climbs the left and right glass walls.
    const menBand = ctx.createLinearGradient(g.cx - half, 0, g.cx + half, 0);
    menBand.addColorStop(0, rgba('#ffffff', day ? 0.55 : 0.35));
    menBand.addColorStop(0.14, rgba(d.color, 0));
    menBand.addColorStop(0.86, rgba(d.color, 0));
    menBand.addColorStop(1, rgba(mix(d.color, '#ffffff', 0.4), day ? 0.42 : 0.26));
    ctx.fillStyle = menBand;
    ctx.fill(face);
    // The meniscus rim: the near and far edges catch a bright line of light.
    const far = new Path2D();
    edge(far, g, glass, level, -1, meniscus);
    ctx.strokeStyle = rgba('#ffffff', day ? 0.38 : 0.24);
    ctx.lineWidth = 1.0;
    ctx.stroke(far);
    const near = new Path2D();
    edge(near, g, glass, level, 1, meniscus);
    ctx.strokeStyle = rgba('#ffffff', day ? 0.85 : 0.62);
    ctx.lineWidth = 1.65;
    ctx.stroke(near);
  }
  if (glass.foam > 0.004) {
    // Froth: a soft, lumpy collar riding on the drink, with mixed bubble sizes and a few popping.
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
    const half = halfAt(g, level);
    const bubbleRadii = [0.65, 1.8, 1.0, 2.5, 0.8, 1.4, 2.9, 0.7, 1.9, 1.2, 2.2, 0.85, 1.6, 2.4];
    for (let i = 0; i < bubbleRadii.length; i++) {
      const u = (i + 0.45) / bubbleRadii.length;
      const bx = g.cx - half + u * half * 2;
      const by = yAt(g, level + glass.foam * (0.22 + ((i * 7) % 6) * 0.12)) + ryAt(g, level) * front(u);
      const br = bubbleRadii[i];
      ctx.fillStyle = rgba(mix(d.foam, d.color, 0.38), 0.52);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
      if (br > 1.5) {
        ctx.fillStyle = rgba('#ffffff', 0.65);
        ctx.beginPath();
        ctx.arc(bx - br * 0.28, by - br * 0.28, br * 0.32, 0, TAU);
        ctx.fill();
      }
    }
    // A few tiny foam bubbles popping along the top of the collar.
    for (let p = 0; p < 3; p++) {
      const cycle = (look.time * (1.35 + p * 0.3) + p * 0.37) % 1;
      const u = 0.2 + ((p * 0.29 + Math.floor(look.time * (1.35 + p * 0.3)) * 0.17) % 0.6);
      const px = g.cx - half + u * half * 2;
      const py = yAt(g, ftop) + ryAt(g, ftop) * front(u) * 0.5 - cycle * 3.5;
      if (cycle < 0.65) {
        const r = (1.2 + p * 0.4) * (0.6 + cycle * 0.6);
        ctx.fillStyle = rgba(mix(d.foam, '#ffffff', 0.65), 0.85);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.fill();
      } else {
        const popK = (cycle - 0.65) / 0.35;
        const r = (1.6 + p * 0.4) * (1 + popK * 0.9);
        ctx.strokeStyle = rgba('#ffffff', (1 - popK) * 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.stroke();
      }
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
    let faceInk = day || level > 0.42 ? t.faceInk : mix(t.ink, t.faceInk, smoothstep(0.2, 0.42, level));
    // Over a dark drink like cola, the face goes light as the drink reaches it.
    const at = look.faceAt ?? 0.3;
    if (d.dark) faceInk = mix(faceInk, '#FFF1E2', smoothstep(at - 0.12, at + 0.04, level));
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

  // The foot: a thick lens of glass, tinted by what's above it, with a clear refraction band.
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
  const tint = level > 0.01 ? mix('#ffffff', d.color, 0.5) : '#ffffff';
  fg.addColorStop(0, rgba(tint, day ? 0.58 : 0.26));
  fg.addColorStop(0.55, rgba(mix(tint, day ? t.ink : '#ffffff', 0.18), day ? 0.32 : 0.16));
  fg.addColorStop(1, rgba(tint, day ? 0.28 : 0.12));
  ctx.fillStyle = fg;
  ctx.fill(footPath);
  // Base refraction band: a luminous internal lens band across the thick glass base.
  ctx.save();
  ctx.clip(footPath);
  const refY = g.bottom + g.base * 0.48;
  const refGrad = ctx.createLinearGradient(g.cx - g.wb, 0, g.cx + g.wb, 0);
  refGrad.addColorStop(0, rgba('#ffffff', day ? 0.65 : 0.34));
  refGrad.addColorStop(0.35, rgba(tint, day ? 0.82 : 0.42));
  refGrad.addColorStop(0.75, rgba(level > 0.01 ? d.deep : t.ink, day ? 0.26 : 0.18));
  refGrad.addColorStop(1, rgba('#ffffff', day ? 0.55 : 0.28));
  ctx.fillStyle = refGrad;
  ctx.beginPath();
  ctx.ellipse(g.cx, refY, g.wb * 0.94, Math.max(2.2, g.base * 0.26), 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', day ? 0.78 : 0.42);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.bottom + g.base * 0.72, g.wb * 0.82, Math.max(1.2, ryAt(g, 0) * 0.75), 0, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.restore();
  // The inside floor of the glass, and the foot's lower edge, catch light.
  ctx.strokeStyle = rgba('#ffffff', day ? 0.72 : 0.36);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(g.cx, g.bottom, g.wb * 0.88, ryAt(g, 0), 0, 0.12, Math.PI - 0.12);
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
    // Crisp rim highlights: main lamp glint on the left-front lip and a secondary glint on the right-back lip.
    ctx.strokeStyle = rgba('#ffffff', day ? 0.98 : 0.78);
    ctx.lineWidth = 2.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, rimRy, 0, Math.PI * 0.64, Math.PI * 0.88);
    ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', day ? 0.72 : 0.48);
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, rimRy, 0, Math.PI * 0.08, Math.PI * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(g.cx, top, g.wt + g.wall * 0.5, rimRy, 0, Math.PI * 1.18, Math.PI * 1.36);
    ctx.stroke();
    // Primary window highlight down the lamp side.
    const hx = g.cx - g.wt * 0.74;
    const h0 = yAt(g, 0.9);
    const h1 = yAt(g, 0.12);
    const hl = ctx.createLinearGradient(0, h0, 0, h1);
    hl.addColorStop(0, rgba('#ffffff', 0));
    hl.addColorStop(0.18, rgba('#ffffff', day ? 0.65 : 0.35));
    hl.addColorStop(0.7, rgba('#ffffff', day ? 0.35 : 0.16));
    hl.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.roundRect(hx - W * 0.028, h0, W * 0.056, h1 - h0, W * 0.028);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', day ? 0.85 : 0.5);
    ctx.beginPath();
    ctx.roundRect(hx + W * 0.055, yAt(g, 0.82), W * 0.016, g.H * 0.16, W * 0.008);
    ctx.fill();
    // Second soft vertical reflection band on the right side of the tumbler.
    const rx2 = g.cx + g.wt * 0.56;
    const r0 = yAt(g, 0.84);
    const r1 = yAt(g, 0.16);
    const rl = ctx.createLinearGradient(0, r0, 0, r1);
    rl.addColorStop(0, rgba('#ffffff', 0));
    rl.addColorStop(0.25, rgba('#ffffff', day ? 0.34 : 0.18));
    rl.addColorStop(0.75, rgba('#ffffff', day ? 0.2 : 0.1));
    rl.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = rl;
    ctx.beginPath();
    ctx.roundRect(rx2 - W * 0.018, r0, W * 0.036, r1 - r0, W * 0.018);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', day ? 0.48 : 0.22);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(g.cx + g.wt - g.wall * 0.2, yAt(g, 0.88));
    ctx.lineTo(g.cx + g.wb + (g.wt - g.wb) * 0.2 - g.wall * 0.2, yAt(g, 0.2));
    ctx.stroke();
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
  const day = t.light;
  // Behind the steam the line all but disappears; a ghost of it stays.
  const hidden = 1 - 0.97 * clamp(look.fog ?? 0, 0, 1);
  const ly = yAt(g, glass.line);
  const rx = halfAt(g, glass.line) - 1;
  const ry = ryAt(g, glass.line);
  const reach = Math.PI * clamp(look.lineIn, 0, 1);
  const pulse = look.nudge * (0.5 + 0.5 * Math.sin(look.time * 9));
  const gold = mix(pastel.butter, '#ffffff', day ? 0 : 0.15);
  ctx.save();
  ctx.globalAlpha = hidden;
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
    ctx.globalAlpha = hidden * k * (look.lit > 0.01 ? 1 : day ? 0.5 : 0.6);
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

/**
 * What the drink is poured from, measured in its own frame: the glass jug is
 * held by its handle (the origin) and pours from the lip at its top left; the
 * bottle and the carton are held around the middle and tip over to the left.
 */
export interface JugShape {
  kind: Pourer;
  W: number;
  H: number;
}

export function jugShape(glassW: number, kind: Pourer = 'jug'): JugShape {
  if (kind === 'bottle') return { kind, W: glassW * 1.24, H: glassW * 1.28 };
  if (kind === 'carton') return { kind, W: glassW, H: glassW * 0.74 };
  if (kind === 'pitcher') return { kind, W: glassW * 0.74, H: glassW * 1.06 };
  return { kind, W: glassW * 0.8, H: glassW * 0.99 };
}

/** The carton's front face, and the roof above it (× glass width). */
const CARTON = { w: 0.6, side: 0.17, roof: 0.2, fin: 0.07 };

/** Where the drink leaves it, and which way it's heading, in its own frame. */
function mouth(j: JugShape) {
  switch (j.kind) {
    case 'bottle':
      // Angled a little back toward the base, so the stream falls rather than shoots out.
      return { x: 0, y: -j.H / 2 - 1, dx: -0.67, dy: -0.74 };
    case 'carton':
      return { x: -j.W * (CARTON.w / 2 + 0.08), y: -j.H / 2 - j.W * CARTON.roof * 0.62, dx: -0.8, dy: -0.6 };
    case 'pitcher':
      return { x: -j.W * 1.06, y: -j.H * 0.5 - 4, dx: -1, dy: 0 };
    default:
      return { x: -j.W * 1.1, y: -j.H * 0.5 - 2, dx: -1, dy: 0 };
  }
}

/** Each tips over this far (radians) at full tilt; a bottle goes past level. */
const TIP: Record<Pourer, number> = { jug: 1.35, pitcher: 1.2, bottle: 2.1, carton: 1.75 };

/** How high above the glass's rim it's held, so that it clears the rim upright and tipped. */
export function hover(j: JugShape) {
  if (j.kind === 'jug') return j.W * 0.85 + 24;
  // The tall pitcher swings its heel down as it tips, so it's held higher.
  if (j.kind === 'pitcher') return j.H / 2 + j.W * 0.42 + 12;
  return j.H / 2 + 12;
}

/** Where the mouth is, and the way the drink leaves it, for one held at (x, y). */
export function spout(j: JugShape, x: number, y: number, tilt: number) {
  const a = -tilt * TIP[j.kind];
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = mouth(j);
  return { x: x + p.x * c - p.y * s, y: y + p.x * s + p.y * c, dx: p.dx * c - p.dy * s, dy: p.dx * s + p.dy * c };
}

/** Pours `d` from whatever it comes in. */
/** `spent` (0..1): how much of it has gone into the glass, so what's left stands lower when it's set upright. */
export function drawJug(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink, alpha = 1, spent = 0) {
  if (alpha <= 0.01) return;
  if (j.kind === 'bottle') drawBottle(ctx, t, j, x, y, tilt, d, alpha, spent);
  else if (j.kind === 'carton') drawCarton(ctx, t, j, x, y, tilt, alpha);
  else if (j.kind === 'pitcher') drawPitcher(ctx, t, j, x, y, tilt, d, alpha, spent);
  else drawGlassJug(ctx, t, j, x, y, tilt, d, alpha, spent);
}

/**
 * A level surface inside a tipped vessel: from where it rests, to `over` px
 * above the mouth as it tips (a jug's lip is its top; a bottle tipped mouth
 * down still has its neck and shoulder full).
 */
function surfaceY(j: JugShape, a: number, tilt: number, rest: { x: number; y: number }, over = -3) {
  const tip = spout(j, 0, 0, tilt);
  return lerp(rest.x * Math.sin(a) + rest.y * Math.cos(a), tip.y - over, smoothstep(0.05, 0.42, tilt));
}

function jugBody(j: JugShape) {
  const p = new Path2D();
  const { W, H } = j;
  const sp = mouth(j);
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

function drawGlassJug(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink, alpha: number, spent = 0) {
  const day = t.light;
  const a = -tilt * TIP.jug;
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
  const level = surfaceY(j, a, tilt, { x: -W * 0.5, y: -H * 0.02 + spent * H * 0.2 });
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

/** The pitcher's tall body: near-straight sides, a pinched lip at the top left, a thick round foot. */
function pitcherBody(j: JugShape) {
  const p = new Path2D();
  const { W, H } = j;
  const sp = mouth(j);
  const top = -H * 0.5;
  const bot = H * 0.5;
  p.moveTo(-W * 0.14, top);
  p.lineTo(-W * 0.8, top);
  // The pinched lip: drawn out to a point, then tucked back into the wall.
  p.quadraticCurveTo(-W * 0.95, top - 1, sp.x, sp.y);
  p.quadraticCurveTo(-W * 0.98, top + H * 0.06, -W * 0.88, top + H * 0.13);
  // Down the side, flaring very slightly to a rounded heel.
  p.bezierCurveTo(-W * 0.93, top + H * 0.4, -W * 0.97, bot - H * 0.2, -W * 0.95, bot - H * 0.06);
  p.quadraticCurveTo(-W * 0.94, bot, -W * 0.84, bot);
  p.lineTo(-W * 0.06, bot);
  p.quadraticCurveTo(W * 0.04, bot, W * 0.03, bot - H * 0.06);
  p.bezierCurveTo(W * 0.05, bot - H * 0.2, -W * 0.01, top + H * 0.4, -W * 0.06, top + H * 0.13);
  p.quadraticCurveTo(-W * 0.09, top + H * 0.05, -W * 0.14, top);
  p.closePath();
  return p;
}

/** Lemon wheels floating in the pitcher (centre × W/H in its own frame, size, turn). */
const PITCHER_LEMONS = [
  { x: -0.62, y: -0.02, r: 0.17, tilt: 0.55 },
  { x: -0.34, y: 0.16, r: 0.15, tilt: 0.35 },
  { x: -0.7, y: 0.3, r: 0.14, tilt: 0.7 },
];
/** Beads of condensation on the outside, where the cold lemonade is. */
const BEADS = [
  [-0.86, 0.05, 1.1],
  [-0.78, 0.22, 0.8],
  [-0.9, 0.34, 1],
  [-0.24, 0.1, 0.9],
  [-0.16, 0.3, 1.2],
  [-0.42, 0.38, 0.7],
  [-0.66, 0.42, 0.9],
  [-0.52, 0.02, 0.6],
  [-0.3, -0.06, 0.7],
];

/**
 * A classic lemonade pitcher: tall ribbed glass with a pinched lip and a big
 * looped handle, cloudy-bright lemonade inside with lemon wheels drifting in
 * it, and cold beads of condensation on the outside.
 */
function drawPitcher(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink, alpha: number, spent = 0) {
  const day = t.light;
  const a = -tilt * TIP.pitcher;
  const body = pitcherBody(j);
  const { W, H } = j;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);

  // The handle: a tall, thick loop of glass from the shoulder to low on the side.
  ctx.lineCap = 'round';
  const loop = () => {
    ctx.beginPath();
    ctx.moveTo(-W * 0.07, -H * 0.36);
    ctx.bezierCurveTo(W * 0.48, -H * 0.38, W * 0.44, H * 0.26, -W * 0.02, H * 0.3);
  };
  ctx.strokeStyle = day ? rgba(t.ink, 0.22) : rgba('#ffffff', 0.22);
  ctx.lineWidth = W * 0.13;
  loop();
  ctx.stroke();
  ctx.strokeStyle = day ? rgba('#ffffff', 0.7) : rgba(t.ink, 0.14);
  ctx.lineWidth = W * 0.045;
  loop();
  ctx.stroke();
  ctx.save();
  ctx.translate(-W * 0.015, -W * 0.025);
  ctx.strokeStyle = rgba('#ffffff', day ? 0.85 : 0.45);
  ctx.lineWidth = 1.4;
  loop();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = rgba('#ffffff', day ? 0.18 : 0.06);
  ctx.fill(body);

  // The lemonade stays level as the pitcher tips, rising to the lip.
  ctx.save();
  ctx.clip(body);
  ctx.rotate(-a);
  const level = surfaceY(j, a, tilt, { x: -W * 0.5, y: -H * 0.22 + spent * H * 0.3 });
  const span = W * 3;
  const grad = ctx.createLinearGradient(0, level, 0, level + H);
  grad.addColorStop(0, d.color);
  grad.addColorStop(1, d.deep);
  ctx.fillStyle = grad;
  ctx.fillRect(-span, level, span * 2, span);
  ctx.beginPath();
  ctx.rect(-span, level, span * 2, span);
  ctx.clip();
  ctx.rotate(a);
  // Lemon wheels, seen through the drink at a slant; they bob a little as it moves.
  for (const l of PITCHER_LEMONS) {
    const r = l.r * W;
    ctx.save();
    ctx.translate(l.x * W, l.y * H);
    ctx.rotate(l.tilt - a * 0.3);
    ctx.scale(1, 0.62);
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#EDC23E';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFF3BE';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.84, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#F6D865';
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * TAU + 0.08;
      const a1 = ((i + 1) / 8) * TAU - 0.08;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.74, a0, a1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  // Surface: a lit band, then the bright line.
  ctx.save();
  ctx.clip(body);
  ctx.rotate(-a);
  ctx.fillStyle = rgba(mix(d.color, '#ffffff', 0.5), 0.85);
  ctx.fillRect(-span, level, span * 2, Math.max(2, W * 0.04));
  ctx.strokeStyle = rgba('#ffffff', day ? 0.85 : 0.6);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-span, level);
  ctx.lineTo(span, level);
  ctx.stroke();
  ctx.restore();

  // Ribbed glass: soft vertical panels of light, shade away from the lamp, a thick foot.
  ctx.save();
  ctx.clip(body);
  for (let i = 0; i < 6; i++) {
    const rx = -W * (0.86 - i * 0.14);
    ctx.strokeStyle = rgba('#ffffff', i < 3 ? 0.2 : 0.1);
    ctx.lineWidth = Math.max(1, W * 0.018);
    ctx.beginPath();
    ctx.moveTo(rx, -H * 0.36);
    ctx.lineTo(rx - W * 0.01, H * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = day ? rgba(t.ink, 0.08) : rgba('#ffffff', 0.13);
  ctx.lineWidth = W * 0.09;
  ctx.stroke(body);
  const sh = ctx.createLinearGradient(-W, 0, W * 0.05, 0);
  sh.addColorStop(0, rgba(t.ink, 0));
  sh.addColorStop(0.65, rgba(t.ink, 0));
  sh.addColorStop(1, rgba(t.ink, day ? 0.1 : 0.18));
  ctx.fillStyle = sh;
  ctx.fill(body);
  ctx.fillStyle = rgba('#ffffff', day ? 0.32 : 0.14);
  ctx.fillRect(-W * 1.1, H * 0.42, W * 1.2, H * 0.09);
  ctx.restore();

  // Silhouette, inner edge, the rim seen from just above, the lamp's highlight.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = day ? rgba(t.ink, 0.3) : rgba('#ffffff', 0.45);
  ctx.lineWidth = 1.5;
  ctx.stroke(body);
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = day ? rgba('#ffffff', 0.9) : rgba(t.ink, 0.16);
  ctx.lineWidth = 2.4;
  ctx.stroke(body);
  ctx.restore();
  ctx.strokeStyle = day ? rgba(t.ink, 0.22) : rgba('#ffffff', 0.4);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-W * 0.47, -H * 0.5, W * 0.34, W * 0.05, 0, 0, Math.PI);
  ctx.stroke();
  const hl = ctx.createLinearGradient(0, -H * 0.38, 0, H * 0.38);
  hl.addColorStop(0, rgba('#ffffff', 0));
  hl.addColorStop(0.25, rgba('#ffffff', day ? 0.65 : 0.38));
  hl.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.roundRect(-W * 0.82, -H * 0.36, W * 0.06, H * 0.74, W * 0.03);
  ctx.fill();

  // Condensation: little beads, each with a bright cap and a soft shadow side.
  for (const [bx, by, k] of BEADS) {
    const r = Math.max(1.1, W * 0.022 * k);
    const px = bx * W;
    const py = by * H;
    ctx.fillStyle = rgba('#ffffff', day ? 0.5 : 0.32);
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 1.25, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.9);
    ctx.beginPath();
    ctx.arc(px - r * 0.3, py - r * 0.4, r * 0.35, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** A smooth line through `pts`, each corner rounded off at its neighbours' midpoints. */
function through(p: Path2D, pts: [number, number][]) {
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    p.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const [lx, ly] = pts[pts.length - 1];
  p.lineTo(lx, ly);
}

/** The contour bottle's half-width down its length: lip, neck, shoulder, waist, belly, base. */
const CONTOUR: [number, number][] = [
  [0, 0.068],
  [0.04, 0.064],
  [0.2, 0.068],
  [0.37, 0.148],
  [0.47, 0.16],
  [0.59, 0.126],
  [0.76, 0.166],
  [0.94, 0.16],
  [1, 0.146],
];

function bottleBody(j: JugShape) {
  const { W, H } = j;
  const side = (k: number) => CONTOUR.map(([t, hw]) => [k * hw * W, -H / 2 + t * H] as [number, number]);
  const left = side(-1);
  const right = side(1).reverse();
  const p = new Path2D();
  p.moveTo(left[0][0], left[0][1]);
  through(p, left);
  p.lineTo(right[0][0], right[0][1]);
  through(p, right);
  p.closePath();
  return p;
}

/** A glass bottle of cola, green-tinted glass with fluting, the drink dark inside. */
function drawBottle(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, d: Drink, alpha: number, spent = 0) {
  const day = t.light;
  const a = -tilt * TIP.bottle;
  const { W, H } = j;
  const body = bottleBody(j);
  const glassTint = '#9FCCB4';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);

  ctx.fillStyle = rgba(glassTint, day ? 0.42 : 0.2);
  ctx.fill(body);

  // The drink, level however the bottle leans; it comes up to the neck.
  ctx.save();
  ctx.clip(body);
  ctx.rotate(-a);
  const level = surfaceY(j, a, tilt, { x: 0, y: -H / 2 + H * (0.3 + spent * 0.3) }, H * 0.3);
  const span = H * 2;
  const grad = ctx.createLinearGradient(0, level, 0, level + H * 0.8);
  grad.addColorStop(0, d.color);
  grad.addColorStop(1, d.deep);
  ctx.fillStyle = grad;
  ctx.fillRect(-span, level, span * 2, span);
  // Seen through green glass, with a bright line at its surface and a few rising bubbles.
  ctx.fillStyle = rgba(glassTint, 0.16);
  ctx.fillRect(-span, level, span * 2, span);
  ctx.strokeStyle = rgba(mix(d.color, '#ffffff', 0.55), 0.9);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-span, level);
  ctx.lineTo(span, level);
  ctx.stroke();
  ctx.restore();

  // Fluting on the shoulder and the belly: soft ribs of light down the glass.
  ctx.save();
  ctx.clip(body);
  ctx.lineCap = 'round';
  for (const [t0, t1] of [
    [0.34, 0.52],
    [0.64, 0.95],
  ]) {
    for (const k of [-0.1, -0.05, 0, 0.05, 0.1]) {
      ctx.strokeStyle = rgba('#ffffff', k < 0 ? 0.22 : 0.1);
      ctx.lineWidth = Math.max(1, W * 0.012);
      ctx.beginPath();
      ctx.moveTo(k * W, -H / 2 + t0 * H);
      ctx.lineTo(k * W * 1.08, -H / 2 + t1 * H);
      ctx.stroke();
    }
  }
  // A wrap-around contoured paper label band round the bottle's waist: warm crimson with cream borders and ribbon wave.
  const l0 = -H / 2 + 0.505 * H;
  const lh = 0.135 * H;
  const labelDip = W * 0.022;
  const labelPath = new Path2D();
  labelPath.moveTo(-W * 0.22, l0);
  labelPath.quadraticCurveTo(0, l0 + labelDip, W * 0.22, l0);
  labelPath.lineTo(W * 0.22, l0 + lh);
  labelPath.quadraticCurveTo(0, l0 + lh + labelDip, -W * 0.22, l0 + lh);
  labelPath.closePath();
  const labelGrad = ctx.createLinearGradient(-W * 0.16, 0, W * 0.16, 0);
  labelGrad.addColorStop(0, '#DF5C44');
  labelGrad.addColorStop(0.5, '#C84833');
  labelGrad.addColorStop(1, '#9E3422');
  ctx.fillStyle = labelGrad;
  ctx.fill(labelPath);
  // Cream-gold top and bottom trim bands on the label:
  ctx.strokeStyle = rgba('#FFF3E0', 0.92);
  ctx.lineWidth = Math.max(1.2, lh * 0.1);
  ctx.beginPath();
  ctx.moveTo(-W * 0.2, l0 + lh * 0.14);
  ctx.quadraticCurveTo(0, l0 + lh * 0.14 + labelDip, W * 0.2, l0 + lh * 0.14);
  ctx.moveTo(-W * 0.2, l0 + lh * 0.86);
  ctx.quadraticCurveTo(0, l0 + lh * 0.86 + labelDip, W * 0.2, l0 + lh * 0.86);
  ctx.stroke();
  // Classic dynamic wave ribbon across the middle of the label:
  ctx.strokeStyle = rgba('#FFFDF8', 0.95);
  ctx.lineWidth = Math.max(1.6, lh * 0.18);
  ctx.beginPath();
  ctx.moveTo(-W * 0.2, l0 + lh * 0.62);
  ctx.quadraticCurveTo(-W * 0.04, l0 + lh * 0.24, W * 0.02, l0 + lh * 0.52);
  ctx.quadraticCurveTo(W * 0.09, l0 + lh * 0.8, W * 0.2, l0 + lh * 0.38);
  ctx.stroke();
  // Neck foil/collar band just below the lip:
  const n0 = -H / 2 + 0.095 * H;
  const nh = 0.032 * H;
  ctx.fillStyle = '#D6523B';
  ctx.fillRect(-W * 0.1, n0, W * 0.2, nh);
  ctx.strokeStyle = rgba('#FFF3E0', 0.85);
  ctx.lineWidth = 1;
  ctx.strokeRect(-W * 0.1, n0, W * 0.2, nh);
  // Round: the side away from the lamp in shade, and a thick heel of glass.
  const sh = ctx.createLinearGradient(-W * 0.17, 0, W * 0.17, 0);
  sh.addColorStop(0, rgba(t.ink, 0));
  sh.addColorStop(0.6, rgba(t.ink, 0));
  sh.addColorStop(1, rgba(t.ink, day ? 0.14 : 0.24));
  ctx.fillStyle = sh;
  ctx.fill(body);
  ctx.fillStyle = rgba(mix(glassTint, '#ffffff', 0.4), day ? 0.55 : 0.25);
  ctx.fillRect(-W * 0.2, H / 2 - H * 0.04, W * 0.4, H * 0.05);
  ctx.restore();

  // Silhouette, a bright inner edge, the lamp's long highlight, and the lip + crimped crown cap.
  ctx.lineJoin = 'round';
  ctx.strokeStyle = day ? rgba(mix(t.ink, glassTint, 0.3), 0.42) : rgba(mix(glassTint, '#ffffff', 0.5), 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke(body);
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = rgba('#ffffff', day ? 0.75 : 0.22);
  ctx.lineWidth = 2.4;
  ctx.stroke(body);
  ctx.restore();
  const hl = (t0: number, t1: number, xk: number) => {
    const g = ctx.createLinearGradient(0, -H / 2 + t0 * H, 0, -H / 2 + t1 * H);
    g.addColorStop(0, rgba('#ffffff', 0));
    g.addColorStop(0.35, rgba('#ffffff', day ? 0.75 : 0.4));
    g.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(xk * W, -H / 2 + t0 * H, W * 0.035, (t1 - t0) * H, W * 0.02);
    ctx.fill();
  };
  hl(0.06, 0.24, -0.045);
  hl(0.36, 0.54, -0.115);
  hl(0.66, 0.92, -0.125);
  const lipW = W * 0.16;
  const lipH = H * 0.045;
  ctx.fillStyle = rgba(mix(glassTint, '#ffffff', 0.5), day ? 0.85 : 0.4);
  ctx.strokeStyle = day ? rgba(t.ink, 0.3) : rgba('#ffffff', 0.45);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-lipW / 2, -H / 2 - lipH * 0.4, lipW, lipH, lipH * 0.45);
  ctx.fill();
  ctx.stroke();
  // Crimped metallic crown cap: sits snug on the bottle top at rest, and hinges open on the right as it tips to pour.
  const openAngle = smoothstep(0.08, 0.36, tilt) * 1.45;
  ctx.save();
  ctx.translate(lipW * 0.48, -H / 2 - lipH * 0.2);
  ctx.rotate(openAngle);
  const capW = lipW * 1.12;
  const capH = lipH * 0.95;
  ctx.fillStyle = '#D94B38';
  ctx.strokeStyle = day ? rgba(t.ink, 0.38) : rgba('#ffffff', 0.5);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(-capW, -capH * 0.85, capW, capH, [capH * 0.42, capH * 0.42, 2, 2]);
  ctx.fill();
  ctx.stroke();
  // Silver crimped skirt teeth along the lower edge of the crown cap:
  ctx.fillStyle = '#EAE6DF';
  for (let i = 0; i < 5; i++) {
    const tx = -capW * (0.9 - i * 0.2);
    ctx.beginPath();
    ctx.arc(tx, -capH * 0.05, capW * 0.08, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = rgba('#ffffff', 0.65);
  ctx.beginPath();
  ctx.roundRect(-capW * 0.82, -capH * 0.7, capW * 0.35, capH * 0.28, 1.5);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

const CARTON_BLUE = '#4F86C9';
const CARTON_BLUE_DEEP = '#3B6DAE';
const COW_PINK = '#F2B3AE';

/**
 * A milk carton, gable top opened at one corner into a spout. White card with
 * a blue band, a blue roof and a cow on the front, seen a little from the right.
 */
function drawCarton(ctx: CanvasRenderingContext2D, t: Theme, j: JugShape, x: number, y: number, tilt: number, alpha: number) {
  const day = t.light;
  const a = -tilt * TIP.carton;
  const u = j.W;
  const cw = u * CARTON.w;
  const sw = u * CARTON.side;
  const bh = j.H;
  const rh = u * CARTON.roof;
  const fin = u * CARTON.fin;
  const dy = sw * 0.38;
  const L = -cw / 2;
  const R = cw / 2;
  const T = -bh / 2;
  const B = bh / 2;
  const ridgeY = T - rh;
  const ridgeX = sw / 2;
  // Card, lit from the upper left; a touch dimmer at dusk so it sits in the room.
  const card = day ? '#FFFDF9' : '#EFE9E1';
  const cardShade = day ? '#E5E2DE' : '#C9C1B7';
  const line = day ? rgba(t.ink, 0.32) : rgba(t.ink, 0.5);
  const blue = day ? CARTON_BLUE : mix(CARTON_BLUE, t.ink, 0.15);
  const blueDeep = day ? CARTON_BLUE_DEEP : mix(CARTON_BLUE_DEEP, t.ink, 0.2);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = line;

  const poly = (pts: [number, number][]) => {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) p.lineTo(px, py);
    p.closePath();
    return p;
  };

  // The side, in shade, with the band running round it.
  const side = poly([
    [R, T],
    [R + sw, T - dy],
    [R + sw, B - dy],
    [R, B],
  ]);
  ctx.fillStyle = cardShade;
  ctx.fill(side);
  ctx.save();
  ctx.clip(side);
  ctx.fillStyle = blueDeep;
  ctx.beginPath();
  ctx.moveTo(R, B - bh * 0.36);
  ctx.lineTo(R + sw, B - bh * 0.36 - dy);
  ctx.lineTo(R + sw, B);
  ctx.lineTo(R, B + dy);
  ctx.fill();
  ctx.restore();
  ctx.stroke(side);

  // The gable on the side, and the front slope of the roof up to the ridge.
  const gable = poly([
    [R, T],
    [R + ridgeX, ridgeY - dy / 2],
    [R + sw, T - dy],
  ]);
  ctx.fillStyle = cardShade;
  ctx.fill(gable);
  ctx.stroke(gable);
  const roof = poly([
    [L, T],
    [R, T],
    [R + ridgeX, ridgeY - dy / 2],
    [L + ridgeX, ridgeY - dy / 2],
  ]);
  ctx.fillStyle = blue;
  ctx.fill(roof);
  ctx.save();
  ctx.clip(roof);
  ctx.fillStyle = rgba('#ffffff', 0.18);
  ctx.fillRect(L, ridgeY - dy, cw + sw, rh * 0.35);
  ctx.restore();
  ctx.stroke(roof);
  // The sealed fin along the top.
  const top = poly([
    [L + ridgeX, ridgeY - dy / 2],
    [R + ridgeX, ridgeY - dy / 2],
    [R + ridgeX, ridgeY - dy / 2 - fin],
    [L + ridgeX, ridgeY - dy / 2 - fin],
  ]);
  ctx.fillStyle = card;
  ctx.fill(top);
  ctx.stroke(top);

  // Opened at the left corner and pulled out into a spout.
  const m = mouth(j);
  const spoutPath = poly([
    [L, T],
    [m.x, m.y],
    [L + ridgeX * 0.9, ridgeY - dy / 2 + 1],
  ]);
  ctx.fillStyle = cardShade;
  ctx.fill(spoutPath);
  ctx.stroke(spoutPath);
  ctx.fillStyle = rgba('#F7F1E6', 1);
  ctx.beginPath();
  ctx.moveTo(m.x + u * 0.025, m.y + u * 0.005);
  ctx.lineTo(L + u * 0.02, T - rh * 0.25);
  ctx.lineTo(L + ridgeX * 0.55, ridgeY - dy / 2 + rh * 0.35);
  ctx.closePath();
  ctx.fill();

  // The front: white card, lit from the left, and the blue band with a soft wave on top.
  const front = new Path2D();
  front.rect(L, T, cw, bh);
  const lit = ctx.createLinearGradient(L, 0, R, 0);
  lit.addColorStop(0, card);
  lit.addColorStop(1, mix(card, cardShade, 0.45));
  ctx.fillStyle = lit;
  ctx.fill(front);
  ctx.save();
  ctx.clip(front);
  const bandY = B - bh * 0.36;
  ctx.fillStyle = blue;
  ctx.beginPath();
  ctx.moveTo(L, bandY);
  const waves = 3;
  for (let i = 0; i < waves; i++) {
    const x0 = L + (cw / waves) * i;
    ctx.quadraticCurveTo(x0 + cw / waves / 4, bandY - bh * 0.045, x0 + cw / waves / 2, bandY);
    ctx.quadraticCurveTo(x0 + (cw / waves) * 0.75, bandY + bh * 0.045, x0 + cw / waves, bandY);
  }
  ctx.lineTo(R, B);
  ctx.lineTo(L, B);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(cw * 0.2)}px ${type.display}`;
  ctx.fillText('milk', 0, B - bh * 0.15);
  ctx.restore();
  ctx.stroke(front);

  drawCow(ctx, 0, T + bh * 0.32, cw * 0.2, line);
  ctx.restore();
}

/** A small, friendly cow's face for the carton. */
function drawCow(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, line: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.strokeStyle = line;
  // Horns, then ears behind the head.
  ctx.fillStyle = '#F2E2C4';
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(k * s * 0.5, -s * 0.92, s * 0.13, s * 0.24, k * 0.35, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  for (const k of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(k * s * 1.02, -s * 0.38, s * 0.4, s * 0.19, k * 0.4, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COW_PINK;
    ctx.beginPath();
    ctx.ellipse(k * s * 1.08, -s * 0.37, s * 0.22, s * 0.09, k * 0.4, 0, TAU);
    ctx.fill();
  }
  // Head, with a black patch over one eye.
  const head = new Path2D();
  head.ellipse(0, 0, s * 0.8, s * 0.9, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill(head);
  ctx.save();
  ctx.clip(head);
  ctx.fillStyle = '#3A302B';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, -s * 0.45, s * 0.42, s * 0.36, 0.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-s * 0.62, -s * 0.05, s * 0.2, s * 0.26, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.stroke(head);
  // Eyes, with a glint, and a pink muzzle with nostrils.
  for (const k of [-1, 1]) {
    ctx.fillStyle = '#2C2420';
    ctx.beginPath();
    ctx.arc(k * s * 0.3, -s * 0.08, s * 0.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(k * s * 0.3 - s * 0.03, -s * 0.12, s * 0.035, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = COW_PINK;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 0.6, s * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = mix(COW_PINK, '#8A4A45', 0.5);
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(k * s * 0.22, s * 0.5, s * 0.07, s * 0.1, 0, 0, TAU);
    ctx.fill();
  }
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
  /** The first drop after a gap (a glug): not joined to the one before. */
  brk?: boolean;
}

/** The stream: drops joined into one smooth, tapering pour ribbon with a single continuous highlight. */
export function drawStream(ctx: CanvasRenderingContext2D, drops: Drop[], d: Drink) {
  if (drops.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Drink-specific stream thickness: thicker and wobblier for bubble tea, thin and silky for milk.
  const drinkScale = d.id === 'boba' ? 1.32 : d.id === 'milk' ? 0.74 : d.id === 'cocoa' ? 1.12 : d.id === 'cola' ? 0.94 : 1.04;
  // Break active drops into continuous runs (normally 1 run, or 2 during lemonade glugs).
  const runs: Drop[][] = [];
  let cur: Drop[] = [];
  for (let i = 0; i < drops.length; i++) {
    const b = drops[i];
    if (!b.alive) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
      continue;
    }
    if (cur.length > 0) {
      const a = cur[cur.length - 1];
      if (b.brk || Math.hypot(a.x - b.x, a.y - b.y) > 42) {
        if (cur.length > 1) runs.push(cur);
        cur = [b];
        continue;
      }
      // Skip near-duplicate points from substeps so normals stay rock-solid.
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1.5 && i < drops.length - 1) continue;
    }
    cur.push(b);
  }
  if (cur.length > 1) runs.push(cur);

  for (const run of runs) {
    const n = run.length;
    const pts = run.map((b, idx) => {
      const speed = Math.hypot(b.vx, b.vy);
      // Smoothly tapers as gravity accelerates the stream downward; boba has a subtle organic wobble.
      const taper = clamp(Math.pow(135 / Math.max(40, speed), 0.56), 0.36, 1.05);
      const wobble = d.id === 'boba' ? 1 + 0.1 * Math.sin(b.y * 0.085 + idx * 0.35) : 1;
      const r = Math.max(1.1, b.w * 0.5 * drinkScale * taper * wobble);
      const wobbleX = d.id === 'boba' ? Math.sin(b.y * 0.065) * 1.1 * (1 - taper * 0.5) : 0;
      return { x: b.x + wobbleX, y: b.y, r };
    });

    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    const hi: { x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[Math.min(n - 1, i + 1)];
      let tx = p1.x - p0.x;
      let ty = p1.y - p0.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // Normal pointing to the right of the falling stream.
      const nx = -ty;
      const ny = tx;
      const p = pts[i];
      left.push({ x: p.x - nx * p.r, y: p.y - ny * p.r });
      right.push({ x: p.x + nx * p.r, y: p.y + ny * p.r });
      hi.push({ x: p.x - nx * p.r * 0.42, y: p.y - ny * p.r * 0.42 });
    }

    // Build one smooth closed ribbon polygon for the stream.
    const ribbon = new Path2D();
    ribbon.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) {
      const prev = left[i - 1];
      const curr = left[i];
      ribbon.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) * 0.5, (prev.y + curr.y) * 0.5);
    }
    ribbon.lineTo(left[n - 1].x, left[n - 1].y);
    const tail = pts[n - 1];
    ribbon.arc(tail.x, tail.y, tail.r, Math.atan2(left[n - 1].y - tail.y, left[n - 1].x - tail.x), Math.atan2(right[n - 1].y - tail.y, right[n - 1].x - tail.x), true);
    for (let i = n - 2; i >= 0; i--) {
      const prev = right[i + 1];
      const curr = right[i];
      ribbon.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) * 0.5, (prev.y + curr.y) * 0.5);
    }
    ribbon.lineTo(right[0].x, right[0].y);
    const head = pts[0];
    ribbon.arc(head.x, head.y, head.r, Math.atan2(right[0].y - head.y, right[0].x - head.x), Math.atan2(left[0].y - head.y, left[0].x - head.x), true);
    ribbon.closePath();

    // Rich cross-stream shading: luminous on the lamp side, deeper on the shadow edge.
    const mid = pts[Math.floor(n / 2)];
    const sg = ctx.createLinearGradient(mid.x - mid.r * 1.4, mid.y, mid.x + mid.r * 1.4, mid.y);
    sg.addColorStop(0, mix(d.color, '#ffffff', 0.16));
    sg.addColorStop(0.55, d.color);
    sg.addColorStop(1, d.deep);
    ctx.fillStyle = sg;
    ctx.fill(ribbon);

    // One smooth, continuous specular highlight line along the lit edge of the tapering stream.
    ctx.strokeStyle = rgba('#ffffff', 0.68);
    ctx.lineWidth = Math.max(1.2, head.r * 0.28);
    ctx.beginPath();
    ctx.moveTo(hi[0].x, hi[0].y);
    for (let i = 1; i < n; i++) {
      const prev = hi[i - 1];
      const curr = hi[i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + curr.x) * 0.5, (prev.y + curr.y) * 0.5);
    }
    ctx.lineTo(hi[n - 1].x, hi[n - 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Steam off hot cocoa: soft wisps curling up out of the drink, and a mist
 * on the glass above it that hides the line.
 */
export function drawSteam(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, fog: number, time: number) {
  const top = yAt(g, 1);
  const surf = yAt(g, glass.top);
  ctx.save();
  // The mist on the glass, thickest just over the drink.
  const mist = ctx.createLinearGradient(0, surf, 0, top);
  mist.addColorStop(0, rgba('#fff4e8', 0.5 * fog));
  mist.addColorStop(1, rgba('#fff4e8', 0.3 * fog));
  ctx.fillStyle = mist;
  // Only on the glass itself: it follows the glass's own sides up to its rim.
  const lo = halfAt(g, clamp(glass.top, 0, 1));
  const hi = halfAt(g, 1);
  ctx.beginPath();
  ctx.moveTo(g.cx - lo, surf);
  ctx.lineTo(g.cx - hi, top);
  ctx.lineTo(g.cx + hi, top);
  ctx.lineTo(g.cx + lo, surf);
  ctx.closePath();
  ctx.fill();
  // Wisps: a few soft puffs rising slowly and swaying, fading as they go.
  for (let i = 0; i < 7; i++) {
    const p = (time * 0.22 + i / 7) % 1;
    const x = g.cx + Math.sin(i * 2.4 + time * 0.7 + p * 3) * g.wt * 0.55;
    const y = lerp(surf, top - g.H * 0.22, p);
    const r = g.wt * (0.28 + p * 0.3);
    const a = Math.sin(Math.PI * p) * 0.3 * fog;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, rgba('#fff6ec', a));
    puff.addColorStop(1, rgba('#fff6ec', 0));
    ctx.fillStyle = puff;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Where the stream meets the drink: expanding concentric surface ripple rings and a lively splash crown. */
export function drawImpact(ctx: CanvasRenderingContext2D, g: GlassShape, glass: Glass, x: number, k: number, time: number, d: Drink) {
  if (k <= 0.02) return;
  const f = glass.top;
  const y = yAt(g, f);
  const half = halfAt(g, f);
  const maxRx = Math.min(half * 0.82, 12 + k * 24);
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.cx - half + 2, y - 24, half * 2 - 4, 48);
  ctx.clip();
  // Four expanding concentric ripple rings with a dark trough and bright crest.
  for (let i = 0; i < 4; i++) {
    const p = (time * 2.4 + i * 0.25) % 1;
    const rx = maxRx * (0.18 + p * 0.92);
    const ry = Math.max(1.2, rx * VIEW * 2.35);
    const fade = (1 - p) * (1 - p * 0.35) * k;
    ctx.strokeStyle = rgba(d.deep, fade * 0.38);
    ctx.lineWidth = 1.8 * (1 - p * 0.4);
    ctx.beginPath();
    ctx.ellipse(x, y + 0.8, rx * 0.95, ry * 0.95, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba(mix(d.color, '#ffffff', 0.78), fade * 0.88);
    ctx.lineWidth = 1.35 * (1 - p * 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.stroke();
  }
  // Bright central dimple / crown bead right where the stream plunges in.
  const crownR = (3.2 + k * 3.5) * (0.88 + 0.12 * Math.sin(time * 28));
  ctx.fillStyle = rgba('#ffffff', 0.75 * k);
  ctx.beginPath();
  ctx.ellipse(x, y, crownR, Math.max(1.2, crownR * VIEW * 2.6), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
