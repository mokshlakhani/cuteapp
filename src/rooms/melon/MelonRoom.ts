import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint, world } from '../../design/tokens';
import { ease } from '../../design/motion';
import { clamp, lerp, rand, smoothstep, TAU } from '../../core/math';
import { mix, rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Particles } from '../../render/particles';
import { Shake } from '../../render/camera';
import { el, Hint } from '../../ui/components';
import { BAND_ZONE, MELON, Melon, nextBandColor } from './Melon';
import { Burst } from './Burst';

type Phase = 'intro' | 'play' | 'critical' | 'burst' | 'clear';

interface Swipe {
  ax: number;
  ay: number;
  minX: number;
  maxX: number;
  ySum: number;
  yN: number;
  lastTick: number;
}

/**
 * Room: watermelon + rubber bands.
 * anticipation → tension → release → satisfaction → (gently) again.
 */
export class MelonRoom implements Scene {
  readonly id = 'melon';
  readonly tint = roomTint.melon;
  readonly ui: HTMLElement;

  private w = 0;
  private h = 0;
  private floorY = 0;
  private melon = new Melon();
  private burst: Burst;
  private particles = new Particles();
  private shake = new Shake();
  private hint = new Hint('swipe across the melon', 'hand');

  private phase: Phase = 'intro';
  private phaseT = 0;
  /** Scene-local time scale: slow motion lives here. */
  private timeScale = 1;
  private slowmo = 0; // real seconds since burst
  private flash = 0;
  private vy = 0; // drop-in velocity
  private nextColor = nextBandColor();
  private lastBandAt = 0;
  private nextCreak = 0;
  private quietFor = 0;
  private swipes = new Map<number, Swipe>();
  private pending: { x0: number; y0: number; x1: number; y1: number; a: number } | null = null;

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-melon');
    this.ui.append(this.hint.root);
    this.burst = new Burst({
      onImpact: (x, s, size) => {
        if (s > 0.12) {
          material.thump(s * 0.6, panFor(x, this.w));
          if (size > 20 && s > 0.3) haptics.play('soft');
        }
      },
    });
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    const usable = h - safe.bottom;
    this.floorY = Math.round(usable * world.floorRatio);
    const R = clamp(Math.min(w * 0.31, usable * 0.17), 78, 170);
    this.melon.R = R;
    this.melon.cx = w / 2;
    this.melon.floorY = this.floorY;
    this.burst.floorY = this.floorY;
    this.burst.width = w;
    this.particles.floorY = this.floorY;
    this.particles.width = w;
  }

  enter() {
    this.beginIntro(true);
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1400);
  }

  leave() {
    this.hint.hide();
    this.swipes.clear();
    this.pending = null;
  }

  private beginIntro(instant = false) {
    this.melon.reset();
    this.phase = 'intro';
    this.phaseT = 0;
    this.melon.lift = instant ? this.melon.R * 1.2 : this.floorY + this.melon.R * 2;
    this.vy = 0;
    this.melon.face.set('happy', 1.5);
    this.nextCreak = rand(0.65, 0.82);
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    this.melon.face.look((p.x - this.melon.cx) / this.melon.R, (p.y - this.melon.cy) / this.melon.R);
    if (this.phase === 'burst' || this.phase === 'clear') {
      if (this.burst.poke(p.x, p.y)) {
        material.boop(30, 0.6, panFor(p.x, this.w));
        haptics.play('tap');
        this.quietFor = 0;
      }
      return;
    }
    // Touching the melon makes it give a tiny, living wobble.
    if (this.phase === 'play' && this.melon.contains(p.x, p.y)) {
      this.melon.squash.impulse(0.9);
      this.melon.sway.impulse((p.x - this.melon.cx) / this.melon.R);
    }
    this.swipes.set(p.id, { ax: p.x, ay: p.y, minX: Infinity, maxX: -Infinity, ySum: 0, yN: 0, lastTick: 0 });
    this.track(p);
  }

  pointerMove(p: Pointer) {
    const m = this.melon;
    m.face.look((p.x - m.cx) / m.R, (p.y - m.cy) / m.R);
    const s = this.swipes.get(p.id);
    if (!s || this.phase !== 'play') return;
    this.track(p);
    const len = Math.hypot(p.x - s.ax, p.y - s.ay);
    if (len > 10) {
      this.pending = { x0: s.ax, y0: s.ay, x1: p.x, y1: p.y, a: 1 };
      // Stretching the band: ticks that tighten as it lengthens.
      const step = Math.max(18, 46 - len * 0.08);
      if (len - s.lastTick > step) {
        s.lastTick = len;
        haptics.play('tick');
      }
    }
    // Crossed the melon? Snap a band on, then keep going for more.
    const hw = m.halfWidth(0.15);
    if (s.minX < m.cx - hw * 0.42 && s.maxX > m.cx + hw * 0.42 && s.yN > 0) {
      this.placeBand(s.ySum / s.yN, p.x);
      s.ax = p.x;
      s.ay = p.y;
      s.minX = s.maxX = p.x;
      s.ySum = 0;
      s.yN = 0;
      s.lastTick = 0;
      this.pending = null;
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    const s = this.swipes.get(p.id);
    this.swipes.delete(p.id);
    if (this.pending) {
      // Let the half-pulled band twang back and fade.
      this.pending.a = 0.99;
    }
    if (!s || cancelled || this.phase !== 'play') return;
    const quick = performance.now() - p.startTime < 320;
    if (p.travel < 12 && quick && this.melon.contains(p.x, p.y, 6)) {
      this.placeBand(p.y, p.x);
    }
  }

  private track(p: Pointer) {
    const s = this.swipes.get(p.id);
    if (!s) return;
    const m = this.melon;
    const v = m.vAt(p.y);
    if (v > -1.15 && v < 1.15) {
      s.minX = Math.min(s.minX, p.x);
      s.maxX = Math.max(s.maxX, p.x);
      s.ySum += p.y;
      s.yN++;
    }
  }

  private placeBand(y: number, x: number) {
    if (this.phase !== 'play') return;
    const now = performance.now();
    if (now - this.lastBandAt < 110) return;
    this.lastBandAt = now;
    const m = this.melon;
    const fromV = clamp(m.vAt(y), -0.9, 0.9);
    const v = clamp(fromV, BAND_ZONE.min, BAND_ZONE.max);
    m.addBand(v, fromV, this.nextColor);
    this.nextColor = nextBandColor(this.nextColor);
    const t = m.fullness;
    const pan = panFor(x, this.w);
    material.twang(m.tension * 0.6 + t * 0.4, pan);
    haptics.play(t > 0.6 ? 'snap' : 'tap');
    m.face.set(t > 0.7 ? 'squeeze' : t > 0.35 ? 'wide' : 'happy', 0.45);

    // A couple of tiny sparkles where the band lands.
    const p = m.project(0, v);
    const hw = m.halfWidth(v);
    for (const side of [-1, 1]) {
      this.particles.emit({
        kind: 'sparkle',
        x: p.x + side * hw,
        y: p.y + 4,
        count: 1,
        speed: [30, 70],
        size: [4, 6],
        life: [0.35, 0.5],
        color: '#ffffff',
      });
    }

    if (!settings.value.seenHints.includes(this.id) && m.bands.length >= 2) {
      settings.markHintSeen(this.id);
      this.hint.hide();
    }
    if (m.ready) this.beginCritical();
  }

  private beginCritical() {
    this.phase = 'critical';
    this.phaseT = 0;
    this.melon.face.set('strain', 3);
    this.melon.swell.target = 0.07;
    material.creak(1, 0);
    haptics.play('tick');
  }

  private pop() {
    const m = this.melon;
    const c = m.center();
    this.phase = 'burst';
    this.phaseT = 0;
    this.quietFor = 0;
    this.slowmo = 0;
    this.timeScale = 0.12;
    this.flash = 1;
    this.shake.kick(7);
    material.burst(0);
    haptics.play('burst');

    const bands = m.bands.map((b) => ({
      color: b.color,
      y: b.y.value,
      th: Math.max(2, m.R * 0.05 * b.thick * 0.75),
      rx: m.halfWidth(b.y.value),
    }));
    this.burst.explode(m.outline(), c, m.R, bands);

    // Juice + seeds + air, all soft and cartoon-round.
    this.particles.emit({
      kind: 'drop',
      x: c.x,
      y: c.y,
      count: 46,
      speed: [260, 900],
      size: [3, 7.5],
      life: [1.2, 2.2],
      color: MELON.flesh,
      vy: -260,
    });
    this.particles.emit({
      kind: 'seed',
      x: c.x,
      y: c.y,
      count: 14,
      speed: [250, 700],
      size: [m.R * 0.04, m.R * 0.055],
      life: [3.5, 4.5],
      color: MELON.seed,
      vy: -320,
    });
    this.particles.emit({
      kind: 'puff',
      x: c.x,
      y: c.y,
      count: 10,
      speed: [120, 320],
      size: [m.R * 0.15, m.R * 0.28],
      life: [0.5, 0.9],
      color: '#ffffff',
    });
    this.particles.emit({
      kind: 'sparkle',
      x: c.x,
      y: c.y,
      count: 12,
      speed: [200, 520],
      size: [5, 9],
      life: [0.6, 1.1],
      color: '#ffffff',
    });
  }

  // ——— simulation ———

  update(realDt: number) {
    // Slow-motion curve: a held breath right at the pop, then ease back.
    if (this.phase === 'burst' && this.timeScale < 1) {
      this.slowmo += realDt;
      const hold = 0.2;
      const back = 0.55;
      this.timeScale = this.slowmo < hold ? 0.12 : lerp(0.12, 1, ease.inCubic(clamp((this.slowmo - hold) / back, 0, 1)));
    }
    const dt = realDt * this.timeScale;
    this.phaseT += realDt;
    this.flash = Math.max(0, this.flash - realDt * 3.5);
    this.shake.update(realDt);
    this.particles.update(dt);
    if (this.pending && this.pending.a < 1) {
      this.pending.a -= realDt * 6;
      if (this.pending.a <= 0) this.pending = null;
    }

    const m = this.melon;
    switch (this.phase) {
      case 'intro': {
        this.vy += world.gravity * 1.1 * dt;
        m.lift -= this.vy * dt;
        if (m.lift <= 0) {
          m.lift = 0;
          const impact = this.vy;
          this.vy = 0;
          this.phase = 'play';
          m.squash.impulse(Math.min(14, impact / 90));
          material.thump(clamp(impact / 1400, 0.2, 0.8), 0);
          haptics.play('thud');
          m.face.set('happy', 1.2);
          this.particles.emit({
            kind: 'puff',
            x: m.cx,
            y: this.floorY,
            count: 7,
            angle: -Math.PI / 2,
            spread: Math.PI * 1.1,
            speed: [60, 160],
            size: [8, 14],
            life: [0.4, 0.7],
            color: '#ffffff',
          });
        }
        m.update(dt);
        break;
      }
      case 'play': {
        m.update(dt);
        // Expression and voice follow the (hidden) tension.
        const T = m.tension;
        m.face.base = T < 0.3 ? 'calm' : T < 0.62 ? 'wide' : T < 0.86 ? 'nervous' : 'strain';
        m.shiver = smoothstep(0.75, 1, m.fullness) * 0.8;
        if (m.fullness > this.nextCreak && m.bands.length > 2) {
          material.creak(m.fullness, rand(-0.2, 0.2));
          this.nextCreak = m.fullness + rand(0.04, 0.12);
          m.sway.impulse(rand(-0.6, 0.6));
        }
        break;
      }
      case 'critical': {
        m.update(dt);
        m.shiver = 1.4 + this.phaseT * 6;
        if (this.phaseT > 0.12 && this.phaseT - realDt <= 0.12) haptics.play('tick');
        if (this.phaseT > 0.28 && this.phaseT - realDt <= 0.28) {
          material.creak(1, 0.1);
          haptics.play('tick');
        }
        if (this.phaseT > 0.5) this.pop();
        break;
      }
      case 'burst': {
        this.burst.update(dt);
        this.quietFor += realDt;
        const done = (this.burst.settled && this.quietFor > 1.6) || this.quietFor > 6.5;
        if (done) {
          this.phase = 'clear';
          this.phaseT = 0;
          const c = this.burst.chunks;
          c.forEach((ch, i) => {
            material.pop(rand(0.2, 0.9), panFor(ch.x, this.w), i * 0.045);
          });
        }
        break;
      }
      case 'clear': {
        this.burst.update(dt);
        const before = this.burst.chunks.map((c) => ({ x: c.x, y: c.y, s: c.scale, r: c.radius }));
        const gone = this.burst.shrink(realDt);
        before.forEach((b, i) => {
          const now = this.burst.chunks[i];
          if (b.s > 0 && (!now || now.scale <= 0)) {
            this.particles.emit({
              kind: 'puff',
              x: b.x,
              y: b.y,
              count: 3,
              speed: [30, 90],
              size: [b.r * 0.3, b.r * 0.5],
              life: [0.3, 0.5],
              color: '#ffffff',
            });
          }
        });
        if (gone && this.phaseT > 0.4) {
          this.beginIntro();
          material.sparkle(0);
        }
        break;
      }
    }
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: this.floorY });
    ctx.save();
    this.shake.apply(ctx, w / 2, h / 2);

    const m = this.melon;
    if (this.phase === 'burst' || this.phase === 'clear') {
      this.burst.drawShadows(ctx, t);
      this.particles.draw(ctx);
      this.burst.draw(ctx, t);
    } else {
      m.draw(ctx, t);
      this.drawPending(ctx);
      this.particles.draw(ctx);
    }

    if (this.flash > 0) {
      const c = m.center();
      const r = m.R * (1.4 + (1 - this.flash) * 1.4);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, rgba('#ffffff', 0.55 * this.flash));
      g.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    paintGrain(ctx, w, h, t);
  }

  /** The band you're pulling: a stretched loop between anchor and finger. */
  private drawPending(ctx: CanvasRenderingContext2D) {
    const p = this.pending;
    if (!p) return;
    let { x0, y0, x1, y1 } = p;
    if (p.a < 1) {
      // Snapping back toward the anchor.
      const k = 1 - Math.max(0, p.a);
      x1 = lerp(x1, x0, ease.outBack(k));
      y1 = lerp(y1, y0, ease.outBack(k));
    }
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 4) return;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const th = clamp(5.5 - len * 0.008, 2.2, 5.5);
    const ry = clamp(12 - len * 0.03, 2.5, 12);
    ctx.save();
    ctx.globalAlpha = clamp(p.a, 0, 1);
    ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, len / 2 + 6, ry, 0, 0, TAU);
    ctx.strokeStyle = mix(this.nextColor, '#5a3a35', 0.28);
    ctx.lineWidth = th + 1.4;
    ctx.stroke();
    ctx.strokeStyle = mix(this.nextColor, '#ffffff', clamp(len / 600, 0.1, 0.4));
    ctx.lineWidth = th;
    ctx.stroke();
    ctx.restore();
  }
}
