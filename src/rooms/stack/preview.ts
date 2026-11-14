import type { Preview } from '../../app/scene';
import { clamp, rand } from '../../core/math';
import { mix } from '../../core/color';
import { ease, Spring } from '../../design/motion';
import { springs } from '../../design/tokens';
import { reducedMotion } from '../../render/camera';
import { contactShadow, gloss } from '../../render/paint';
import { theme } from '../../design/theme';
import { drawFace, Face } from '../../render/face';

/** Seconds: the top stone coming down, sitting, lifting away, and the pause before it's back. */
const DROP = 1.7;
const SIT = 3.4;
const LIFT = 1.5;
const PAUSE = 0.7;
const LOOP = DROP + SIT + LIFT + PAUSE;
/** How far over the cairn the top stone comes from, as a share of the toy's size. */
const FROM = 0.42;

/** The little cairn on the card: three stones, each [half width, half height, colour, x offset]. */
const STONES: [number, number, string, string, number][] = [
  [0.46, 0.15, '#DCC6A9', '#B99F80', 0],
  [0.34, 0.13, '#BAC6BB', '#8FA093', 0.04],
  [0.23, 0.12, '#E0B9A6', '#BC8C78', -0.02],
];

/**
 * The home card: a small cairn on a board, breathing. Its top stone, dozing,
 * is slowly set down on it, and the tower gives a tiny sway; after a while it
 * lifts away to come round again. Painted once to a sprite: the shelf can't
 * afford more live 3D.
 */
export function stackPreview(): Preview {
  const face = new Face();
  face.base = 'sleepy';
  const sway = new Spring(0, springs.gentle);
  let time = rand(0, 20);
  let clock = reducedMotion ? DROP : rand(0, DROP);
  const sprites = new Map<string, HTMLCanvasElement>();

  /** One stone, soft and shaded, at this size. */
  const stone = (i: number, u: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = `${i}|${Math.round(u)}@${dpr}`;
    let c = sprites.get(key);
    if (c) return c;
    const [a, b, col, deep] = STONES[i];
    const W = a * u;
    const H = b * u;
    c = document.createElement('canvas');
    c.width = Math.ceil(W * 2 * dpr);
    c.height = Math.ceil(H * 2 * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, W * dpr, H * dpr);
    g.beginPath();
    // A flattened superellipse: flat where stones meet.
    for (let k = 0; k <= 48; k++) {
      const t = (k / 48) * Math.PI * 2;
      const pw = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / 3);
      const px = pw(Math.cos(t)) * W * 0.99;
      const py = pw(Math.sin(t)) * H * 0.99;
      if (k) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.closePath();
    g.save();
    g.clip();
    const f = g.createLinearGradient(-W * 0.35, -H, W * 0.4, H);
    f.addColorStop(0, mix(col, '#ffffff', 0.28));
    f.addColorStop(0.45, col);
    f.addColorStop(1, mix(deep, '#4A3931', 0.25));
    g.fillStyle = f;
    g.fillRect(-W * 1.1, -H * 1.1, W * 2.2, H * 2.2);

    // Per-stone mineral character: sedimentary band on bottom stone, quartz vein on middle stone, mineral speckles on all.
    if (i === 0) {
      g.strokeStyle = 'rgba(255, 248, 236, 0.34)';
      g.lineWidth = Math.max(1.5, H * 0.22);
      g.beginPath();
      g.moveTo(-W * 1.05, H * 0.12);
      g.quadraticCurveTo(0, -H * 0.08, W * 1.05, H * 0.18);
      g.stroke();
    } else if (i === 1) {
      g.strokeStyle = 'rgba(250, 252, 248, 0.48)';
      g.lineWidth = Math.max(1, H * 0.11);
      g.beginPath();
      g.moveTo(-W * 0.55, -H * 0.9);
      g.quadraticCurveTo(-W * 0.12, 0, W * 0.38, H * 0.95);
      g.stroke();
    }
    g.fillStyle = 'rgba(58, 42, 34, 0.16)';
    for (let s = 0; s < 14; s++) {
      const a0 = (s + i * 5) * 2.39996;
      const rr = Math.sqrt((s + 0.5) / 14) * 0.82;
      g.beginPath();
      g.arc(Math.cos(a0) * W * rr, Math.sin(a0) * H * rr, Math.max(0.7, H * 0.055), 0, Math.PI * 2);
      g.fill();
    }
    // Warm underside ambient occlusion band.
    const uSh = g.createLinearGradient(0, H * 0.2, 0, H);
    uSh.addColorStop(0, 'rgba(50, 34, 28, 0)');
    uSh.addColorStop(1, 'rgba(50, 34, 28, 0.24)');
    g.fillStyle = uSh;
    g.fillRect(-W * 1.1, H * 0.2, W * 2.2, H * 0.9);
    g.restore();

    g.strokeStyle = 'rgba(68, 48, 40, 0.28)';
    g.lineWidth = Math.max(1, H * 0.06);
    g.stroke();
    gloss(g, -W * 0.4, -H * 0.46, W * 0.34, H * 0.24, 0.78);
    gloss(g, -W * 0.1, -H * 0.62, W * 0.13, H * 0.09, 0.5);
    sprites.set(key, c);
    return c;
  };

  return {
    update(dt) {
      time += dt;
      face.update(dt);
      sway.update(dt);
      if (reducedMotion) return;
      const was = clock;
      clock = (clock + dt) % LOOP;
      if (was < DROP && clock >= DROP) {
        sway.impulse(rand(0.5, 0.8) * (Math.random() < 0.5 ? -1 : 1));
        face.set('happy', 1.5);
      }
    },
    draw(ctx, x, y, w, h) {
      const u = Math.min(w * 0.76, h * 0.74);
      const cx = x + w / 2;
      const floor = y + h * 0.8;
      contactShadow(ctx, theme.current, cx + u * 0.03, floor + 1, u * 0.54, u * 0.085, 0.44);
      contactShadow(ctx, theme.current, cx + u * 0.01, floor, u * 0.34, u * 0.048, 0.28);
      const breathe = reducedMotion ? 0 : Math.sin(time * 1.1) * 0.006;
      const coming = ease.inOutCubic(clamp(clock / DROP, 0, 1));
      const going = ease.inOutCubic(clamp((clock - DROP - SIT) / LIFT, 0, 1));
      let py = floor;
      STONES.forEach(([a, b, , , off], i) => {
        const H = b * u;
        const lift = 1 + breathe;
        py -= H * lift;
        const sx = cx + off * u + sway.value * 0.02 * u * i * i;
        ctx.save();
        const top = i === 2;
        // Gone before it reaches the top of the card.
        const above = 1 - coming + going;
        const topAlpha = clamp((0.7 - above) / 0.4, 0, 1);
        // Inter-stone contact shadow cast onto the stone below.
        if (i === 1) {
          contactShadow(ctx, theme.current, sx + u * 0.015, py + H * 0.96, a * u * 0.92, H * 0.28, 0.34);
        } else if (top && topAlpha > 0.02) {
          const proximity = clamp(1 - above * 1.8, 0, 1);
          contactShadow(ctx, theme.current, sx + u * 0.01, py + H * 0.96, a * u * (0.88 - above * 0.25), H * 0.26, 0.32 * proximity * topAlpha);
        }
        if (top) ctx.globalAlpha = topAlpha;
        const sy = top ? py - above * FROM * u : py;
        ctx.drawImage(stone(i, Math.round(u)), sx - a * u, sy - H, a * u * 2, H * 2);
        if (top) {
          ctx.translate(sx, sy);
          drawFace(ctx, face, a * u * 1.2, { ink: '#3A2B33', blush: '#F2A08C' });
        }
        ctx.restore();
        py -= H * lift;
      });
    },
    poke() {
      sway.impulse(1.2);
      face.set('happy', 1.4);
    },
  };
}
