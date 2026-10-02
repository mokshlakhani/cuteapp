import type { Poly } from '../../core/geometry';
import { fruitPalette as F } from '../../design/fruitPalette';
import { wedgeFootprint } from './Piece';

/**
 * Jelly fruits. Each is a slice: a convex footprint extruded to a height, with
 * a solid cross-section texture (see material.ts — `code` picks the shader
 * branch). Watermelons come in three flesh colours.
 */
export interface JellyFruit {
  id: string;
  name: string;
  /** Shader branch: 0 melon, 1 orange, 2 lemon, 3 kiwi, 4 strawberry, 5 apple, 6 peach, 7 dragon fruit. */
  code: number;
  /** Characteristic radius used by the cross-section texture (cm). */
  radius: number;
  height: number;
  footprint(): Poly;
  /** Melon flesh colours (only for code 0). */
  melon?: { flesh: string; fleshLight: string };
  /** Main colours for the picker icon: outer → inner. */
  icon: string[];
  blush: string;
}

function ellipse(rx: number, rz: number, n = 28): Poly {
  const pts: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * rx, y: Math.sin(a) * rz });
  }
  return pts;
}

function strawberry(k = 1): Poly {
  // A rounded teardrop, tip toward the viewer (+z). Kept convex.
  const pts: Poly = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a);
    const narrow = s > 0 ? 1 - 0.42 * s * s : 1;
    pts.push({ x: Math.cos(a) * 3.3 * narrow * k, y: s * (s > 0 ? 3.9 : 2.9) * k });
  }
  return hull(pts);
}

/** Convex hull (monotone chain) — every footprint must be convex. */
function hull(pts: Poly): Poly {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Poly = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Poly = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const W = F.watermelon;

/** Added watermelon slices are a bit smaller than the starting specimen. */
const MELON_R = 5.4;
const MELON_H = 2.2;

export const JELLY_FRUITS: JellyFruit[] = [
  {
    id: 'watermelon',
    name: 'watermelon',
    code: 0,
    radius: MELON_R,
    height: MELON_H,
    footprint: () => wedgeFootprint(MELON_R),
    melon: { flesh: W.flesh, fleshLight: W.fleshLight },
    icon: [W.skin, W.rind, W.flesh],
    blush: '#FF9AAE',
  },
  {
    id: 'golden',
    name: 'golden melon',
    code: 0,
    radius: MELON_R,
    height: MELON_H,
    footprint: () => wedgeFootprint(MELON_R),
    melon: F.goldenMelon,
    icon: [W.skin, W.rind, F.goldenMelon.flesh],
    blush: '#FF8C7A',
  },
  {
    id: 'rose',
    name: 'rosé melon',
    code: 0,
    radius: MELON_R,
    height: MELON_H,
    footprint: () => wedgeFootprint(MELON_R),
    melon: F.roseMelon,
    icon: [W.skin, W.rind, F.roseMelon.flesh],
    blush: '#FFB0C8',
  },
  {
    id: 'orange',
    name: 'orange',
    code: 1,
    radius: 3,
    height: 1.5,
    footprint: () => ellipse(3, 3),
    icon: [F.orange.peel, F.orange.pith, F.orange.flesh],
    blush: '#FF8C6B',
  },
  {
    id: 'lemon',
    name: 'lemon',
    code: 2,
    radius: 2.6,
    height: 1.3,
    footprint: () => ellipse(2.6, 2.6),
    icon: [F.lemon.peel, F.lemon.pith, F.lemon.flesh],
    blush: '#FFA98A',
  },
  {
    id: 'kiwi',
    name: 'kiwi',
    code: 3,
    radius: 2.6,
    height: 1.4,
    footprint: () => ellipse(2.6, 2.2),
    icon: [F.kiwi.skin, F.kiwi.flesh, F.kiwi.core],
    blush: '#F59C9A',
  },
  {
    id: 'strawberry',
    name: 'strawberry',
    code: 4,
    radius: 2.7,
    height: 1.4,
    footprint: () => strawberry(0.76),
    icon: [F.strawberry.skin, F.strawberry.flesh, F.strawberry.core],
    blush: '#FFB3BE',
  },
  {
    id: 'apple',
    name: 'apple',
    code: 5,
    radius: 3,
    height: 1.5,
    footprint: () => ellipse(3.15, 2.95),
    icon: [F.apple.skin, F.apple.flesh, F.apple.core],
    blush: '#FF9AA2',
  },
  {
    id: 'peach',
    name: 'peach',
    code: 6,
    radius: 2.9,
    height: 1.5,
    footprint: () => ellipse(2.9, 2.8),
    icon: [F.peach.skin, F.peach.flesh, F.peach.pit],
    blush: '#FF8F80',
  },
  {
    id: 'dragonfruit',
    name: 'dragon fruit',
    code: 7,
    radius: 3,
    height: 1.5,
    footprint: () => ellipse(3, 2.6),
    icon: [F.dragonfruit.skin, F.dragonfruit.rim, F.dragonfruit.flesh],
    blush: '#FF9ACB',
  },
];

export const jellyFruit = (id: string) => JELLY_FRUITS.find((f) => f.id === id) ?? JELLY_FRUITS[0];

/** A small app-style icon of the fruit's cross-section, for the picker. */
export function drawFruitIcon(ctx: CanvasRenderingContext2D, f: JellyFruit, size: number) {
  const pts = f.footprint();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y);
    maxZ = Math.max(maxZ, p.y);
  }
  const s = (size * 0.78) / Math.max(maxX - minX, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.translate(-cx, -cz);
  const path = (k: number) => {
    // Shrink toward the centroid for the inner bands.
    let ax = 0;
    let az = 0;
    for (const p of pts) {
      ax += p.x / pts.length;
      az += p.y / pts.length;
    }
    if (f.code === 0) {
      ax = 0;
      az = 0;
    }
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = ax + (p.x - ax) * k;
      const z = az + (p.y - az) * k;
      if (i) ctx.lineTo(x, z);
      else ctx.moveTo(x, z);
    });
    ctx.closePath();
  };
  const bands = f.code === 0 ? [1, 0.93, 0.85] : [1, 0.9, 0.82];
  ctx.lineJoin = 'round';
  f.icon.forEach((c, i) => {
    path(bands[i]);
    ctx.fillStyle = c;
    ctx.fill();
  });
  path(1);
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = 'rgba(80,40,30,0.18)';
  ctx.stroke();
  ctx.restore();
}
