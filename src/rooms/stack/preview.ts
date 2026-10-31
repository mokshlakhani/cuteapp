import type { Preview } from '../../app/scene';
import { clamp, rand } from '../../core/math';
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
    const f = g.createLinearGradient(-W * 0.3, -H, W * 0.3, H);
    f.addColorStop(0, col);
    f.addColorStop(1, deep);
    g.fillStyle = f;
    g.fill();
    gloss(g, -W * 0.4, -H * 0.45, W * 0.3, H * 0.22, 0.5);
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
      contactShadow(ctx, theme.current, cx + u * 0.02, floor, u * 0.5, u * 0.07, 0.3);
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
        if (top) ctx.globalAlpha = clamp((1 - above) / 0.5, 0, 1);
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
