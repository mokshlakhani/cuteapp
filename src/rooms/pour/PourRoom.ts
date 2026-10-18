import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint, world } from '../../design/tokens';
import { ease, Spring } from '../../design/motion';
import { clamp, lerp, rand, smoothstep, TAU } from '../../core/math';
import { rgba } from '../../core/color';
import { panFor } from '../../core/audio';
import { material, ui as uiSound } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop, paintGrain } from '../../render/paint';
import { Particles } from '../../render/particles';
import { reducedMotion, Shake } from '../../render/camera';
import { Face } from '../../render/face';
import { el, Hint } from '../../ui/components';
import { Glass, type Verdict } from './Glass';
import { DRINKS, type Drink } from './drinks';
import { GlassExtras } from './extras';
import { feedback, nextDrink, PourGame } from './game';
import {
  drawGlass,
  drawImpact,
  drawJug,
  drawStream,
  glassShape,
  halfAt,
  hover,
  jugShape,
  spout,
  yAt,
  type Drop,
  type GlassLook,
  type GlassShape,
  type JugShape,
} from './draw';

/**
 * One glass, start to finish: it slides in along the counter, waits, pours
 * while held, settles and is judged, shows how it went, and slides away.
 */
type Phase = 'arrive' | 'ready' | 'pouring' | 'settling' | 'result' | 'away';

/** Glass heights per second when the jug is fully tipped, on the first glass. */
const MAX_FLOW = 0.24;
/** How far the jug tips when it pours by itself (0..1). */
const POUR_TILT = 0.92;
/** Seconds for a glass to slide off, and for the next one to slide in. */
const AWAY = 0.5;
const ARRIVE = 0.6;
/** The etched line drawing itself onto a new glass (s). */
const LINE_IN = 0.45;
/** The glint running along the line on a perfect pour (s). */
const GLINT = 0.34;
/** How long the result is shown before the next glass. */
const SHOW_HIT = 1.6;
const SHOW_MISS = 2;
/** Brimming over this long while pouring, and the jug stops by itself. */
const OVERFLOW_STOP = 0.9;
/** Shown the "hold / let go" hints for this many glasses. */
const TEACH = 2;
/** The stream lands this far left of the glass's middle (× glass width), so the tipped jug stays on screen. */
const AIM = -0.12;

const PREFS = 'softspot.pour.v2';

interface Bubble {
  u: number;
  f: number;
  r: number;
  sp: number;
}

/**
 * Room: pour. A random drink each time — milk, cola, bubble tea or
 * lemonade — and a line etched on the glass. Press and hold to pour; let go
 * to stop. Land it on the line to keep your streak going; the jug pours a
 * little faster with every one in a row. Your best streak is kept.
 */
export class PourRoom implements Scene {
  readonly id = 'pour';
  readonly tint = roomTint.pour;
  readonly ui: HTMLElement;

  private w = 0;
  private h = 0;
  private floorY = 0;
  private g: GlassShape = glassShape(0, 0, 100);
  private j: JugShape = jugShape(100);
  private jx = 0;
  private jy = 0;
  private tilt = new Spring(0, { stiffness: 300, damping: 26 });

  private game: PourGame;
  private drink: Drink;
  private glass: Glass;
  private extras: GlassExtras;
  private face = new Face();
  private drops: Drop[] = [];
  private bubbles: Bubble[] = [];
  private particles = new Particles();
  private shake = new Shake();
  private puddle = { x: 0, amount: 0, color: '#ffffff' };
  private spillAcc = 0;

  private phase: Phase = 'arrive';
  private phaseT = 0;
  private brimT = 0;
  private nudge = 0;
  private glugT = 0;
  private landing = 0;
  private impactX = 0;
  private time = 0;
  private poured = 0;
  private active = false;
  /** The finger (or key) holding the pour down. */
  private holder: number | 'key' | null = null;

  // ——— the glass's little performances ———
  private lineIn = 0;
  /** Seconds since the glint started, or −1. */
  private glintT = -1;
  private lit = 0;
  private squash = new Spring(1, { stiffness: 420, damping: 13 });
  private lean = new Spring(0, { stiffness: 260, damping: 12 });
  private hopIn = -1;
  /** The reflection's own layer. */
  private mirror: HTMLCanvasElement | null = null;

  // ——— chrome ———
  private streakEl: HTMLSpanElement;
  private streakBox: HTMLDivElement;
  private bestEl: HTMLElement;
  private bestBox: HTMLSpanElement;
  private toast: HTMLDivElement;
  private toastTitle: HTMLSpanElement;
  private toastSub: HTMLSpanElement;
  private tag: HTMLDivElement;
  private hints = { pour: new Hint('press and hold to pour', 'press'), stop: new Hint('let go at the line', 'press') };

  constructor(_nav: RoomNav) {
    this.game = new PourGame(loadBest());
    this.drink = nextDrink(DRINKS, null);
    this.extras = new GlassExtras(this.drink.extra, this.game.serve(this.drink.id));
    this.glass = this.newGlass();
    this.ui = el('div', 'room room-pour');

    this.streakEl = el('span', 'pour-streak-num', {}, ['0']);
    this.streakBox = el('div', 'pour-streak', {}, [this.streakEl]);
    this.bestEl = el('b', '', {}, [String(this.game.best)]);
    this.bestBox = el('span', 'pour-best', {}, ['best ', this.bestEl]);
    const meta = el('div', 'pour-meta', {}, [
      el('span', '', {}, ['in a row']),
      el('span', 'pour-dot', { 'aria-hidden': 'true' }, ['·']),
      this.bestBox,
    ]);
    const hud = el('div', 'pour-hud', { role: 'status', 'aria-live': 'polite' }, [this.streakBox, meta]);
    this.toastTitle = el('span', 'pour-toast-title');
    this.toastSub = el('span', 'pour-toast-sub');
    this.toast = el('div', 'pour-toast', { 'aria-live': 'polite' }, [this.toastTitle, this.toastSub]);
    this.tag = el('div', 'pour-tag', {}, [this.drink.name]);
    this.ui.append(hud, this.toast, this.tag, this.hints.pour.root, this.hints.stop.root);
  }

  private newGlass() {
    const g = new Glass(this.drink.foamy, Math.round(rand(...this.drink.lines) * 100) / 100);
    g.events = {
      spill: (amount, foam) => this.onSpill(amount, foam),
      verdict: (v) => this.phase === 'settling' && this.judge(v),
    };
    const extras = this.extras;
    g.solidAt = (f) => extras.solidAt(f);
    return g;
  }

  // ——— layout ———

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    // The counter sits about four fifths of the way down, leaving the
    // bottom for the drink's name and a hint.
    this.floorY = h - safe.bottom - Math.max(118, h * 0.16);
    const usable = this.floorY - safe.top;
    // As big as the screen allows, while the tipped jug still fits to the right.
    const gW = clamp(Math.min(w * 0.44, (w / 2 - 12) / 1.07, usable * 0.3), 100, 200);
    this.g = glassShape(w / 2, this.floorY, gW);
    this.fitPourer();
    this.particles.width = w;
    this.particles.floorY = this.floorY;
    this.puddle.x = this.g.cx;
    this.tag.style.top = `${Math.round(this.floorY + 16)}px`;
  }

  /** The jug, bottle or carton for this drink, held where a steady pour lands just left of the glass's middle. */
  private fitPourer() {
    const gW = this.g.wb / 0.4;
    this.j = jugShape(gW, this.drink.from);
    // High enough that upright or tipped, it clears the rim.
    this.jy = yAt(this.g, 1) - hover(this.j);
    // Each throws its stream a different way: line them up so they all land where the jug's does.
    const drift = (j: JugShape, jy: number) => {
      const lip = spout(j, 0, jy, POUR_TILT);
      const speed = lerp(50, 150, smoothstep(0.32, 1, POUR_TILT));
      let { x, y } = lip;
      let vx = lip.dx * speed;
      let vy = lip.dy * speed;
      const surface = yAt(this.g, 0.55);
      for (let i = 0; i < 600 && y < surface; i++) {
        vy += world.gravity / 120;
        x += vx / 120;
        y += vy / 120;
      }
      return x;
    };
    const jug = jugShape(gW);
    const offset = drift(this.j, this.jy) - drift(jug, yAt(this.g, 1) - hover(jug));
    this.jx = this.g.cx + gW * AIM - spout(jug, 0, 0, POUR_TILT).x - offset;
  }

  enter() {
    this.active = true;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    this.syncHints();
  }

  leave() {
    this.active = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.holder = null;
    for (const hint of Object.values(this.hints)) hint.hide();
    if (this.phase === 'pouring') this.stop();
  }

  // ——— input ———

  /**
   * Hold Space or Enter to pour too, unless a button has the focus. While a
   * finger is holding, the keyboard leaves it alone (and the other way round).
   */
  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
    if (e.target instanceof HTMLElement && e.target.closest('button')) return;
    e.preventDefault();
    if (e.type === 'keydown') this.press('key');
    else this.release('key');
  };

  pointerDown(p: Pointer) {
    this.press(p.id);
  }

  pointerMove(_p: Pointer) {}

  pointerUp(p: Pointer, _cancelled: boolean) {
    this.release(p.id);
  }

  /** Holding on: the jug pours for as long as it's held. */
  private press(who: number | 'key') {
    if (!this.active || this.holder !== null || this.phase !== 'ready') return;
    this.holder = who;
    this.start();
  }

  /** Let go: it stops. Only the finger (or key) that started it can stop it. */
  private release(who: number | 'key') {
    if (this.holder !== who) return;
    this.holder = null;
    if (this.phase === 'pouring') this.stop();
  }

  private start() {
    this.setPhase('pouring');
    this.tilt.target = POUR_TILT;
    this.brimT = 0;
    haptics.play('tap');
    this.face.set('wide', 0.6);
    this.syncHints();
  }

  private stop() {
    this.setPhase('settling');
    this.tilt.target = 0;
    haptics.play('tick');
    this.poured++;
    this.syncHints();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseT = 0;
  }

  /** Teach hold and let-go on the first glasses, then get out of the way. */
  private syncHints() {
    const teach = this.active && this.poured < TEACH && !settings.value.seenHints.includes('pour-hold');
    if (teach && this.phase === 'ready') this.hints.pour.show(450);
    else this.hints.pour.hide();
    if (teach && this.phase === 'pouring') this.hints.stop.show(150);
    else this.hints.stop.hide();
    if (this.poured >= TEACH) settings.markHintSeen('pour-hold');
  }

  // ——— the glass talking back ———

  private onSpill(amount: number, foam: boolean) {
    const g = this.shape;
    const d = this.drink;
    this.spillAcc += amount;
    // Froth is mostly air: it leaves much less of a puddle than the drink.
    this.puddle.amount += foam ? amount * 0.2 : amount;
    this.puddle.color = d.color;
    this.puddle.x = lerp(this.puddle.x, g.cx, 0.2);
    while (this.spillAcc > 0.004) {
      this.spillAcc -= 0.004;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.emit({
        kind: 'drop',
        x: g.cx + side * (g.wt + g.wall) * rand(0.7, 1),
        y: yAt(g, 1) - 1,
        vx: side * rand(15, 60),
        vy: rand(-30, 30),
        speed: [0, 10],
        size: [2.2, 4],
        life: [1, 1.6],
        color: foam ? d.foam : d.color,
      });
    }
    this.face.set('wide', 0.7);
    if (Math.random() < 0.25) material.splat(0.4, panFor(g.cx, this.w));
  }

  /** The pour has settled: score it, and show how it went. */
  private judge(v: Verdict) {
    const pan = panFor(this.g.cx, this.w);
    const newBest = this.game.record(v);
    const [title, sub] = feedback(v, this.glass.level, this.glass.line, this.game.streak);
    this.showToast(title, newBest && this.game.best > 1 ? 'new best' : sub);
    this.syncScore(v === 'perfect', newBest);
    this.setPhase('result');
    if (v === 'perfect') {
      // The ting: a glint runs along the line and leaves it lit, the glass
      // hops, and the streak rolls up.
      material.pourPerfect(pan);
      if (newBest && this.game.best > 1) material.sparkle(pan);
      if (this.game.streak > 0 && this.game.streak % 5 === 0) material.tada();
      haptics.play('soft');
      this.glintT = 0;
      this.hopIn = 0.08;
      this.face.set('happy', SHOW_HIT + 0.5);
    } else {
      material.pourMiss(pan);
      haptics.play('tap');
      this.nudge = 1;
      this.face.set(v === 'spilled' ? 'dizzy' : v === 'over' ? 'nervous' : 'wide', SHOW_MISS);
    }
  }

  private showToast(title: string, sub: string) {
    this.toastTitle.textContent = title;
    this.toastSub.textContent = sub;
    this.toast.classList.add('is-shown');
  }

  private syncScore(hit: boolean, newBest: boolean) {
    this.streakEl.textContent = String(this.game.streak);
    this.bestEl.textContent = String(this.game.best);
    // Restart the roll (or the gentle drop back to zero).
    for (const c of ['is-up', 'is-reset']) this.streakBox.classList.remove(c);
    void this.streakBox.offsetWidth;
    this.streakBox.classList.add(hit ? 'is-up' : 'is-reset');
    this.bestBox.classList.toggle('is-new', newBest);
    if (newBest) saveBest(this.game.best);
  }

  // ——— simulation ———

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.particles.update(dt);
    this.shake.update(dt);
    this.tilt.update(dt);
    this.face.update(dt);
    this.puddle.amount *= Math.exp(-0.12 * dt);

    this.advance(dt);
    this.animate(dt);
    this.pour(dt);
    this.glass.step(dt);
    this.extras.update(dt, this.landing);
    this.updateBubbles(dt);
    this.react();
  }

  private advance(dt: number) {
    switch (this.phase) {
      case 'arrive':
        if (this.phaseT >= ARRIVE) {
          this.setPhase('ready');
          material.clink(panFor(this.g.cx, this.w));
          haptics.play('tick');
          this.glass.slosh(0.8);
          this.face.set('happy', 0.8);
          this.syncHints();
        }
        break;
      case 'pouring':
        // Brimming over for a while: the jug gives up by itself.
        this.brimT = this.glass.top >= 0.995 ? this.brimT + dt : 0;
        if (this.brimT > OVERFLOW_STOP) this.stop();
        break;
      case 'settling':
        // Stopped before anything really got in: that's short, too.
        if (this.phaseT > 1.2 && this.glass.level <= 0.04 && !this.drops.length) this.judge('under');
        break;
      case 'result':
        if (this.phaseT >= (this.glass.verdict === 'perfect' ? SHOW_HIT : SHOW_MISS)) {
          this.toast.classList.remove('is-shown');
          this.tag.classList.add('is-leaving');
          this.setPhase('away');
          this.glass.slosh(-1.4);
          uiSound.whoosh(true);
        }
        break;
      case 'away':
        if (this.phaseT >= AWAY) {
          this.drink = nextDrink(DRINKS, this.drink);
          this.fitPourer();
          this.extras = new GlassExtras(this.drink.extra, this.game.serve(this.drink.id));
          this.glass = this.newGlass();
          this.bubbles.length = 0;
          this.drops.length = 0;
          this.nudge = 0;
          this.lit = 0;
          this.lineIn = 0;
          this.glintT = -1;
          this.face.set('calm', 0.1);
          this.tag.textContent = this.drink.name;
          this.tag.classList.remove('is-leaving');
          this.setPhase('arrive');
        }
        break;
      default:
        break;
    }
  }

  /** The glass's performances: the line drawing in, the glint, the hop and the lean. */
  private animate(dt: number) {
    if (this.phase !== 'arrive' && this.phase !== 'away') this.lineIn = Math.min(1, this.lineIn + dt / LINE_IN);
    if (this.glintT >= 0) {
      this.glintT += dt;
      this.lit = Math.min(1, this.lit + dt * 6);
    }
    if (this.hopIn >= 0) {
      this.hopIn -= dt;
      if (this.hopIn < 0 && !reducedMotion) {
        this.squash.value = 0.93;
        this.squash.velocity = 0;
        this.glass.slosh(1.2);
      }
    }
    this.squash.update(dt);
    // Slid along the counter, a glass leans: its top lags as it sets off, and
    // runs on as it stops.
    let lean = 0;
    if (!reducedMotion) {
      if (this.phase === 'away') lean = -0.075 * smoothstep(0, 0.4, this.phaseT / AWAY);
      else if (this.phase === 'arrive') lean = 0.07 * (1 - clamp(this.phaseT / ARRIVE, 0, 1));
    }
    this.lean.target = lean;
    this.lean.update(dt);
    this.nudge = Math.max(0, this.nudge - dt * 0.6);
  }

  /** The glass as it stands right now, slid along if it's coming or going. */
  private get shape(): GlassShape {
    let off = 0;
    if (this.phase === 'away') off = ease.inCubic(clamp(this.phaseT / AWAY, 0, 1)) * (this.w - this.g.cx + this.g.wt * 3);
    else if (this.phase === 'arrive') off = -(1 - ease.outCubic(clamp(this.phaseT / ARRIVE, 0, 1))) * (this.g.cx + this.g.wt * 3);
    return off ? { ...this.g, cx: this.g.cx + off } : this.g;
  }

  /** Where the jug is held: it lifts away to refill between glasses, and breathes while it waits. */
  private get jug() {
    let lift = 0;
    if (this.phase === 'away') lift = ease.inOutCubic(clamp(this.phaseT / AWAY, 0, 1));
    else if (this.phase === 'arrive') lift = 1 - ease.outBack(clamp(this.phaseT / ARRIVE, 0, 1), 1.2);
    const rest = 1 - clamp(this.tilt.value / 0.3, 0, 1);
    const bob = reducedMotion ? 0 : Math.sin(this.time * 2.1) * 1.6 * rest;
    return {
      x: this.jx,
      y: this.jy - lift * this.j.H * 0.75 + bob,
      alpha: 1 - clamp(lift, 0, 1),
      tilt: clamp(this.tilt.value, 0, 1) + (reducedMotion ? 0 : Math.sin(this.time * 1.6) * 0.008 * rest),
    };
  }

  /** The jug tips and the drink leaves it; follow every drop to where it lands. */
  private pour(dt: number) {
    const tilt = clamp(this.tilt.value, 0, 1);
    const flow = smoothstep(0.32, 1, tilt);
    if (flow > 0.01) {
      const jug = this.jug;
      const lip = spout(this.j, jug.x, jug.y, tilt);
      const n = Math.max(1, Math.ceil(dt * 150));
      const speed = lerp(50, 150, flow);
      for (let i = 0; i < n; i++) {
        const k = i / n;
        this.drops.push({
          x: lip.x + lip.dx * speed * dt * k,
          y: lip.y + lip.dy * speed * dt * k,
          vx: lip.dx * speed,
          vy: lip.dy * speed,
          vol: (MAX_FLOW * this.game.speed * flow * dt) / n,
          w: lerp(3, 10, flow) * clamp(this.g.wt / 70, 0.8, 1.3),
          alive: true,
        });
      }
    }

    const g = this.shape;
    const open = this.phase !== 'away' && this.phase !== 'arrive';
    let landed = 0;
    const gravity = world.gravity;
    for (const d of this.drops) {
      if (!d.alive) continue;
      const py = d.y;
      d.vy += gravity * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const speed = Math.hypot(d.vx, d.vy);
      const top = this.glass.top;
      const rimY = yAt(g, 1);
      const half = halfAt(g, top);
      const surfY = yAt(g, top);
      const dx = d.x - g.cx;
      // Into the glass.
      if (open && Math.abs(dx) < half && d.y >= surfY && py <= surfY + 30) {
        this.glass.add(d.vol, (dx + half) / (half * 2), speed);
        d.alive = false;
        landed += d.vol;
        this.impactX = d.x;
        continue;
      }
      // Off the rim: a little splash outward.
      if (py < rimY && d.y >= rimY && Math.abs(dx) >= g.wt && Math.abs(dx) < g.wt + g.wall + 3) {
        d.alive = false;
        this.splash(d, Math.sign(dx) || 1);
        continue;
      }
      // On the table.
      if (d.y >= this.floorY) {
        d.alive = false;
        this.puddle.amount += d.vol;
        this.puddle.color = this.drink.color;
        this.puddle.x = lerp(this.puddle.x, d.x, 0.05);
        material.splat(clamp(d.vol * 80, 0.2, 1), panFor(d.x, this.w));
      }
    }
    while (this.drops.length && !this.drops[0].alive) this.drops.shift();
    if (this.drops.length > 600) this.drops.splice(0, this.drops.length - 600);

    // Glugs as it lands, quicker the harder it pours, higher as it fills.
    this.landing = lerp(this.landing, landed > 0 ? flow || 0.4 : 0, Math.min(1, dt * 12));
    this.glugT -= dt;
    if (landed > 0 && this.glugT <= 0) {
      this.glugT = lerp(0.2, 0.085, flow) * rand(0.8, 1.2);
      material.glug(this.glass.top, flow, panFor(g.cx, this.w));
      haptics.play('tick');
    }
  }

  private splash(d: Drop, side: number) {
    this.particles.emit({
      kind: 'drop',
      x: d.x,
      y: d.y,
      count: 2,
      angle: side > 0 ? -0.6 : -Math.PI + 0.6,
      spread: 0.9,
      speed: [60, 140],
      size: [1.8, 3.2],
      life: [0.8, 1.2],
      color: this.drink.color,
    });
  }

  /** Soda: bubbles stream up through it, and you can hear it fizz. */
  private updateBubbles(dt: number) {
    const glass = this.glass;
    if (this.drink.fizz && glass.level > 0.03) {
      const rate = 3 + glass.foam * 50 + this.landing * 25;
      if (Math.random() < rate * dt) this.bubbles.push({ u: rand(0.12, 0.88), f: rand(0, 0.15), r: rand(0.9, 2.2), sp: rand(0.18, 0.4) });
      if (glass.foam > 0.02 || Math.random() < dt * 4) material.fizz(clamp(glass.foam * 5 + 0.15, 0, 1), panFor(this.g.cx, this.w));
    }
    for (const b of this.bubbles) {
      b.f += b.sp * dt;
      b.u += Math.sin(this.time * 5 + b.r * 9) * 0.02 * dt;
    }
    this.bubbles = this.bubbles.filter((b) => b.f < glass.level - 0.01);
  }

  /** The glass watches the spout, and gets more excited the nearer the line. */
  private react() {
    const g = this.shape;
    const glass = this.glass;
    const jug = this.jug;
    const lip = spout(this.j, jug.x, jug.y, jug.tilt);
    const fy = yAt(g, 0.3);
    this.face.look((lip.x - g.cx) / (g.wt * 4), (lip.y - fy) / (g.wt * 4));
    if (this.phase === 'pouring' && this.landing > 0.2) {
      const d = glass.top - glass.line;
      if (glass.top > 0.92) this.face.set('strain', 0.25);
      else if (d > 0.02) this.face.set('nervous', 0.25);
      else if (d > -0.12) this.face.set('wide', 0.25);
      else this.face.set('happy', 0.25);
    }
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: this.floorY });
    this.paintLamp(ctx);
    ctx.save();
    this.shake.apply(ctx, w / 2, h / 2);

    const g = this.shape;
    const look: GlassLook = {
      face: this.face,
      time: this.time,
      lineIn: ease.outCubic(this.lineIn),
      glint: this.glintT < 0 ? 0 : ease.inOutSine(clamp(this.glintT / GLINT, 0, 1)),
      lit: this.lit,
      nudge: this.nudge,
      squash: this.squash.value,
      lean: this.lean.value,
      faceAt: this.drink.extra ? Math.max(0.46, this.extras.top + 0.08) : 0.3,
      inside: this.bubbles.length ? (c) => this.drawBubbles(c, g) : undefined,
      extras: this.extras.kind ? (c) => this.extras.draw(c, g, this.glass, this.time) : undefined,
    };

    this.drawReflection(ctx, g, look);

    // Whatever missed, pooled on the counter.
    if (this.puddle.amount > 0.003) {
      const rx = Math.min(this.g.wt * 2.2, Math.sqrt(this.puddle.amount) * this.g.wt * 2.6);
      ctx.fillStyle = rgba(this.puddle.color, clamp(this.puddle.amount * 6, 0, 0.55));
      ctx.beginPath();
      ctx.ellipse(this.puddle.x, this.floorY + 4, rx, Math.max(2, rx * 0.16), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba('#ffffff', clamp(this.puddle.amount * 4, 0, 0.35));
      ctx.beginPath();
      ctx.ellipse(this.puddle.x - rx * 0.3, this.floorY + 3, rx * 0.35, Math.max(1, rx * 0.04), 0, 0, TAU);
      ctx.fill();
    }

    drawGlass(ctx, t, g, this.glass, this.drink, look);
    this.extras.drawRim(ctx, g);
    drawImpact(ctx, g, this.glass, this.impactX, this.landing, this.time, this.drink);
    drawStream(ctx, this.drops, this.drink);
    const jug = this.jug;
    drawJug(ctx, t, this.j, jug.x, jug.y, jug.tilt, this.drink, jug.alpha);
    this.particles.draw(ctx);
    ctx.restore();
    paintGrain(ctx, w, h, t);
  }

  /**
   * The lamp over the counter: a soft pool of light behind the glass and on
   * the counter under it, so the eye lands on the glass first.
   */
  private paintLamp(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const day = t.light;
    const { w } = this;
    const g = this.g;
    const cy = this.floorY - g.H * 0.75;
    const r = g.H * 2;
    const wall = ctx.createRadialGradient(g.cx, cy, 0, g.cx, cy, r);
    wall.addColorStop(0, rgba('#ffffff', day ? 0.2 : 0.075));
    wall.addColorStop(0.55, rgba('#ffffff', day ? 0.06 : 0.025));
    wall.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, this.floorY);
    ctx.save();
    ctx.translate(g.cx, this.floorY + g.wt * 0.35);
    ctx.scale(1, 0.2);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, g.wt * 3.4);
    pool.addColorStop(0, rgba('#ffffff', day ? 0.22 : 0.07));
    pool.addColorStop(1, rgba('#ffffff', 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, g.wt * 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** A soft reflection of the glass in the counter, fading away from it. */
  private drawReflection(ctx: CanvasRenderingContext2D, g: GlassShape, look: GlassLook) {
    const t = theme.current;
    const fy = this.floorY;
    const depth = Math.min(this.h - fy, g.H * 0.5);
    if (depth < 4) return;
    // Drawn on its own layer, so it can fade out with a real alpha mask.
    const dpr = Math.max(1, Math.min(3, ctx.getTransform().a));
    const cw = Math.ceil(this.w * dpr);
    const ch = Math.ceil(depth * dpr);
    const layer = (this.mirror ??= document.createElement('canvas'));
    if (layer.width !== cw || layer.height !== ch) {
      layer.width = cw;
      layer.height = ch;
    }
    const m = layer.getContext('2d')!;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, cw, ch);
    m.setTransform(dpr, 0, 0, -dpr, 0, fy * dpr);
    drawGlass(m, t, g, this.glass, this.drink, { ...look, reflection: true, inside: undefined });
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'destination-in';
    const fade = m.createLinearGradient(0, 0, 0, ch);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fade;
    m.fillRect(0, 0, cw, ch);
    m.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalAlpha = t.light ? 0.12 : 0.15;
    ctx.drawImage(layer, 0, fy, this.w, depth);
    ctx.restore();
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, g: GlassShape) {
    ctx.fillStyle = rgba('#ffffff', 0.55);
    for (const b of this.bubbles) {
      const half = halfAt(g, b.f);
      ctx.beginPath();
      ctx.arc(g.cx - half + b.u * half * 2, yAt(g, b.f), b.r, 0, TAU);
      ctx.fill();
    }
  }
}

function loadBest(): number {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}');
    return Number.isFinite(p.best) && p.best > 0 ? Math.floor(p.best) : 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ best }));
  } catch {
    /* private mode */
  }
}
