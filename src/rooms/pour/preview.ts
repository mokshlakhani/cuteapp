import type { Preview } from '../../app/scene';
import { theme } from '../../design/theme';
import { ease } from '../../design/motion';
import { clamp, lerp, rand, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { material } from '../../core/sounds';
import { reducedMotion } from '../../render/camera';
import { Face } from '../../render/face';
import { Glass } from './Glass';
import { DRINKS, type Drink } from './drinks';
import { GlassExtras } from './extras';
import { drawGlass, drawJug, glassShape, halfAt, hover, jugShape, spout, yAt, type GlassShape } from './draw';

/** How far each tips while it pours, and where its stream lands (× glass width). */
const TILT = 0.92;
const AIM = -0.1;
/** Seconds: sliding in, settling, the ting, admiring it, sliding off. */
const IN = 1.4;
const SETTLE = 0.6;
const TING = 0.7;
const ADMIRE = 3.2;
const OUT = 1.3;
/** Glass heights per second while it pours. */
const FLOW = 0.13;

type Phase = 'in' | 'pour' | 'settle' | 'ting' | 'admire' | 'out';

/**
 * The home card plays the game in miniature, slowly: a glass drifts in, the
 * next drink pours gently from its own bottle, carton, pitcher or jug and
 * stops right on the line, the line softly glows, and after a long, easy
 * moment the glass drifts away for the next one. It all happens quietly; poke
 * it and it sloshes and glugs.
 */
export function pourPreview(): Preview {
  let which = DRINKS.findIndex((d) => d.id === 'cola') - 1;
  let drink: Drink = DRINKS[0];
  let glass = new Glass(0, 0.6);
  let extras = new GlassExtras(undefined, 0);
  const face = new Face();
  const bubbles: { u: number; f: number; sp: number }[] = [];
  let phase: Phase = 'in';
  let phaseT = 0;
  let time = 0;
  let tilt = 0;

  const next = () => {
    which = (which + 1) % DRINKS.length;
    drink = DRINKS[which];
    const ex = new GlassExtras(drink.extra, 0);
    extras = ex;
    glass = new Glass(drink.foamy, Math.round(rand(0.5, drink.id === 'cola' ? 0.62 : 0.72) * 100) / 100);
    glass.solidAt = (f) => ex.solidAt(f);
    bubbles.length = 0;
    face.set('calm', 0.1);
  };
  const go = (p: Phase) => {
    phase = p;
    phaseT = 0;
  };
  next();

  return {
    update(dt) {
      time += dt;
      phaseT += dt;
      face.update(dt);
      if (reducedMotion) {
        glass.level = glass.line;
        phase = 'admire';
        phaseT = 0;
      }
      const pouring = phase === 'pour';
      tilt += ((pouring ? TILT : 0) - tilt) * Math.min(1, dt * 2.6);
      switch (phase) {
        case 'in':
          if (phaseT > IN) go('pour');
          break;
        case 'pour':
          if (tilt > 0.6) {
            glass.add(FLOW * dt * clamp((tilt - 0.6) / 0.3, 0, 1), 0.42, 500);
            face.set(glass.level > glass.line - 0.1 ? 'wide' : 'happy', 0.3);
          }
          // Let go just short of the line: what's in the air lands on it.
          if (glass.level >= glass.line - 0.012) go('settle');
          break;
        case 'settle':
          if (phaseT > SETTLE && (glass.foam < 0.03 || phaseT > 1.6)) {
            go('ting');
            face.set('happy', 2.4);
          }
          break;
        case 'ting':
          if (phaseT > TING) go('admire');
          break;
        case 'admire':
          if (phaseT > ADMIRE && !reducedMotion) {
            go('out');
            glass.slosh(-0.5);
          }
          break;
        case 'out':
          if (phaseT > OUT) {
            next();
            go('in');
            glass.slosh(0.5);
          }
          break;
      }
      glass.step(dt);
      extras.update(dt, pouring && tilt > 0.6 ? 0.7 : 0);
      if (drink.fizz && glass.level > 0.05 && Math.random() < dt * 8) bubbles.push({ u: rand(0.15, 0.85), f: 0, sp: rand(0.2, 0.35) });
      for (const b of bubbles) b.f += b.sp * dt;
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].f > glass.level - 0.01) bubbles.splice(i, 1);
    },
    draw(ctx, x, y, w, h) {
      const t = theme.current;
      // Small enough that the tallest pourer, held above the glass, still fits the card.
      const gW = Math.min(w * 0.27, h * 0.27);
      const floor = y + h * 0.72;
      const home = glassShape(x + w / 2, floor, gW);
      // Sliding in from the left and off to the right, leaning as it goes.
      let off = 0;
      let lean = 0;
      if (phase === 'in') {
        const k = ease.inOutCubic(clamp(phaseT / IN, 0, 1));
        off = -(1 - k) * (w * 0.5 + gW);
        lean = 0.03 * (1 - k);
      } else if (phase === 'out') {
        const k = ease.inOutCubic(clamp(phaseT / OUT, 0, 1));
        off = k * (w * 0.5 + gW);
        lean = -0.03 * Math.min(1, k * 3);
      }
      const g: GlassShape = off ? { ...home, cx: home.cx + off } : home;
      const j = jugShape(gW, drink.from);
      const jx = home.cx + gW * AIM - spout(j, 0, 0, TILT).x;
      const jy = yAt(home, 1) - hover(j) + 4;
      // The pourer drops in as the glass arrives and lifts away as it leaves.
      let lift = 0;
      if (phase === 'in') lift = 1 - ease.inOutCubic(clamp(phaseT / IN, 0, 1));
      else if (phase === 'out') lift = ease.inOutCubic(clamp(phaseT / OUT, 0, 1));
      const rest = 1 - clamp(tilt / 0.3, 0, 1);
      const bob = reducedMotion ? 0 : Math.sin(time * 2.1) * 0.8 * rest;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const lineIn = phase === 'in' ? ease.outCubic(clamp((phaseT - IN * 0.4) / (IN * 0.6), 0, 1)) : 1;
      const glint = phase === 'ting' ? ease.inOutSine(clamp(phaseT / TING, 0, 1)) : 0;
      const lit = phase === 'ting' ? clamp(phaseT / (TING * 0.4), 0, 1) : phase === 'admire' || phase === 'out' ? 1 : 0;
      drawGlass(ctx, t, g, glass, drink, {
        face,
        time,
        lineIn,
        pointer: false,
        glint,
        lit,
        nudge: 0,
        lean,
        faceAt: drink.extra ? Math.max(0.46, extras.top + 0.08) : 0.3,
        inside: (c) => {
          c.fillStyle = rgba('#ffffff', 0.55);
          for (const b of bubbles) {
            const half = halfAt(g, b.f);
            c.beginPath();
            c.arc(g.cx - half + b.u * half * 2, yAt(g, b.f), 1.1, 0, TAU);
            c.fill();
          }
        },
        extras: drink.extra ? (c) => extras.draw(c, g, glass, time) : undefined,
      });
      extras.drawRim(ctx, g);

      // The stream, from the mouth down to the drink.
      if (tilt > 0.6 && phase === 'pour') {
        const lip = spout(j, jx, jy, tilt);
        const sy = yAt(g, glass.top);
        ctx.strokeStyle = drink.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = lerp(1.5, 3, clamp((tilt - 0.6) / 0.3, 0, 1));
        ctx.beginPath();
        ctx.moveTo(lip.x, lip.y);
        ctx.quadraticCurveTo(lip.x + lip.dx * 4, (lip.y + sy) / 2, g.cx + gW * AIM, sy);
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.45);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      drawJug(ctx, t, j, jx, jy - lift * gW * 0.9 + bob, tilt, drink, 1 - clamp(lift, 0, 1));
      ctx.restore();
    },
    poke() {
      glass.slosh(clamp(1.5 + Math.random(), 0, 3));
      face.set('happy', 0.8);
      material.glug(glass.level, 0.6);
    },
  };
}
