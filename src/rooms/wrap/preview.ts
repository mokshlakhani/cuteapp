import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { rand, smoothstep } from '../../core/math';
import { rgba } from '../../core/color';
import { material } from '../../core/sounds';
import { reducedMotion } from '../../render/camera';
import { contactShadow } from '../../render/paint';
import { Sheet, type Bubble } from './Sheet';
import { drawSheet, FILMS } from './draw';

/** One loop: a pause, a few bubbles glow, then one by one those same ones quietly pop. */
const REST = 1.2;
const GLOW = 1.4;
const GAP = 0.45;
const GOLD = '#f6c96b';

/**
 * The memory game on the home card, playing itself: a little patch of bubble
 * wrap where a few bubbles glow gold, fade, and then those same ones softly
 * pop, as if remembered. When too few are left it puffs back up. Poke it and
 * one pops for you, with sound.
 */
export function wrapPreview(): Preview {
  let sheet: Sheet | null = null;
  let key = '';
  let t = 0;
  let lit: Bubble[] = [];
  let popped = 0;
  let quiet = 0;

  const make = (w: number, h: number) => {
    const s = new Sheet(w, h, 'jumbo');
    s.events = {
      pop: (b, _cause, order) => {
        if (!lit.includes(b)) material.bubblePop(0.8, 0.9, order, 0, b.voice);
        b.wobble.impulse(lit.includes(b) ? 4 : 9);
        if (b.face) {
          b.face.base = 'sleepy';
          b.face.set('happy', 0.9);
        }
      },
    };
    return s;
  };

  const refill = (s: Sheet) => {
    for (const b of s.bubbles) {
      b.popped = false;
      b.press = 0;
      b.popT = 0;
      b.wobble.impulse(rand(2, 4));
      if (b.face) {
        b.face.base = 'calm';
        b.face.set('happy', 0.8);
      }
    }
  };

  return {
    update(dt) {
      if (!sheet) return;
      const steps = Math.min(6, Math.max(1, Math.ceil(dt * 240)));
      for (let i = 0; i < steps; i++) sheet.step(dt / steps);
      sheet.frame();
      sheet.update(dt);
      quiet += dt;
      if (quiet > 0.6) sheet.resetOrder();
      if (reducedMotion) return;
      t += dt;
      if (!lit.length && t > REST) {
        const left = sheet.bubbles.filter((b) => !b.popped);
        if (left.length < 3) {
          refill(sheet);
          t = 0;
          return;
        }
        lit = [...left].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(rand(0, 2)));
        for (const b of lit) b.face?.set('happy', GLOW);
        popped = 0;
        t = 0;
      }
      // After the glow, the same ones pop, one by one.
      if (lit.length && t > GLOW + GAP * (popped + 1)) {
        const b = lit[popped++];
        if (b && !b.popped) sheet.pop(b, 'press', 0.7);
        if (popped >= lit.length) {
          lit = [];
          t = 0;
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
        lit = [];
        t = 0;
      }
      sheet.moveTo(x + (w - sheet.W) / 2, y + h * 0.5 - sheet.H / 2);
      const th = theme.current;
      // Stronger grounded shadow and top-left rim highlight so the sprite tile pops like the 3D tiles.
      contactShadow(ctx, th, sheet.x0 + sheet.W * 0.53, sheet.y0 + sheet.H * 0.96, sheet.W * 0.52, sheet.H * 0.14, 0.34);
      drawSheet(ctx, th, FILMS[0], sheet);
      ctx.save();
      ctx.strokeStyle = rgba('#ffffff', th.light ? 0.85 : 0.4);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sheet.x0 + 12, sheet.y0 + 1.5);
      ctx.lineTo(sheet.x0 + sheet.W * 0.65, sheet.y0 + 1.5);
      ctx.stroke();
      ctx.restore();
      // The glowing ones, fading in and out.
      const a = Math.min(smoothstep(0, 0.25, t), 1 - smoothstep(GLOW - 0.3, GLOW, t));
      if (a > 0.01)
        for (const b of lit) {
          if (b.popped) continue;
          const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r * 1.5);
          g.addColorStop(0, rgba(GOLD, 0.6 * a));
          g.addColorStop(0.62, rgba(GOLD, 0.4 * a));
          g.addColorStop(1, rgba(GOLD, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = rgba(GOLD, a);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 1.08, 0, Math.PI * 2);
          ctx.stroke();
        }
    },
    poke() {
      if (!sheet) return;
      const left = sheet.bubbles.filter((b) => !b.popped && !lit.includes(b));
      const b = left[Math.floor(rand(0, left.length))];
      quiet = 0;
      if (b) sheet.pop(b, 'press', 1);
      else sheet.kick(sheet.x0 + sheet.W / 2, sheet.y0 + sheet.H / 2, 60, sheet.W);
    },
  };
}
