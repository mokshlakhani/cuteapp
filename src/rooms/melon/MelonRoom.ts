import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { ease } from '../../design/motion';
import { clamp, lerp, rand, smoothstep, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { el, Hint } from '../../ui/components';
import { reducedMotion } from '../../render/camera';
import { getMelonScene, type MelonScene } from './MelonScene';
import { nextBandColor, strainFor, SUSPENSE_FROM } from './shape';
import { nextPopFruit } from './fruits';

type Phase = 'intro' | 'play' | 'critical' | 'burst' | 'clear';

interface Swipe {
  /** Positions along the melon the finger passed over, and its vertical span there. */
  xs: number[];
  minY: number;
  maxY: number;
  lastTick: number;
}

/** Seconds the melon strains before it gives way. */
const CRITICAL = 0.8;
/** The burst's slow motion: a long held breath, then time eases back in. */
const SLOWMO = { scale: 0.1, hold: 0.5, back: 1.0 };

/** How high a fresh melon drops from (scene units) and how hard it falls. */
const DROP_FROM = 9;
const DROP_G = 46;

/**
 * Room: fruit + rubber bands, in 3D. A fruit lies on the table — a
 * watermelon, a cantaloupe, an orange, a pomegranate, a coconut… — tap it or
 * swipe down across it to snap a band round its middle. It pinches into a
 * peanut, gets nervous, creaks… and at some unknowable point it bursts the
 * way that fruit really would — slow motion, and whatever's inside goes
 * everywhere, right there in the middle of the screen. Poke the pieces; then they pop away and
 * a different fruit drops in.
 */
export class MelonRoom implements Scene {
  readonly id = 'melon';
  readonly tint = roomTint.melon;
  readonly ui: HTMLElement;

  private s: MelonScene;
  private w = 0;
  private h = 0;
  private hint = new Hint('tap the fruit, or swipe down across it', 'hand');
  /** The fruit's name, low on the screen. */
  private tag: HTMLElement;
  /** How many bands are on, at the top. */
  private count: HTMLElement;
  private countNum: HTMLElement;
  /** Timers for the suspense: the heartbeat and the creaks, each a little uneven. */
  private beatT = 0;
  private creakT = 0;
  private phase: Phase = 'intro';
  private phaseT = 0;
  /** Scene-local time scale: slow motion lives here. */
  private timeScale = 1;
  private slowmo = 0;
  private flash = 0;
  /** Where on screen it burst (for the flash). */
  private waveAt = { x: 0, y: 0 };
  private released = false;
  private vy = 0;
  private nextColor = nextBandColor();
  private lastBandAt = 0;
  private quietFor = 0;
  private swipes = new Map<number, Swipe>();

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-melon');
    this.tag = el('div', 'pop-tag is-leaving');
    this.countNum = el('span', 'pop-count-num', {}, ['0']);
    this.count = el('div', 'pop-count', { role: 'status', 'aria-live': 'polite' }, [
      this.countNum,
      el('span', 'pop-count-label', {}, ['bands']),
    ]);
    this.ui.append(this.hint.root, this.tag, this.count);
    this.s = getMelonScene();
    this.s.events = {
      land: (b, speed, at) => {
        const pan = panFor(this.s.toScreen(at).x, this.w);
        const k = clamp(speed / 14, 0, 1);
        if (b.kind === 'shard' || b.kind === 'chunk') {
          material.plop(30 + b.size * 40, k, pan);
          if (k > 0.5) haptics.play('tap');
        } else if (b.kind === 'band') material.boop(18, k * 0.6, pan);
        else if (b.kind === 'seed' && Math.random() < 0.3) material.boop(10, k * 0.3, pan);
      },
      gone: (at, size, i) => material.pop(clamp(1 - size, 0.2, 0.9), panFor(this.s.toScreen(at).x, this.w), (i % 4) * 0.012),
    };
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    const top = safe.top + 70;
    const bottom = h - safe.bottom - 70;
    this.s.resize(w, h, window.devicePixelRatio || 1, top, bottom);
  }

  enter() {
    this.s.active = true;
    if (this.phase === 'intro' || this.phase === 'play') this.beginIntro(this.phase === 'play');
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1400);
  }

  leave() {
    this.s.active = false;
    this.hint.hide();
    this.swipes.clear();
  }

  private beginIntro(keep = false) {
    if (!keep) {
      // A different fruit each time.
      this.s.setFruit(nextPopFruit(this.s.fruit));
      this.s.resetMelon(DROP_FROM);
      this.s.shape.face.set('happy', 1.5);
    }
    this.phase = keep ? 'play' : 'intro';
    this.phaseT = 0;
    this.tag.textContent = this.s.fruit.name;
    this.tag.classList.remove('is-leaving');
    this.showCount(false);
    this.beatT = rand(0.4, 0.8);
    this.creakT = rand(2, 4);
    this.vy = 0;
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    const s = this.s;
    if (this.phase === 'burst' || this.phase === 'clear') {
      const piece = s.pickPiece(p.x, p.y);
      if (piece) {
        s.explosion.debris.poke(piece, 1);
        material.boop(30, 0.6, panFor(p.x, this.w));
        haptics.play('tap');
        this.quietFor = Math.min(this.quietFor, 1);
      }
      return;
    }
    if (this.phase !== 'play') return;
    const xn = s.pickMelon(p.x, p.y);
    if (xn !== null) {
      // Touching the melon makes it give a tiny, living wobble.
      s.shape.squash.impulse(0.9);
      s.shape.sway.impulse(xn * 1.5);
    }
    this.swipes.set(p.id, { xs: xn === null ? [] : [xn], minY: p.y, maxY: p.y, lastTick: 0 });
  }

  pointerMove(p: Pointer) {
    const sw = this.swipes.get(p.id);
    if (!sw || this.phase !== 'play') return;
    const s = this.s;
    s.shape.face.look((p.x - this.w / 2) / (this.w / 2), (p.y - this.h / 2) / (this.h / 2));
    const xn = s.pickMelon(p.x, p.y);
    if (xn === null) {
      // Off the melon: start counting again next time it's on.
      if (sw.xs.length === 0) sw.minY = sw.maxY = p.y;
      return;
    }
    sw.xs.push(xn);
    sw.minY = Math.min(sw.minY, p.y);
    sw.maxY = Math.max(sw.maxY, p.y);
    const span = sw.maxY - sw.minY;
    // Stretching a band round it: ticks that tighten as you go.
    if (span - sw.lastTick > 18) {
      sw.lastTick = span;
      haptics.play('tick');
    }
    // Swiped down (or up) across most of it: the band snaps on.
    if (span > s.screenHeight * 0.55) {
      const avg = sw.xs.reduce((a, b) => a + b, 0) / sw.xs.length;
      this.placeBand(avg, p.x);
      sw.xs = [];
      sw.minY = sw.maxY = p.y;
      sw.lastTick = 0;
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    this.swipes.delete(p.id);
    if (cancelled || this.phase !== 'play') return;
    const quick = performance.now() - p.startTime < 320;
    if (p.travel < 14 && quick) {
      const xn = this.s.pickMelon(p.x, p.y);
      if (xn !== null) this.placeBand(xn, p.x);
    }
  }

  private placeBand(xn: number, x: number) {
    if (this.phase !== 'play') return;
    const now = performance.now();
    if (now - this.lastBandAt < 90) return;
    this.lastBandAt = now;
    const s = this.s;
    s.addBand(xn, this.nextColor);
    this.nextColor = nextBandColor(this.nextColor);
    const m = s.shape;
    // Everything you see and hear follows the count, never the hidden break point.
    const n = m.bands.length;
    const t = strainFor(n);
    material.bandSnap(n, panFor(x, this.w));
    haptics.play('tap');
    m.face.set(t > 0.85 ? 'squeeze' : t > 0.45 ? 'wide' : 'happy', 0.45);
    this.showCount(true);
    if (!settings.value.seenHints.includes(this.id) && m.bands.length >= 2) {
      settings.markHintSeen(this.id);
      this.hint.hide();
    }
    if (m.ready) this.beginCritical();
  }

  /** The band count at the top: `bump` rolls the new number in. */
  private showCount(bump: boolean) {
    const n = this.s.shape.bands.length;
    this.countNum.textContent = String(n);
    this.count.classList.remove('is-up');
    if (bump && !reducedMotion) {
      void this.count.offsetWidth;
      this.count.classList.add('is-up');
    }
  }

  private beginCritical() {
    this.phase = 'critical';
    this.phaseT = 0;
    this.s.prepareBurst();
    this.s.shape.face.set('strain', 3);
    this.s.shape.swell.target = 0.05;
    material.creak(1, 0);
    haptics.play('tick');
  }

  private pop() {
    const s = this.s;
    this.phase = 'burst';
    this.phaseT = 0;
    this.quietFor = 0;
    this.slowmo = 0;
    this.timeScale = SLOWMO.scale;
    this.flash = 1;
    this.released = false;
    // It gives way at its tightest groove: the bang starts there.
    const at = s.melonPoint(s.shape.grooveX, Math.PI / 2);
    const mid = s.toScreen(s.centre);
    this.waveAt = { x: at.x, y: (at.y + mid.y) / 2 };
    s.burst();
    this.tag.classList.add('is-leaving');

    material.burst(0);
    haptics.play('burst');
  }

  // ——— simulation ———

  update(realDt: number) {
    // Slow-motion curve: a long held breath right at the pop, then time
    // rushes back in with a second kick, so the debris really flies.
    if (this.phase === 'burst' && this.timeScale < 1) {
      this.slowmo += realDt;
      const { scale, hold, back } = SLOWMO;
      this.timeScale = this.slowmo < hold ? scale : lerp(scale, 1, ease.inCubic(clamp((this.slowmo - hold) / back, 0, 1)));
      if (!this.released && this.slowmo > hold + back * 0.55) {
        this.released = true;

        haptics.play('thud');
      }
    }
    const dt = realDt * this.timeScale;
    this.phaseT += realDt;
    this.flash = Math.max(0, this.flash - realDt * 3.5);
    const s = this.s;
    const m = s.shape;

    switch (this.phase) {
      case 'intro': {
        this.vy += DROP_G * dt;
        s.lift -= this.vy * dt;
        if (s.lift <= 0) {
          s.lift = 0;
          const impact = this.vy;
          this.vy = 0;
          this.phase = 'play';
          m.squash.impulse(Math.min(14, impact * 0.5));
          material.thump(clamp(impact / 30, 0.2, 0.8), 0);
          haptics.play('thud');
          m.face.set('happy', 1.2);
        }
        break;
      }
      case 'play': {
        // Its face, its shiver and the sounds all follow the band count, so
        // past twenty-odd bands every fruit seems about to go at any moment.
        const n = m.bands.length;
        const T = m.tension;
        m.face.base = T < 0.3 ? 'calm' : T < 0.62 ? 'wide' : T < 0.86 ? 'nervous' : 'strain';
        m.shiver = n >= SUSPENSE_FROM ? 0.45 + 0.15 * Math.sin(this.phaseT * 1.3) : smoothstep(14, SUSPENSE_FROM, n) * 0.25;
        s.crack = 0;
        if (n >= SUSPENSE_FROM) {
          // A slow, soft pulse like breathing, and now and then a quiet creak.
          this.beatT -= realDt;
          if (this.beatT <= 0) {
            this.beatT = rand(1.7, 2.3);
            material.heartbeat(rand(0.75, 1), 0);
          }
          this.creakT -= realDt;
          if (this.creakT <= 0) {
            this.creakT = rand(1.6, 3.8);
            material.creak(rand(0.55, 0.85), rand(-0.2, 0.2));
            m.sway.impulse(rand(-0.6, 0.6));
          }
        } else if (n > 10) {
          this.creakT -= realDt;
          if (this.creakT <= 0) {
            this.creakT = rand(4, 7);
            material.creak(rand(0.2, 0.4), rand(-0.2, 0.2));
          }
        }
        break;
      }
      case 'critical': {
        // The last breath: the waist crushes in, the lobes swell, it trembles.
        const k = clamp(this.phaseT / CRITICAL, 0, 1);
        m.crush = 0.12 * ease.inCubic(k);
        // The rind cracks open round the split.
        s.crack = 0.25 + 0.75 * ease.outCubic(k);
        m.swell.target = 0.05 + 0.06 * k;
        m.shiver = 1.4 + this.phaseT * 7;
        if (this.phaseT > 0.15 && this.phaseT - realDt <= 0.15) haptics.play('tick');
        if (this.phaseT > 0.4 && this.phaseT - realDt <= 0.4) {
          material.creak(1, 0.1);
          haptics.play('tick');
          m.throb.impulse(0.8);
        }
        if (this.phaseT > 0.62 && this.phaseT - realDt <= 0.62) haptics.play('tick');
        // A last gulp of pressure: it puffs up just before it goes.
        if (this.phaseT > CRITICAL - 0.12) m.swell.target = 0.2;
        if (this.phaseT > CRITICAL) this.pop();
        break;
      }
      case 'burst': {
        this.quietFor += realDt;
        if ((s.explosion.settled && this.quietFor > 2.4) || this.quietFor > 8) {
          this.phase = 'clear';
          this.phaseT = 0;
          s.explosion.beginClear();
        }
        break;
      }
      case 'clear': {
        if (s.explosion.clear(realDt) && this.phaseT > 1.3) {
          s.explosion.reset();
          this.beginIntro();
          material.sparkle(0);
        }
        break;
      }
    }
    s.update(dt);
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null, spot: { x: w / 2, y: h * 0.46, r: Math.min(w, h) * 0.8 } });
    ctx.drawImage(this.s.render(), 0, 0, w, h);
    if (this.flash > 0) {
      const c = this.waveAt;
      const r = Math.min(w, h) * (0.35 + (1 - this.flash) * 0.6);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, rgba('#ffffff', 0.55 * this.flash));
      g.addColorStop(0.4, rgba('#ffffff', 0.25 * this.flash));
      g.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fill();
    }
    paintGrain(ctx, w, h, t);
  }
}
