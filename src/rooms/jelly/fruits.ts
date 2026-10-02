import { rgba } from '../../core/color';
import { TAU } from '../../core/math';
import { drawSeed } from '../../render/particles';

/**
 * Jelly fruit definitions. Each fruit is: a rest silhouette, a translucent
 * palette, a skin ring, an interior painter (seeds, segments, pits) and an
 * optional attachment (stem / leaf / calyx). Interiors are painted in the
 * fruit's own "texture space" (origin at centre, radius R) so they deform —
 * and get cut — together with the jelly.
 */

export interface Fruit {
  id: string;
  name: string;
  /** Size relative to the room's base jelly radius. */
  size: number;
  body: string;
  light: string;
  dark: string;
  skin: { outer: string; inner?: string; width: number };
  blush: string;
  /** Rest outline: unit point for angle θ (0 = right, π/2 = down). */
  shape(theta: number): { x: number; y: number };
  paint(ctx: CanvasRenderingContext2D, R: number): void;
  attach?(ctx: CanvasRenderingContext2D, R: number, t: number): void;
  /** Vertical face offset in units of R (negative = higher). */
  faceY: number;
}

const circle =
  (sx = 1, sy = 1) =>
  (th: number) => ({ x: Math.cos(th) * sx, y: Math.sin(th) * sy });

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, color = '#8CC57A') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, len * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(len * 0.12, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.06, len * 0.82, 0);
  ctx.stroke();
  ctx.restore();
}

function stem(ctx: CanvasRenderingContext2D, R: number, h: number, color = '#8C7051') {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = R * 0.075;
  ctx.beginPath();
  ctx.moveTo(0, R * 0.05);
  ctx.quadraticCurveTo(-R * 0.02, -h * 0.5, R * 0.06, -h);
  ctx.stroke();
}

function segments(ctx: CanvasRenderingContext2D, R: number, n: number, color: string, sx = 1, sy = 1) {
  ctx.strokeStyle = rgba(color, 0.75);
  ctx.lineWidth = R * 0.045;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2;
    ctx.moveTo(Math.cos(a) * R * 0.14 * sx, Math.sin(a) * R * 0.14 * sy);
    ctx.lineTo(Math.cos(a) * R * 0.76 * sx, Math.sin(a) * R * 0.76 * sy);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(color, 0.8);
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.12 * sx, R * 0.12 * sy, 0, 0, TAU);
  ctx.fill();
  // juicy vesicles
  ctx.fillStyle = rgba('#ffffff', 0.18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.2 + Math.PI / n;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * R * 0.5 * sx, Math.sin(a) * R * 0.5 * sy, R * 0.12, R * 0.05, a, 0, TAU);
    ctx.fill();
  }
}

export const FRUITS: Fruit[] = [
  {
    id: 'watermelon',
    name: 'watermelon',
    size: 1.12,
    body: '#F68C95',
    light: '#FFC6C8',
    dark: '#D85B6B',
    skin: { outer: '#76B266', inner: '#EAF5D8', width: 0.13 },
    blush: '#FF9AA6',
    shape: circle(),
    faceY: -0.05,
    paint(ctx, R) {
      // One tidy ring of seeds, leaving room for the face.
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + Math.PI / n;
        if (Math.sin(a) < -0.5) continue;
        ctx.save();
        ctx.translate(Math.cos(a) * R * 0.56, Math.sin(a) * R * 0.5);
        ctx.rotate(a + Math.PI / 2);
        ctx.globalAlpha *= 0.72;
        drawSeed(ctx, 0, 0, R * 0.055, '#4A3530');
        ctx.restore();
      }
    },
  },
  {
    id: 'orange',
    name: 'orange',
    size: 1,
    body: '#F9B262',
    light: '#FFDCAA',
    dark: '#E58A37',
    skin: { outer: '#F09A43', inner: '#FFF0D8', width: 0.07 },
    blush: '#FF9D8C',
    shape: circle(),
    faceY: 0,
    paint(ctx, R) {
      segments(ctx, R, 9, '#FFE7C4');
    },
    attach(ctx, R) {
      ctx.fillStyle = '#9C7B55';
      ctx.beginPath();
      ctx.ellipse(0, R * 0.02, R * 0.06, R * 0.04, 0, 0, TAU);
      ctx.fill();
      leaf(ctx, R * 0.02, -R * 0.02, R * 0.36, -0.5);
    },
  },
  {
    id: 'apple',
    name: 'apple',
    size: 1,
    body: '#EF7F86',
    light: '#FFBDBE',
    dark: '#C95462',
    skin: { outer: '#D95A66', width: 0.045 },
    blush: '#FF97A3',
    shape: (th) => {
      const top = Math.exp(-Math.pow(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2)), 2) / (2 * 0.2 * 0.2));
      const bottom = Math.exp(-Math.pow(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2)), 2) / (2 * 0.25 * 0.25));
      const r = 1 - 0.12 * top - 0.04 * bottom;
      return { x: Math.cos(th) * r * 1.06, y: Math.sin(th) * r };
    },
    faceY: 0.02,
    paint(ctx, R) {
      ctx.fillStyle = rgba('#FFE6D6', 0.42);
      ctx.beginPath();
      ctx.ellipse(0, R * 0.12, R * 0.3, R * 0.42, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU - Math.PI / 2;
        ctx.save();
        ctx.translate(Math.cos(a) * R * 0.13, R * 0.18 + Math.sin(a) * R * 0.16);
        ctx.rotate(a + Math.PI / 2);
        drawSeed(ctx, 0, 0, R * 0.04, '#6B4A3A');
        ctx.restore();
      }
    },
    attach(ctx, R) {
      stem(ctx, R, R * 0.26);
      leaf(ctx, R * 0.04, -R * 0.14, R * 0.34, -0.35);
    },
  },
  {
    id: 'strawberry',
    name: 'strawberry',
    size: 0.92,
    body: '#F3808E',
    light: '#FFC0C8',
    dark: '#D3586E',
    skin: { outer: '#E06778', width: 0.04 },
    blush: '#FF9EAD',
    shape: (th) => {
      const x = Math.cos(th);
      const y = Math.sin(th);
      if (y > 0) return { x: x * (1 - 0.38 * y * y), y: y * 1.14 };
      return { x: x * 1.04, y: y * 0.9 };
    },
    faceY: -0.12,
    paint(ctx, R) {
      ctx.fillStyle = rgba('#FFE3E6', 0.35);
      ctx.beginPath();
      ctx.ellipse(0, R * 0.1, R * 0.22, R * 0.55, 0, 0, TAU);
      ctx.fill();
      const pts = [
        [-0.55, -0.3],
        [0.55, -0.3],
        [-0.72, 0.05],
        [0.72, 0.05],
        [-0.42, 0.35],
        [0.42, 0.35],
        [0, 0.55],
        [-0.22, 0.75],
        [0.22, 0.75],
        [-0.6, 0.3],
        [0.6, 0.3],
        [0, 0.95],
        [-0.32, 0.12],
        [0.32, 0.12],
      ];
      for (const [x, y] of pts) {
        ctx.save();
        ctx.translate(x * R, y * R);
        ctx.rotate(x * 0.6);
        drawSeed(ctx, 0, 0, R * 0.04, '#F7DC86');
        ctx.restore();
      }
    },
    attach(ctx, R) {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.62;
        leaf(ctx, 0, R * 0.06, R * 0.3, a + Math.PI, '#7FBF6E');
      }
      stem(ctx, R, R * 0.18, '#6FA65E');
    },
  },
  {
    id: 'lemon',
    name: 'lemon',
    size: 0.96,
    body: '#F7DE72',
    light: '#FFF4BC',
    dark: '#DDBA3E',
    skin: { outer: '#EDCB4C', inner: '#FFFAE0', width: 0.07 },
    blush: '#FFB38F',
    shape: (th) => {
      const c = Math.cos(th);
      const tip = 1 + 0.14 * Math.pow(Math.abs(c), 14);
      return { x: c * 1.18 * tip, y: Math.sin(th) * 0.86 };
    },
    faceY: 0,
    paint(ctx, R) {
      segments(ctx, R, 8, '#FFF8D6', 1.15, 0.84);
    },
  },
  {
    id: 'kiwi',
    name: 'kiwi',
    size: 0.92,
    body: '#ABD271',
    light: '#DBEFB2',
    dark: '#7FAF4D',
    skin: { outer: '#9A8356', inner: '#C8E290', width: 0.06 },
    blush: '#F5A4A0',
    shape: circle(1.1, 0.93),
    faceY: 0.05,
    paint(ctx, R) {
      ctx.strokeStyle = rgba('#EAF5CF', 0.5);
      ctx.lineWidth = R * 0.03;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.25);
        ctx.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.68);
      }
      ctx.stroke();
      ctx.fillStyle = rgba('#F6F8DC', 0.85);
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.26, R * 0.2, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        if (Math.sin(a) < -0.55) continue; // keep the eyes readable
        ctx.save();
        ctx.translate(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.35);
        ctx.rotate(a + Math.PI / 2);
        drawSeed(ctx, 0, 0, R * 0.03, '#3D2F2A');
        ctx.restore();
      }
    },
  },
  {
    id: 'peach',
    name: 'peach',
    size: 1,
    body: '#FBBE9E',
    light: '#FFE2CF',
    dark: '#EE9479',
    skin: { outer: '#F3A487', width: 0.04 },
    blush: '#FF9C98',
    shape: (th) => {
      const top = Math.exp(-Math.pow(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2)), 2) / (2 * 0.13 * 0.13));
      const r = 1 - 0.07 * top;
      return { x: Math.cos(th) * r * 1.03, y: Math.sin(th) * r };
    },
    faceY: 0.06,
    paint(ctx, R) {
      // A rosy cheek on one side…
      const g = ctx.createRadialGradient(R * 0.4, -R * 0.1, 0, R * 0.4, -R * 0.1, R * 0.8);
      g.addColorStop(0, rgba('#F59AA0', 0.5));
      g.addColorStop(1, rgba('#F59AA0', 0));
      ctx.fillStyle = g;
      ctx.fillRect(-R, -R, R * 2, R * 2);
      // …and a soft pit glowing through the jelly.
      ctx.fillStyle = rgba('#C27B5C', 0.22);
      ctx.beginPath();
      ctx.ellipse(0, R * 0.12, R * 0.28, R * 0.36, 0, 0, TAU);
      ctx.fill();
      // The crease.
      ctx.strokeStyle = rgba('#E88A73', 0.45);
      ctx.lineWidth = R * 0.035;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-R * 0.02, -R * 0.9);
      ctx.quadraticCurveTo(-R * 0.36, -R * 0.55, -R * 0.42, -R * 0.15);
      ctx.stroke();
    },
    attach(ctx, R) {
      stem(ctx, R, R * 0.12);
      leaf(ctx, R * 0.04, -R * 0.08, R * 0.38, -0.25);
    },
  },
  {
    id: 'grape',
    name: 'grape',
    size: 0.64,
    body: '#B99EDE',
    light: '#DED0F3',
    dark: '#9071C2',
    skin: { outer: '#9478C2', width: 0.06 },
    blush: '#F5A3C2',
    shape: circle(0.9, 1),
    faceY: 0.02,
    paint(ctx, R) {
      ctx.fillStyle = rgba('#EADFF8', 0.4);
      ctx.beginPath();
      ctx.ellipse(0, R * 0.05, R * 0.4, R * 0.55, 0, 0, TAU);
      ctx.fill();
    },
    attach(ctx, R) {
      stem(ctx, R, R * 0.3, '#8FA265');
    },
  },
];

export const fruitById = (id: string) => FRUITS.find((f) => f.id === id) ?? FRUITS[0];
