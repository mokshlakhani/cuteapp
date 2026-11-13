import type { RoomNav, Scene } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { ease } from '../../design/motion';
import { clamp } from '../../core/math';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop } from '../../render/paint';
import { reducedMotion } from '../../render/camera';
import { el, Hint } from '../../ui/components';
import { OrderToast, Rising, Twinkle } from '../../ui/order';
import { SLICE_FRUITS, type SliceFruit } from '../slice/fruits';
import { getPeelScene, type PeelScene } from './PeelScene';
import { angleDelta, METER_TOP, orderFor, paceFor, Peeler, verdict, type Order } from './game';

type Phase = 'intro' | 'play' | 'done' | 'result' | 'clear';

/** Dragon fruit stays out: its scales are real leaves, and there's no peeling those. */
const FRUITS = SLICE_FRUITS.filter((f) => f.id !== 'dragonfruit');
const INTRO = { lift: 9, time: 1.1 };
/** Room under the board (px): the name (22), the meter (44) and the hint (40) over the bottom edge, with air between. */
const BELOW = 146;
/** Too near the fruit's middle, a finger's angle jumps about: it doesn't count. */
const DEAD = 28;
/** How far the first stroke must go before the way round is decided. */
const DECIDE = 0.1;
/** A single step further round than this is a swipe across the fruit, not a circle. */
const LEAP = 1.6;
/** How quickly the fruit catches up with the finger: taken out of touch's unevenness. */
const FOLLOW = 26;
/** A soft scrape, and a tick, every so far round. */
const SCRAPE = 0.55;
const TICK = 0.9;

/**
 * Room: peel. A fruit floats over a board with a little knife against it and
 * a ring round it. Circle your finger round the ring, either way, and the
 * fruit turns with you, a little more than you do, and the skin comes away in one
 * long curling strip. A pace meter under the fruit shows a green zone on a
 * red track and a bead for your pace: the green wanders and narrows as you
 * go, and too long in the red — too fast or too slow — snaps the strip, and
 * a new one starts where it stopped. Thinner strips want a gentler pace. The
 * fruit always comes clean; the fewer strips it took, the better.
 */
export class PeelRoom implements Scene {
  readonly id = 'peel';
  readonly tint = roomTint.peel;
  readonly ui: HTMLElement;
  readonly view: HTMLCanvasElement;
  live = false;

  private s: PeelScene;
  private w = 0;
  private h = 0;
  private hint = new Hint('circle round the fruit · keep the bead in the green', 'turn');
  private phase: Phase = 'intro';
  private phaseT = 0;
  private order: Order;
  private recent: Order[] = [];
  private peeler: Peeler;
  private fruit: SliceFruit | null = null;
  private finger: number | null = null;
  /** The finger's last angle round the fruit (null while it's too near the middle). */
  private angle: number | null = null;
  /** Which way round this fruit goes (0 until the first stroke decides), and how far it's gone undecided. */
  private dir = 0;
  private lean = 0;
  /** Turned by the finger, not yet taken up by the fruit. */
  private turned = 0;
  private scraped = 0;
  private ticked = 0;
  private started = false;
  private painted = false;
  private paintedTheme: unknown = null;

  private toast = new OrderToast();
  private plus = new Rising();
  private twinkle = new Twinkle();
  private tag = el('div', 'order-tag');
  private tagName = el('span', 'order-tag-name');
  private ring: SVGSVGElement;
  private arc: SVGCircleElement;
  private arcShown = -1;
  /** The pace meter: a red track, the green zone on it, and a bead for your pace. */
  private meter = el('div', 'peel-meter', { 'aria-hidden': 'true' });
  private green = el('div', 'peel-meter-green');
  private bead = el('div', 'peel-meter-bead');
  private meterShown = { lo: -1, hi: -1, at: -1, strain: -1, red: false };

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-peel');
    this.order = orderFor();
    this.peeler = new Peeler(this.order);
    this.tag.append(this.tagName);
    const NS = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(NS, 'svg');
    this.ring.setAttribute('class', 'peel-ring');
    this.ring.setAttribute('aria-hidden', 'true');
    this.ring.setAttribute('viewBox', '0 0 100 100');
    const track = document.createElementNS(NS, 'circle');
    track.setAttribute('class', 'peel-track');
    this.arc = document.createElementNS(NS, 'circle');
    this.arc.setAttribute('class', 'peel-arc');
    this.arc.setAttribute('pathLength', '1');
    for (const c of [track, this.arc]) {
      c.setAttribute('cx', '50');
      c.setAttribute('cy', '50');
      c.setAttribute('r', '48');
    }
    this.ring.append(track, this.arc);
    const meterTrack = el('div', 'peel-meter-track', {}, [this.green]);
    const ends = el('div', 'peel-meter-ends', {}, [el('span', '', {}, ['too slow']), el('span', '', {}, ['too fast'])]);
    this.meter.append(meterTrack, this.bead, ends);
    this.ui.append(this.ring, this.meter, this.toast.root, this.plus.root, this.twinkle.root, this.tag, this.hint.root);
    this.s = getPeelScene();
    this.view = this.s.canvas;
    this.s.setFruit(FRUITS[0], this.order.turns, INTRO.lift);
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    let top = safe.top + 112;
    let bottom = h - safe.bottom - 64;
    const dpr = window.devicePixelRatio || 1;
    this.s.resize(w, h, dpr, top, bottom);
    // Under the board, from the top down: the fruit's name, the pace meter,
    // then the hint at the very bottom. Each needs its own room, so on a short
    // screen the fruit and board move up and shrink a little to leave it; and
    // the ring round the fruit stays under the words at the top.
    // (On the narrowest phones the hint runs to two lines.)
    const room = h - safe.bottom - BELOW - (w < 360 ? 20 : 0);
    for (let i = 0; i < 2; i++) {
      const f = this.s.screenFruit;
      const ring = Math.min(f.r * 1.45, w / 2 - 14);
      const over = safe.top + 134 - (f.y - ring);
      const under = this.s.boardFront.y + 18 - room;
      if (over <= 1 && under <= 1) break;
      top += Math.max(0, over);
      bottom -= Math.max(0, under);
      if (bottom - top < 160) break;
      this.s.resize(w, h, dpr, top, bottom);
    }
    this.placeRing();
    const tagY = Math.round(Math.min(this.s.boardFront.y + 18, room));
    this.tag.style.top = `${tagY}px`;
    this.meter.style.top = `${tagY + 30}px`;
    this.painted = false;
  }

  /** The ring sits round the fruit, whichever fruit it is. */
  private placeRing() {
    const f = this.s.screenFruit;
    const r = Math.min(f.r * 1.45, this.w / 2 - 14);
    const d = Math.round(r * 2);
    this.ring.style.width = this.ring.style.height = `${d}px`;
    this.ring.style.transform = `translate(${Math.round(f.x - r)}px, ${Math.round(f.y - r)}px)`;
  }

  enter() {
    if (!this.started) this.beginOrder();
    this.started = true;
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1500);
    this.painted = false;
  }

  leave() {
    this.hint.hide();
    this.meter.classList.remove('is-red');
    this.meterShown.red = false;
    this.finger = null;
    this.turned = 0;
    this.s.tight = 0;
  }

  // ——— the order ———

  private beginOrder() {
    this.order = orderFor(Math.random, this.recent);
    this.recent = [...this.recent.slice(-3), this.order];
    this.peeler = new Peeler(this.order);
    this.dir = this.lean = 0;
    const pool = FRUITS.filter((f) => f !== this.fruit);
    this.fruit = pool[Math.floor(Math.random() * pool.length) % pool.length];
    this.s.setFruit(this.fruit, this.order.turns, INTRO.lift);
    this.placeRing();
    this.s.face.base = 'calm';
    this.s.face.set('happy', 1.4);
    this.phase = 'intro';
    this.phaseT = 0;
    this.scraped = this.ticked = this.turned = 0;
    this.tagName.textContent = this.fruit.name;
    this.tag.classList.remove('is-leaving');
    this.ring.classList.remove('is-tight', 'is-done', 'is-back');
    this.ring.classList.add('is-shown');
    this.showArc(0);
    this.showMeter();
  }

  /** Move the green zone and the bead to where they are now; only touches the page when they've moved. */
  private showMeter() {
    const p = this.peeler;
    const top = paceFor(this.order.turns) * METER_TOP;
    const pct = (v: number) => Math.round(clamp(v / top, 0, 1) * 1000) / 10;
    const { lo, hi } = p.window;
    const m = this.meterShown;
    const a = pct(lo);
    const b = pct(hi);
    if (a !== m.lo || b !== m.hi) {
      m.lo = a;
      m.hi = b;
      this.green.style.left = `${a}%`;
      this.green.style.width = `${b - a}%`;
    }
    const at = pct(p.pace);
    if (at !== m.at) {
      m.at = at;
      this.bead.style.left = `${at}%`;
    }
    const strain = Math.round(p.tension * 20) / 20;
    if (strain !== m.strain) {
      m.strain = strain;
      this.meter.style.setProperty('--strain', String(strain));
    }
    // Red only once it counts: not in the first moment, nor while the finger's off.
    const red = p.zone !== 'good' && p.counting;
    if (red !== m.red) {
      m.red = red;
      this.meter.classList.toggle('is-red', red);
    }
  }

  private showArc(s: number) {
    const k = Math.round(s * 300) / 300;
    if (k === this.arcShown) return;
    this.arcShown = k;
    this.arc.style.strokeDasharray = `${k} 1`;
  }

  // ——— input ———

  private angleOf(p: Pointer) {
    const f = this.s.screenFruit;
    const dx = p.x - f.x;
    const dy = p.y - f.y;
    return Math.hypot(dx, dy) < DEAD ? null : Math.atan2(dy, dx);
  }

  pointerDown(p: Pointer) {
    if (this.phase === 'result' && this.phaseT > 0.9) this.beginClear();
    // Any time at all: a finger already down takes up the next fruit when it's ready.
    if (this.finger !== null) return;
    this.finger = p.id;
    this.angle = this.angleOf(p);
  }

  pointerMove(p: Pointer) {
    if (p.id !== this.finger) return;
    const a = this.angleOf(p);
    const last = this.angle;
    this.angle = a;
    if (a === null || last === null || this.phase !== 'play') return;
    const d = angleDelta(a, last);
    if (Math.abs(d) > LEAP) return;
    // The first stroke picks the way round; after that, backing up does nothing.
    if (this.dir === 0) {
      this.lean += d;
      if (Math.abs(this.lean) < DECIDE) return;
      this.dir = Math.sign(this.lean);
      // Clockwise on screen (y runs down) turns the fruit clockwise from above.
      this.s.setSpin(-this.dir);
      this.ring.classList.toggle('is-back', this.dir < 0);
    }
    if (d * this.dir > 0) this.turned += Math.abs(d);
  }

  pointerUp(p: Pointer) {
    if (p.id === this.finger) this.finger = null;
  }

  // ——— simulation ———

  update(dt: number) {
    this.phaseT += dt;
    const s = this.s;
    switch (this.phase) {
      case 'intro': {
        const k = clamp(this.phaseT / INTRO.time, 0, 1);
        s.lift = INTRO.lift * (1 - ease.outCubic(k));
        s.rest = 1 - ease.outCubic(k);
        if (k >= 1) {
          s.lift = 0;
          s.rest = 0;
          s.squash.impulse(4);
          material.boop(30, 0.5, 0);
          haptics.play('soft');
          this.phase = 'play';
          this.phaseT = 0;
          const wide = this.order.turns <= 3 ? 'a wide strip' : this.order.turns >= 6 ? 'a very thin strip' : 'a thin strip';
          if (this.peeler.s === 0) this.toast.show('one long, slow peel', `${wide} · stay in the green`);
          this.meter.classList.add('is-shown');
        }
        break;
      }
      case 'play':
        this.stepPeel(dt);
        break;
      case 'done':
        s.faceForward(dt);
        s.rest = clamp(this.phaseT / 0.5, 0, 1);
        if (this.phaseT > 1.3) this.showResult();
        break;
      case 'result':
        s.faceForward(dt);
        if (this.phaseT > 3.4) this.beginClear();
        break;
      case 'clear': {
        const k = clamp(this.phaseT / 0.7, 0, 1);
        s.lift = INTRO.lift * ease.inCubic(k);
        if (k >= 1 && s.cleared) this.beginOrder();
        break;
      }
    }
    s.update(dt);
  }

  private stepPeel(dt: number) {
    const { s, peeler } = this;
    // The fruit follows smoothly, so uneven touches still make an even turn.
    const turned = this.turned * (1 - Math.exp(-dt * FOLLOW));
    this.turned -= turned;
    const res = peeler.step(turned, dt, this.finger !== null);
    this.showMeter();
    s.setProgress(peeler.s);
    s.tight = reducedMotion ? 0 : peeler.tension;
    this.showArc(peeler.s);
    this.ring.classList.toggle('is-tight', peeler.tension > 0.2);
    if (turned > 0.0005) {
      this.toast.hide();
      this.hint.hide();
      s.flick(turned);
      this.scraped += turned;
      this.ticked += turned;
      if (this.scraped > SCRAPE) {
        this.scraped = 0;
        material.peelScrape(clamp(peeler.pace / peeler.limit, 0, 1.4), 0.3);
      }
      if (this.ticked > TICK) {
        this.ticked = 0;
        haptics.play('tick');
      }
    }
    if (peeler.tension > 0.55) s.face.set('strain', 0.2);
    else if (peeler.tension > 0.2) s.face.set('nervous', 0.2);
    if (res === 'tore') {
      s.tear();
      s.face.set('surprised', 0.9);
      material.peelSnap(0.3);
      haptics.play('snap');
      this.plus.show('snap!', s.cutAt);
      this.ring.classList.remove('is-tight');
    } else if (res === 'done') {
      s.finish();
      s.squash.impulse(-3);
      s.face.set('happy', 3);
      material.sparkle(0);
      haptics.play('soft');
      settings.markHintSeen(this.id);
      this.ring.classList.add('is-done');
      this.meter.classList.remove('is-shown', 'is-red');
      this.meterShown.red = false;
      this.turned = 0;
      this.phase = 'done';
      this.phaseT = 0;
    }
  }

  private showResult() {
    this.toast.show(...verdict(this.peeler.breaks));
    // One long strip: a little fanfare.
    if (this.peeler.breaks === 0) {
      material.tada();
      const f = this.s.screenFruit;
      this.twinkle.burst(f, f.r * 1.5);
    }
    this.ring.classList.remove('is-shown');
    this.phase = 'result';
    this.phaseT = 0;
  }

  private beginClear() {
    this.phase = 'clear';
    this.phaseT = 0;
    this.toast.hide();
    this.tag.classList.add('is-leaving');
    this.s.clearStrips();
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    if (!this.live || !this.painted || theme.current !== this.paintedTheme) {
      paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null, spot: { x: w / 2, y: h * 0.5, r: Math.min(w, h) * 0.8 } });
      this.painted = this.live;
      this.paintedTheme = theme.current;
    }
    const view = this.s.render();
    if (!this.live) ctx.drawImage(view, 0, 0, w, h);
  }
}
