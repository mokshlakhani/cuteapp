import type { Preview } from '../../app/scene';
import { clamp, rand, TAU } from '../../core/math';
import { ease, Spring } from '../../design/motion';
import { fruitPalette as F } from '../../design/fruitPalette';
import { springs } from '../../design/tokens';
import { theme } from '../../design/theme';
import { reducedMotion } from '../../render/camera';
import { drawFace, Face } from '../../render/face';
import { contactShadow, gloss, shade } from '../../render/paint';

/** Seconds: the strip coming away, hanging there, falling off, and the pause before the next. */
const CURL = 3.6;
const HANG = 2;
const FALL = 1.5;
const PAUSE = 0.8;
const LOOP = CURL + HANG + FALL + PAUSE;
/** A little longer than the strip, as a share of the orange's radius. */
const STRIP = 3.6;

/**
 * The home card: an orange with its top peeled, breathing. A curl of peel
 * slowly comes away from it, hangs a while, drops off, and the next begins.
 * Painted once to a sprite: the shelf can't afford more live 3D.
 */
export function peelPreview(): Preview {
  const face = new Face();
  const swing = new Spring(0, springs.gentle);
  let time = rand(0, 20);
  let clock = reducedMotion ? CURL : rand(0, CURL);
  let sprite: HTMLCanvasElement | null = null;
  let key = '';

  const paint = (R: number) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = `${R}@${dpr}|${theme.current.name}`;
    if (sprite && k === key) return sprite;
    key = k;
    const c = (sprite ??= document.createElement('canvas'));
    const size = Math.ceil(R * 2.2);
    c.width = c.height = Math.ceil(size * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fillStyle = F.orange.peel;
    g.fill();
    g.clip();
    // The peeled band across its crown, pale as pith, sloping as the spiral does.
    g.rotate(-0.22);
    g.fillStyle = F.orange.pith;
    g.fillRect(-R * 1.3, -R * 1.2, R * 2.6, R * 0.74);
    g.fillStyle = 'rgba(255, 224, 150, 0.35)';
    g.fillRect(-R * 1.3, -R * 0.56, R * 2.6, R * 0.1);
    g.strokeStyle = 'rgba(175, 92, 24, 0.55)';
    g.lineWidth = Math.max(1.2, R * 0.038);
    g.beginPath();
    g.moveTo(-R * 1.3, -R * 0.46);
    g.lineTo(R * 1.3, -R * 0.46);
    g.stroke();
    g.strokeStyle = 'rgba(255, 255, 255, 0.62)';
    g.lineWidth = Math.max(1, R * 0.022);
    g.beginPath();
    g.moveTo(-R * 1.3, -R * 0.43);
    g.lineTo(R * 1.3, -R * 0.43);
    g.stroke();
    g.rotate(0.22);
    // Stronger 3D sphere shading + subtle orange peel pores + bottom navel dimple.
    shade(g, theme.current, 0, 0, R, 0.48, 0.38, F.orange.peel);
    g.fillStyle = 'rgba(165, 78, 12, 0.18)';
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt((i + 0.5) / 18) * R * 0.78;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr + R * 0.18;
      if (py > -R * 0.32 && Math.hypot(px, py) < R * 0.88) {
        g.beginPath();
        g.arc(px, py, Math.max(0.8, R * 0.022), 0, TAU);
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(130, 58, 10, 0.32)';
    g.lineWidth = Math.max(1, R * 0.032);
    g.beginPath();
    g.arc(0, 0, R * 0.985, 0, TAU);
    g.stroke();
    g.restore();
    // Stronger primary specular highlight + secondary wet crown glint.
    gloss(g, -R * 0.42, -R * 0.02, R * 0.29, R * 0.13, 0.84);
    gloss(g, -R * 0.25, -R * 0.62, R * 0.2, R * 0.085, 0.72);
    return c;
  };

  return {
    update(dt) {
      time += dt;
      face.update(dt);
      swing.update(dt);
      if (reducedMotion) return;
      const was = clock;
      clock = (clock + dt) % LOOP;
      if (was < CURL && clock >= CURL) {
        swing.impulse(rand(0.8, 1.2));
        face.set('happy', 1.5);
      }
    },
    draw(ctx, x, y, w, h) {
      const R = Math.min(w * 0.27, h * 0.25);
      const cx = x + w / 2;
      const bob = reducedMotion ? 0 : Math.sin(time * 1.1) * R * 0.02;
      const cy = y + h * 0.5 + bob;
      contactShadow(ctx, theme.current, cx + R * 0.12, y + h * 0.5 + R * 1.16, R * 1.18, R * 0.2, 0.42);
      contactShadow(ctx, theme.current, cx + R * 0.05, y + h * 0.5 + R * 1.13, R * 0.72, R * 0.11, 0.26);
      // The curl of peel, hanging from the cut.
      const sway = swing.value * R * 0.07;
      const px = cx + R * 0.86;
      const py = cy - R * 0.22;
      const off = clamp((clock - CURL - HANG) / FALL, 0, 1);
      const shown = ease.inOutSine(clamp(clock / CURL, 0, 1));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.setLineDash([shown * R * STRIP, R * STRIP * 2]);
      ctx.translate(0, ease.inOutCubic(off) * R * 0.9);
      ctx.globalAlpha = shown > 0 ? 1 - off : 0;
      for (const [col, wd, ox, oy] of [
        ['rgba(90, 48, 22, 0.24)', 0.19, R * 0.03, R * 0.05],
        [F.orange.peel, 0.17, 0, 0],
        [F.orange.pith, 0.085, 0, 0],
        ['rgba(255, 255, 255, 0.55)', 0.035, -R * 0.02, -R * 0.02],
      ] as [string, number, number, number][]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1.4, R * wd);
        ctx.beginPath();
        ctx.moveTo(px + ox, py + oy);
        ctx.bezierCurveTo(px + R * 0.6 + ox, py + R * 0.1 + oy, px + R * 0.46 + sway + ox, py + R * 0.55 + oy, px + R * 0.08 + sway + ox, py + R * 0.56 + oy);
        ctx.bezierCurveTo(px - R * 0.2 + sway + ox, py + R * 0.58 + oy, px - R * 0.06 + sway + ox, py + R * 0.96 + oy, px + R * 0.26 + sway * 1.4 + ox, py + R * 0.98 + oy);
        ctx.bezierCurveTo(px + R * 0.46 + sway * 1.4 + ox, py + R * 1 + oy, px + R * 0.3 + sway * 1.5 + ox, py + R * 1.28 + oy, px + R * 0.14 + sway * 1.6 + ox, py + R * 1.3 + oy);
        ctx.stroke();
      }
      ctx.restore();
      const s = paint(Math.round(R));
      const d = R * 2.2 * (Math.ceil(Math.round(R) * 2.2) / (Math.round(R) * 2.2));
      ctx.drawImage(s, cx - d / 2, cy - d / 2, d, d);
      ctx.save();
      ctx.translate(cx, cy + R * 0.12);
      drawFace(ctx, face, R * 0.9, { ink: '#2A1C17', blush: '#FF8C6B' });
      ctx.restore();
    },
    poke() {
      swing.impulse(2);
      face.set('happy', 1.4);
    },
  };
}
