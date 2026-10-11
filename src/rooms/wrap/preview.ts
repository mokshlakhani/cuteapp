import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { rand } from '../../core/math';
import { material } from '../../core/sounds';
import { Sheet } from './Sheet';
import { drawSheet, FILMS } from './draw';

/**
 * A little patch of bubble wrap for the home card. Poke it and a bubble
 * pops; pop them all and it quietly puffs back up.
 */
export function wrapPreview(): Preview {
  let sheet: Sheet | null = null;
  let key = '';
  let refill = 0;
  let quiet = 0;
  const make = (w: number, h: number) => {
    const s = new Sheet(w, h, 'jumbo');
    s.events = {
      pop: (b, _cause, order) => {
        material.bubblePop(0.8, 0.9, order, 0, b.voice);
        b.wobble.impulse(9);
        if (b.face) {
          b.face.base = 'sleepy';
          b.face.set('happy', 0.7);
        }
        for (const o of s.bubbles) if (o !== b && !o.popped) o.face?.set('surprised', 0.4);
      },
    };
    return s;
  };
  return {
    update(dt) {
      if (!sheet) return;
      const steps = Math.min(6, Math.max(1, Math.ceil(dt * 240)));
      for (let i = 0; i < steps; i++) sheet.step(dt / steps);
      sheet.frame();
      sheet.update(dt);
      // Pokes in quick succession climb the scale; a pause starts it low.
      quiet += dt;
      if (quiet > 0.6) sheet.resetOrder();
      if (sheet.remaining === 0) {
        refill += dt;
        if (refill > 1.2) {
          refill = 0;
          for (const b of sheet.bubbles) {
            b.popped = false;
            b.press = 0;
            b.popT = 0;
            b.wobble.impulse(rand(5, 9));
            if (b.face) {
              b.face.base = 'calm';
              b.face.set('happy', 0.8);
            }
          }
        }
      }
    },
    draw(ctx, x, y, w, h) {
      const pw = Math.round(w * 0.74);
      const ph = Math.round(h * 0.52);
      const k = `${pw}x${ph}`;
      if (!sheet || k !== key) {
        sheet = make(pw, ph);
        key = k;
      }
      sheet.moveTo(x + (w - sheet.W) / 2, y + h * 0.47 - sheet.H / 2);
      drawSheet(ctx, theme.current, FILMS[0], sheet);
    },
    poke() {
      if (!sheet) return;
      const left = sheet.bubbles.filter((b) => !b.popped);
      const b = left[Math.floor(rand(0, left.length))];
      quiet = 0;
      if (b) sheet.pop(b, 'press', 1);
      else sheet.kick(sheet.x0 + sheet.W / 2, sheet.y0 + sheet.H / 2, 60, sheet.W);
    },
  };
}
