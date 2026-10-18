import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { clamp, rand, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { material } from '../../core/sounds';
import { Face } from '../../render/face';
import { Glass } from './Glass';
import { DRINKS } from './drinks';
import { drawGlass, glassShape, halfAt, yAt } from './draw';

const SODA = DRINKS[1];

/**
 * A little glass of peach soda for the home card. It slowly fills from a
 * thin stream, fizzes, and quietly empties again. Poke it and it sloshes,
 * giggles and glugs.
 */
export function pourPreview(): Preview {
  const glass = new Glass(SODA.foamy * 0.4, 0.7);
  const face = new Face();
  const bubbles: { u: number; f: number; sp: number }[] = [];
  let time = 0;
  let phase: 'fill' | 'rest' | 'drain' = 'fill';
  let phaseT = 0;
  let poured = 0;

  return {
    update(dt) {
      time += dt;
      phaseT += dt;
      face.update(dt);
      if (phase === 'fill') {
        if (glass.level < glass.line) {
          glass.add(0.12 * dt, 0.5, 500);
          poured += dt;
          if (poured > 0.22) {
            poured = 0;
            material.glug(glass.level, 0.2);
          }
        } else if (phaseT > 1) {
          phase = 'rest';
          phaseT = 0;
          face.set('happy', 1.2);
        }
      } else if (phase === 'rest' && phaseT > 4) {
        phase = 'drain';
        phaseT = 0;
      } else if (phase === 'drain') {
        glass.level = Math.max(0, glass.level - 0.2 * dt);
        if (glass.level <= 0) {
          phase = 'fill';
          phaseT = 0;
        }
      }
      glass.step(dt);
      if (glass.level > 0.05 && Math.random() < dt * 6) bubbles.push({ u: rand(0.15, 0.85), f: 0, sp: rand(0.2, 0.35) });
      for (const b of bubbles) b.f += b.sp * dt;
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].f > glass.level - 0.01) bubbles.splice(i, 1);
    },
    draw(ctx, x, y, w, h) {
      const t = theme.current;
      const gW = Math.min(w * 0.36, h * 0.5);
      const g = glassShape(x + w / 2, y + h * 0.78, gW);
      // The thin stream, while it's filling.
      if (phase === 'fill' && glass.level < glass.line) {
        ctx.strokeStyle = SODA.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(g.cx, y + h * 0.04);
        ctx.lineTo(g.cx, yAt(g, glass.top));
        ctx.stroke();
      }
      drawGlass(ctx, t, g, glass, SODA, {
        face,
        glow: 0,
        nudge: 0,
        time,
        inside: (c) => {
          c.fillStyle = rgba('#ffffff', 0.55);
          for (const b of bubbles) {
            const half = halfAt(g, b.f);
            c.beginPath();
            c.arc(g.cx - half + b.u * half * 2, yAt(g, b.f), 1.3, 0, TAU);
            c.fill();
          }
        },
      });
    },
    poke() {
      glass.slosh(clamp(1.5 + Math.random(), 0, 3));
      face.set('happy', 0.8);
      material.glug(glass.level, 0.6);
    },
  };
}
