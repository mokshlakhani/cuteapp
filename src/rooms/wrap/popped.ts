import { TAU } from '../../core/math';
import { rgba } from '../../core/color';

/**
 * What a bubble looks like once it's popped. Real bubble wrap never pops
 * the same way twice, so there are many looks, each a mix of an outline,
 * a crease pattern and one small detail. A bubble picks one at random when
 * it pops (never the same as a popped neighbour).
 *
 * Kept free of the DOM: it only paints into a context it's handed.
 */

type Outline = 'round' | 'oval' | 'lumpy' | 'notched' | 'hex';
type Creases = 'star' | 'folds' | 'twist' | 'slit' | 'x' | 'hatch' | 'pleats' | 'ring' | 'none';
type Extra = 'none' | 'hole' | 'flap' | 'lip' | 'pocket' | 'split';

export interface PoppedLook {
  outline: Outline;
  creases: Creases[];
  extra: Extra;
}

const L = (outline: Outline, creases: Creases[], extra: Extra = 'none'): PoppedLook => ({ outline, creases, extra });

export const POPPED_LOOKS: PoppedLook[] = [
  L('round', ['star']),
  L('round', ['folds']),
  L('round', ['twist']),
  L('round', ['slit'], 'hole'),
  L('round', ['x']),
  L('round', ['hatch']),
  L('round', ['pleats'], 'lip'),
  L('round', ['ring'], 'pocket'),
  L('round', ['none'], 'split'),
  L('oval', ['star']),
  L('oval', ['folds'], 'flap'),
  L('oval', ['slit']),
  L('oval', ['hatch'], 'pocket'),
  L('oval', ['ring', 'star']),
  L('oval', ['pleats'], 'hole'),
  L('lumpy', ['star'], 'hole'),
  L('lumpy', ['twist']),
  L('lumpy', ['x'], 'flap'),
  L('lumpy', ['pleats']),
  L('lumpy', ['ring', 'slit']),
  L('lumpy', ['folds'], 'pocket'),
  L('notched', ['star']),
  L('notched', ['folds'], 'lip'),
  L('notched', ['slit'], 'flap'),
  L('notched', ['hatch'], 'hole'),
  L('hex', ['star']),
  L('hex', ['folds']),
  L('hex', ['x'], 'hole'),
  L('hex', ['hatch'], 'lip'),
  L('hex', ['twist'], 'pocket'),
];

export interface PoppedPalette {
  /** Fill of the flattened plastic. */
  fill: string;
  /** Its outline. */
  rim: string;
  /** Warm shadow tone as "r, g, b", and how strong shadows are. */
  shadowRgb: string;
  shadowStrength: number;
  /** The tint of the film (for the little leftover air pocket). */
  tint: string;
}

/** Paint popped look `index` centred at the origin, radius R. */
export function paintPopped(g: CanvasRenderingContext2D, R: number, index: number, pal: PoppedPalette) {
  const look = POPPED_LOOKS[((index % POPPED_LOOKS.length) + POPPED_LOOKS.length) % POPPED_LOOKS.length];
  let seed = (index + 1) * 7919 + 104729;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shadow = (a: number) => `rgba(${pal.shadowRgb},${a * pal.shadowStrength})`;

  // ——— the flattened outline ———
  const { xs, ys } = outline(look.outline, R, rnd);
  const shape = new Path2D();
  smooth(shape, xs, ys);
  g.fillStyle = pal.fill;
  g.fill(shape);
  g.strokeStyle = pal.rim;
  g.lineWidth = Math.max(1, R * 0.045);
  g.stroke(shape);

  // ——— creases, kept inside the plastic ———
  g.save();
  g.clip(shape);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const c of look.creases) creases(g, c, R, rnd, shadow);
  g.restore();

  extra(g, look.extra, R, rnd, shadow, pal, shape);
}

// ——— outlines ———

function outline(kind: Outline, R: number, rnd: () => number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (a: number, r: number, sx = 1, sy = 1, rot = 0) => {
    const x = Math.cos(a) * r * sx;
    const y = Math.sin(a) * r * sy;
    xs.push(x * Math.cos(rot) - y * Math.sin(rot));
    ys.push(x * Math.sin(rot) + y * Math.cos(rot));
  };
  switch (kind) {
    case 'round': {
      const n = 12;
      for (let i = 0; i < n; i++) push((i / n) * TAU + rnd() * 0.25, R * (0.9 + rnd() * 0.16));
      break;
    }
    case 'oval': {
      const n = 12;
      const rot = rnd() * Math.PI;
      for (let i = 0; i < n; i++) push((i / n) * TAU + rnd() * 0.2, R * (0.92 + rnd() * 0.12), 1.12, 0.82, rot);
      break;
    }
    case 'lumpy': {
      const n = 9;
      for (let i = 0; i < n; i++) push((i / n) * TAU + rnd() * 0.3, R * (0.76 + rnd() * 0.34));
      break;
    }
    case 'notched': {
      const n = 13;
      const k = Math.floor(rnd() * n);
      for (let i = 0; i < n; i++) {
        const d = Math.min(Math.abs(i - k), n - Math.abs(i - k));
        push((i / n) * TAU, R * (d === 0 ? 0.52 : d === 1 ? 0.84 : 0.93 + rnd() * 0.1));
      }
      break;
    }
    case 'hex': {
      // Flattened into its cell: a soft hexagon.
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i / 6) * TAU;
        push(a, R * (1.0 + rnd() * 0.06));
        push(a + Math.PI / 6, R * (0.9 + rnd() * 0.05));
      }
      break;
    }
  }
  return { xs, ys };
}

function smooth(p: Path2D, xs: number[], ys: number[]) {
  const n = xs.length;
  p.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  p.closePath();
}

// ——— creases ———

/** A fold in plastic: a soft dark side and a bright edge. */
function crease(g: CanvasRenderingContext2D, path: () => void, R: number, w: number, shadow: (a: number) => string) {
  g.save();
  g.translate(R * 0.03, R * 0.04);
  g.beginPath();
  path();
  g.strokeStyle = shadow(0.15);
  g.lineWidth = R * 0.07 * w;
  g.stroke();
  g.restore();
  g.beginPath();
  path();
  g.strokeStyle = rgba('#ffffff', 0.62);
  g.lineWidth = R * 0.05 * w;
  g.stroke();
}

function creases(g: CanvasRenderingContext2D, kind: Creases, R: number, rnd: () => number, shadow: (a: number) => string) {
  const at = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
  switch (kind) {
    case 'star': {
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.8;
        const r0 = R * (0.04 + rnd() * 0.2);
        const r1 = R * (0.55 + rnd() * 0.3);
        const bend = (rnd() - 0.5) * 0.6;
        crease(
          g,
          () => {
            g.moveTo(...at(a, r0));
            g.quadraticCurveTo(...at(a + bend, (r0 + r1) / 2), ...at(a, r1));
          },
          R,
          1,
          shadow,
        );
      }
      break;
    }
    case 'folds': {
      const n = 2 + Math.floor(rnd() * 2);
      const a = rnd() * Math.PI;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      for (let i = 0; i < n; i++) {
        const d = (i - (n - 1) / 2) * R * 0.4 + (rnd() - 0.5) * R * 0.12;
        const bow = (rnd() - 0.5) * R * 0.3;
        crease(
          g,
          () => {
            g.moveTo(-ux * R - uy * d, -uy * R + ux * d);
            g.quadraticCurveTo(-uy * (d + bow), ux * (d + bow), ux * R - uy * d, uy * R + ux * d);
          },
          R,
          1,
          shadow,
        );
      }
      break;
    }
    case 'twist': {
      const n = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const r = R * (0.28 + i * 0.22 + rnd() * 0.06);
        const a0 = rnd() * TAU;
        crease(g, () => g.arc(0, 0, r, a0, a0 + 1.3 + rnd() * 1.2), R, 0.9, shadow);
      }
      break;
    }
    case 'slit': {
      // A tear right across: a dark gap with bright torn edges.
      const a = rnd() * Math.PI;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const bow = (rnd() - 0.5) * R * 0.5;
      const path = (o: number) => () => {
        g.moveTo(-ux * R * 0.7 - uy * o, -uy * R * 0.7 + ux * o);
        g.quadraticCurveTo(-uy * (bow + o), ux * (bow + o), ux * R * 0.7 - uy * o, uy * R * 0.7 + ux * o);
      };
      g.beginPath();
      path(0)();
      g.strokeStyle = shadow(0.32);
      g.lineWidth = R * 0.07;
      g.stroke();
      for (const o of [-1, 1]) {
        g.beginPath();
        path(o * R * 0.055)();
        g.strokeStyle = rgba('#ffffff', 0.7);
        g.lineWidth = R * 0.03;
        g.stroke();
      }
      break;
    }
    case 'x': {
      const a = rnd() * Math.PI;
      for (const b of [a, a + Math.PI / 2 + (rnd() - 0.5) * 0.6]) {
        const bend = (rnd() - 0.5) * R * 0.2;
        crease(
          g,
          () => {
            g.moveTo(...at(b, -R * 0.75));
            g.quadraticCurveTo(...at(b + Math.PI / 2, bend), ...at(b, R * 0.75));
          },
          R,
          1,
          shadow,
        );
      }
      break;
    }
    case 'hatch': {
      // Lots of tiny crinkles.
      const n = 9 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const c = at(rnd() * TAU, Math.sqrt(rnd()) * R * 0.72);
        const a = rnd() * Math.PI;
        const l = R * (0.12 + rnd() * 0.16);
        crease(
          g,
          () => {
            g.moveTo(c[0] - Math.cos(a) * l, c[1] - Math.sin(a) * l);
            g.lineTo(c[0] + Math.cos(a) * l, c[1] + Math.sin(a) * l);
          },
          R,
          0.6,
          shadow,
        );
      }
      break;
    }
    case 'pleats': {
      // Little folds all round the rim, like a crimped edge.
      const n = 10 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd() * 0.2;
        crease(
          g,
          () => {
            g.moveTo(...at(a, R * (0.6 + rnd() * 0.1)));
            g.lineTo(...at(a + 0.05, R * 0.98));
          },
          R,
          0.7,
          shadow,
        );
      }
      break;
    }
    case 'ring': {
      // Where the dome used to stand: a partial ring.
      const a0 = rnd() * TAU;
      crease(g, () => g.arc(0, 0, R * (0.58 + rnd() * 0.08), a0, a0 + 3.8 + rnd() * 1.4), R, 0.9, shadow);
      break;
    }
    case 'none':
      break;
  }
}

// ——— details ———

function extra(
  g: CanvasRenderingContext2D,
  kind: Extra,
  R: number,
  rnd: () => number,
  shadow: (a: number) => string,
  pal: PoppedPalette,
  shape: Path2D,
) {
  switch (kind) {
    case 'hole': {
      // Where the air got out: a little hole you can see through.
      const a = rnd() * TAU;
      const d = R * (0.1 + rnd() * 0.3);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const r = R * (0.1 + rnd() * 0.06);
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.ellipse(x, y, r * 1.2, r, a, 0, TAU);
      g.fill();
      g.restore();
      g.lineCap = 'round';
      g.strokeStyle = rgba('#ffffff', 0.7);
      g.lineWidth = R * 0.035;
      g.beginPath();
      g.ellipse(x, y, r * 1.2, r, a, Math.PI * 0.9, Math.PI * 1.9);
      g.stroke();
      g.strokeStyle = shadow(0.22);
      g.beginPath();
      g.ellipse(x, y, r * 1.2, r, a, -0.1 * Math.PI, 0.9 * Math.PI);
      g.stroke();
      break;
    }
    case 'flap': {
      // A torn bit of the edge, curled back over itself.
      const a = rnd() * TAU;
      const span = 0.45 + rnd() * 0.2;
      const rim = R * 0.9;
      const p1 = [Math.cos(a - span) * rim, Math.sin(a - span) * rim];
      const p2 = [Math.cos(a + span) * rim, Math.sin(a + span) * rim];
      // The curl folds inward, toward the middle.
      const depth = R * (0.42 + rnd() * 0.14);
      const c = [Math.cos(a) * (rim - depth), Math.sin(a) * (rim - depth)];
      const flap = () => {
        g.beginPath();
        g.moveTo(p1[0], p1[1]);
        g.bezierCurveTo(
          p1[0] * 0.75 + c[0] * 0.25,
          p1[1] * 0.75 + c[1] * 0.25,
          c[0] - Math.sin(a) * R * 0.18,
          c[1] + Math.cos(a) * R * 0.18,
          c[0],
          c[1],
        );
        g.bezierCurveTo(
          c[0] + Math.sin(a) * R * 0.18,
          c[1] - Math.cos(a) * R * 0.18,
          p2[0] * 0.75 + c[0] * 0.25,
          p2[1] * 0.75 + c[1] * 0.25,
          p2[0],
          p2[1],
        );
        g.quadraticCurveTo(Math.cos(a) * rim * 0.96, Math.sin(a) * rim * 0.96, p1[0], p1[1]);
        g.closePath();
      };
      g.save();
      g.translate(R * 0.035, R * 0.05);
      flap();
      g.fillStyle = shadow(0.13);
      g.fill();
      g.restore();
      flap();
      const sheen = g.createLinearGradient(c[0], c[1], Math.cos(a) * rim, Math.sin(a) * rim);
      sheen.addColorStop(0, rgba('#ffffff', 0.7));
      sheen.addColorStop(1, rgba('#ffffff', 0.25));
      g.fillStyle = sheen;
      g.fill();
      g.strokeStyle = pal.rim;
      g.lineWidth = Math.max(0.8, R * 0.03);
      g.stroke();
      break;
    }
    case 'lip': {
      // The rim of the dome is still standing a little.
      g.lineCap = 'round';
      g.strokeStyle = rgba('#ffffff', 0.65);
      g.lineWidth = R * 0.08;
      g.beginPath();
      g.arc(0, 0, R * 0.84, Math.PI * 0.95, Math.PI * 1.75);
      g.stroke();
      g.strokeStyle = shadow(0.16);
      g.lineWidth = R * 0.07;
      g.beginPath();
      g.arc(R * 0.02, R * 0.03, R * 0.86, Math.PI * 0.05, Math.PI * 0.75);
      g.stroke();
      break;
    }
    case 'pocket': {
      // A tiny bit of air that didn't get out.
      const a = rnd() * TAU;
      const d = R * (0.35 + rnd() * 0.2);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const r = R * (0.17 + rnd() * 0.06);
      g.fillStyle = shadow(0.14);
      g.beginPath();
      g.arc(x + r * 0.2, y + r * 0.28, r * 1.05, 0, TAU);
      g.fill();
      const dome = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
      dome.addColorStop(0, rgba('#ffffff', 0.95));
      dome.addColorStop(1, rgba(pal.tint, 0.85));
      g.fillStyle = dome;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.strokeStyle = pal.rim;
      g.lineWidth = Math.max(0.8, R * 0.03);
      g.stroke();
      g.fillStyle = rgba('#ffffff', 0.95);
      g.beginPath();
      g.arc(x - r * 0.4, y - r * 0.42, r * 0.22, 0, TAU);
      g.fill();
      break;
    }
    case 'split': {
      // Split clean in two: the halves have come a little apart.
      const a = rnd() * Math.PI;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const gap = R * 0.07;
      // Wipe what was painted, then paint each half shifted off the line.
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = '#000';
      g.fill(shape);
      g.restore();
      for (const side of [-1, 1]) {
        g.save();
        g.translate(nx * gap * side, ny * gap * side);
        // This half's side of the split line.
        g.beginPath();
        const ux = Math.cos(a) * R * 2;
        const uy = Math.sin(a) * R * 2;
        g.moveTo(-ux, -uy);
        g.lineTo(ux, uy);
        g.lineTo(ux + nx * R * 2 * side, uy + ny * R * 2 * side);
        g.lineTo(-ux + nx * R * 2 * side, -uy + ny * R * 2 * side);
        g.closePath();
        g.clip();
        g.fillStyle = pal.fill;
        g.fill(shape);
        g.strokeStyle = pal.rim;
        g.lineWidth = Math.max(1, R * 0.045);
        g.stroke(shape);
        // The torn edge: bright, with a soft shadow under it.
        g.beginPath();
        g.moveTo(-ux, -uy);
        g.lineTo(ux, uy);
        g.save();
        g.clip(shape);
        g.strokeStyle = rgba('#ffffff', 0.7);
        g.lineWidth = R * 0.05;
        g.stroke();
        g.restore();
        g.restore();
      }
      break;
    }
    case 'none':
      break;
  }
}
