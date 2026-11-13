import type { Scene, RoomNav } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { ease } from '../../design/motion';
import { clamp } from '../../core/math';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop } from '../../render/paint';
import { el, Hint } from '../../ui/components';
import { OrderHud, OrderToast, Rising } from '../../ui/order';
import { getSliceScene, type SliceScene } from './SliceScene';
import { fruitFor } from './fruits';
import { orderFor, verdict, type Order } from './game';

type Phase = 'intro' | 'play' | 'hold' | 'fall' | 'result' | 'clear';

interface Stroke {
  /**
   * A knife stroke, or a drag that turns the fruit. A stroke that starts off
   * the fruit is `pending` until it has moved a little: heading at the fruit,
   * it's a cut; any other way, it turns it.
   */
  kind: 'pending' | 'cut' | 'turn';
  /** Where the finger came down. */
  start: { x: number; y: number };
  /** Last position and time (for turning). */
  last: { x: number; y: number; t: number };
  /** The last point outside the fruit, and where it went in (if it has). */
  outside: { x: number; y: number } | null;
  entry: { x: number; y: number } | null;
  /** The trail drawn behind the finger. */
  trail: { x: number; y: number; t: number }[];
  /** This stroke has made its cut: one swipe is one cut, however it wanders. */
  done?: boolean;
}

/** The drop-in: how high a new fruit starts and how long it takes to float down. */
const INTRO = { lift: 9, time: 1.1 };
/** The breath before it falls apart. */
const HOLD = 0.75;
const TRAIL_LIFE = 0.28;
/** A haptic tick for every this much turning (radians). */
const TURN_TICK = 0.3;
/** How far (px) a stroke off the fruit moves before it's judged a cut or a turn. */
const DECIDE = 12;

/**
 * Room: slice. A fruit floats over a wooden board, turning slowly, and asks
 * for an order: "exactly 8 pieces, in 3 cuts". Swipe across it and the knife cuts
 * clean through along that line, leaving a glowing seam; the pieces stay
 * together until the last cut, then it falls apart onto the board. The trick
 * is to cross every cut you've made — and to turn it (swipe anywhere beside
 * it), so the next cut goes a new way through it. Every cut runs along
 * your swipe. A cut that would only shave off a sliver doesn't count. It says
 * how close you came; nothing can be failed.
 */
export class SliceRoom implements Scene {
  readonly id = 'slice';
  readonly tint = roomTint.slice;
  readonly ui: HTMLElement;
  readonly view: HTMLCanvasElement;
  live = false;

  private s: SliceScene;
  private w = 0;
  private h = 0;
  private hint = new Hint('swipe across the fruit to slice it', 'knife');
  private turnHint = new Hint('swipe beside the fruit to turn it', 'turn');
  private phase: Phase = 'intro';
  private phaseT = 0;
  private order: Order;
  /** The last few orders, so the next is always something new. */
  private recent: Order[] = [];
  private stroke = new Map<number, Stroke>();
  private lastCutAt = 0;
  private turned = 0;
  /** The stage behind the fruit is painted (a still: no need to repaint it each frame). */
  private painted = false;
  private paintedTheme: unknown = null;
  private firstLand = false;

  private hud = new OrderHud();
  private toast = new OrderToast();
  private plus = new Rising();
  private tag: HTMLElement;
  private tagName: HTMLElement;
  private trailSvg: SVGSVGElement;
  private trailPath: SVGPathElement;

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-slice');
    this.order = orderFor();

    this.tagName = el('span', 'order-tag-name');
    this.tag = el('div', 'order-tag', {}, [this.tagName]);

    const NS = 'http://www.w3.org/2000/svg';
    this.trailSvg = document.createElementNS(NS, 'svg');
    this.trailSvg.setAttribute('class', 'slice-trail');
    this.trailSvg.setAttribute('aria-hidden', 'true');
    this.trailPath = document.createElementNS(NS, 'path');
    this.trailSvg.append(this.trailPath);

    this.ui.append(this.trailSvg, this.hud.root, this.toast.root, this.plus.root, this.tag, this.hint.root, this.turnHint.root);

    this.s = getSliceScene();
    this.view = this.s.canvas;
    this.s.events = {
      land: (size, speed, at) => {
        const pan = panFor(this.s.toScreen(at).x, this.w);
        const k = clamp(speed / 10, 0, 1);
        material.plop(24 + size * 50, k, pan);
        if (!this.firstLand) {
          this.firstLand = true;
          haptics.play('thud');
        } else if (k > 0.45) haptics.play('tap');
      },
      gone: (at, size, i) => material.pop(clamp(1 - size, 0.25, 0.9), panFor(this.s.toScreen(at).x, this.w), (i % 4) * 0.012),
    };
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    const top = safe.top + 128;
    const bottom = h - safe.bottom - 64;
    this.s.resize(w, h, window.devicePixelRatio || 1, top, bottom);
    this.trailSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.placeTag();
    this.painted = false;
  }

  private placeTag() {
    const y = this.s.boardFront.y;
    this.tag.style.top = `${Math.round(Math.min(y + 18, this.h - 70))}px`;
  }

  enter() {
    this.s.active = true;
    if (this.phase === 'intro' || this.phase === 'play') {
      if (this.s.cutCount === 0) this.beginIntro();
    }
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1600);
    this.painted = false;
  }

  leave() {
    this.s.active = false;
    this.hint.hide();
    this.turnHint.hide();
    this.stroke.clear();
    this.trailPath.removeAttribute('d');
  }

  // ——— the order ———

  private beginIntro() {
    this.order = orderFor(Math.random, this.recent, this.recent.length < 2);
    this.recent = [...this.recent.slice(-5), this.order];
    const fruit = fruitFor(this.s.fruit);
    this.s.setFruit(fruit, INTRO.lift);
    this.s.face.set('happy', 1.6);
    this.phase = 'intro';
    this.phaseT = 0;
    this.firstLand = false;
    this.tagName.textContent = fruit.name;
    this.tag.classList.remove('is-leaving');
    this.syncHud(false);
    this.toast.show(`${this.order.target} little pieces`, `${this.order.cuts} cut${this.order.cuts === 1 ? '' : 's'}, if you can`);
  }

  private syncHud(bump: boolean) {
    const n = this.s.pieces.length;
    this.hud.set(n, `of ${this.order.target} pieces`, n === this.order.target, n > this.order.target, bump);
    this.hud.setPips(this.order.cuts, this.s.cutCount);
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    if (this.phase === 'fall' || this.phase === 'result') {
      if (this.s.pokeAt(p.x, p.y)) {
        material.boop(26, 0.6, panFor(p.x, this.w));
        haptics.play('tap');
      } else if (this.phase === 'result' && this.phaseT > 0.9) this.beginClear();
      return;
    }
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    const now = performance.now();
    const inside = this.s.overFruit(p.x, p.y);
    // Holding it still while you decide.
    if (!inside) this.s.grab();
    this.stroke.set(p.id, {
      kind: inside ? 'cut' : 'pending',
      start: { x: p.x, y: p.y },
      last: { x: p.x, y: p.y, t: now },
      outside: inside ? null : { x: p.x, y: p.y },
      entry: inside ? { x: p.x, y: p.y } : null,
      trail: [{ x: p.x, y: p.y, t: performance.now() }],
    });
    if (inside) {
      this.s.squash.impulse(0.8);
      this.s.face.set('wide', 0.6);
    }
  }

  pointerMove(p: Pointer) {
    const st = this.stroke.get(p.id);
    if (!st) return;
    const now = performance.now();
    if (st.kind === 'pending') {
      st.trail.push({ x: p.x, y: p.y, t: now });
      if (Math.hypot(p.x - st.start.x, p.y - st.start.y) < DECIDE) return;
      if (this.headingAtFruit(st.start, p)) st.kind = 'cut';
      else {
        // Not toward the fruit: it's a turn, from where the finger came down.
        st.kind = 'turn';
        st.trail = [];
        st.last = { x: st.start.x, y: st.start.y, t: st.last.t };
      }
    }
    if (st.kind === 'turn') {
      const a = this.s.turn(p.x - st.last.x, p.y - st.last.y, (now - st.last.t) / 1000);
      st.last = { x: p.x, y: p.y, t: now };
      this.turned += a;
      if (this.turned > TURN_TICK) {
        this.turned = 0;
        haptics.play('tick');
      }
      if (!settings.value.seenHints.includes('slice-turn')) {
        settings.markHintSeen('slice-turn');
        this.turnHint.hide();
      }
      return;
    }
    st.trail.push({ x: p.x, y: p.y, t: now });
    if (!this.canCut || st.done) return;
    const f = this.s.screenFruit;
    this.s.face.look((p.x - f.x) / (f.r * 3), (p.y - f.y) / (f.r * 3));
    const inside = this.s.overFruit(p.x, p.y);
    if (inside && !st.entry) {
      st.entry = st.outside ?? { x: p.x, y: p.y };
      haptics.play('tick');
    } else if (!inside) {
      if (st.entry) {
        // Out the other side: the knife goes right through (once per swipe).
        st.done = this.tryCut(st.entry.x, st.entry.y, p.x, p.y);
        st.entry = null;
      }
      st.outside = { x: p.x, y: p.y };
    }
  }

  pointerUp(p: Pointer, cancelled: boolean) {
    const st = this.stroke.get(p.id);
    this.stroke.delete(p.id);
    if (!st || st.kind !== 'cut' || st.done || cancelled || !this.canCut) return;
    // Let go while still on the fruit: a long enough stroke still cuts.
    if (st.entry && Math.hypot(p.x - st.entry.x, p.y - st.entry.y) > this.s.screenFruit.r * 0.9) {
      this.tryCut(st.entry.x, st.entry.y, p.x, p.y);
    }
  }

  /** Is a stroke from `a` toward `b` aimed at the fruit (its line passes over it, ahead)? */
  private headingAtFruit(a: { x: number; y: number }, b: { x: number; y: number }) {
    const f = this.s.screenFruit;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const cx = f.x - a.x;
    const cy = f.y - a.y;
    const ahead = (cx * dx + cy * dy) / l;
    const off = Math.abs(cx * dy - cy * dx) / l;
    return ahead > 0 && off < f.r * 1.05;
  }

  /** Knife's ready: playing, or the fruit's nearly floated down. */
  private get canCut() {
    return this.phase === 'play' || (this.phase === 'intro' && this.phaseT > INTRO.time * 0.6);
  }

  /** Cut along this line. Returns whether the stroke is spent (it cut, or bounced off). */
  private tryCut(ax: number, ay: number, bx: number, by: number) {
    const now = performance.now();
    if (now - this.lastCutAt < 140 || this.s.cutCount >= this.order.cuts) return false;
    const before = this.s.pieces.length;
    const res = this.s.cut(ax, ay, bx, by);
    if (!res) {
      // Through the fruit, but it would only have shaved off slivers: the knife bounces.
      if (this.s.overFruit((ax + bx) / 2, (ay + by) / 2, 1.05) || this.s.overFruit(ax, ay) || this.s.overFruit(bx, by)) {
        this.lastCutAt = now;
        material.boing(panFor((ax + bx) / 2, this.w));
        haptics.play('soft');
        this.s.sway.impulse(1.2);
        this.plus.show('too thin', this.s.screenFruit);
        return true;
      }
      return false;
    }
    this.lastCutAt = now;
    const n = this.s.pieces.length;
    const pan = panFor((ax + bx) / 2, this.w);
    material.chop(n - before, n, pan);
    haptics.play('snap');
    this.s.face.set(n - before > 2 ? 'squeeze' : 'surprised', 0.8);
    this.toast.hide();
    this.syncHud(true);
    this.plus.show(`+${n - before}`, this.s.toScreen(res.at));
    if (!settings.value.seenHints.includes(this.id)) {
      settings.markHintSeen(this.id);
      this.hint.hide();
    }
    // After the first cut, show how to turn it (once).
    if (!settings.value.seenHints.includes('slice-turn') && this.s.cutCount < this.order.cuts) this.turnHint.show(500);
    // Exactly right, past it (there's no un-cutting), or out of cuts: it's done.
    const t = this.order.target;
    if (n >= t || this.s.cutCount >= this.order.cuts) this.beginHold(n === t);
    return true;
  }

  private beginHold(reached: boolean) {
    this.phase = 'hold';
    this.phaseT = 0;
    this.stroke.clear();
    this.turnHint.hide();
    this.s.face.set(reached ? 'happy' : 'wide', HOLD + 0.3);
    if (reached) {
      material.sparkle(0);
      haptics.play('soft');
    }
  }

  private fall() {
    this.phase = 'fall';
    this.phaseT = 0;
    this.s.tremble = 0;
    this.s.fallApart();
    material.thump(0.6, 0);
    this.tag.classList.add('is-leaving');
  }

  private showResult() {
    const pieces = this.s.pieces.length;
    const t = this.order.target;
    const [title, sub] = verdict(pieces, t);
    this.toast.show(title, sub);
    // Exactly the order: a little fanfare.
    if (pieces === t) material.tada();
    this.phase = 'result';
    this.phaseT = 0;
  }

  private beginClear() {
    this.phase = 'clear';
    this.phaseT = 0;
    this.toast.hide();
    this.s.beginClear();
  }

  // ——— simulation ———

  update(dt: number) {
    this.phaseT += dt;
    const s = this.s;

    switch (this.phase) {
      case 'intro': {
        const k = clamp(this.phaseT / INTRO.time, 0, 1);
        s.lift = INTRO.lift * (1 - ease.outCubic(k));
        if (k >= 1) {
          s.lift = 0;
          s.squash.impulse(4);
          material.boop(30, 0.5, 0);
          haptics.play('soft');
          this.phase = 'play';
          this.phaseT = 0;
        }
        break;
      }
      case 'play': {
        s.face.base = 'calm';
        break;
      }
      case 'hold': {
        const k = clamp(this.phaseT / HOLD, 0, 1);
        s.tremble = ease.inCubic(k);
        if (this.phaseT > 0.3 && this.phaseT - dt <= 0.3) haptics.play('tick');
        if (this.phaseT > 0.55 && this.phaseT - dt <= 0.55) haptics.play('tick');
        if (k >= 1) this.fall();
        break;
      }
      case 'fall': {
        if (s.settled || this.phaseT > 3.2) this.showResult();
        break;
      }
      case 'result': {
        if (this.phaseT > 3.4) this.beginClear();
        break;
      }
      case 'clear': {
        if (s.cleared && this.phaseT > 0.5) {
          this.beginIntro();
          material.sparkle(0);
        }
        break;
      }
    }
    s.update(dt, this.stroke.size > 0);
    this.drawTrail();
  }

  /** The knife's trail: a tapered pale stroke that fades behind the finger. */
  private drawTrail() {
    const now = performance.now();
    let d = '';
    for (const st of this.stroke.values()) {
      st.trail = st.trail.filter((q) => now - q.t < TRAIL_LIFE * 1000);
      const pts = st.trail;
      if (pts.length < 2) continue;
      // A ribbon: wide at the finger, a point at the tail.
      const left: string[] = [];
      const right: string[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy) || 1;
        const wdt = 5 * (i / (pts.length - 1)) * (1 - (now - pts[i].t) / (TRAIL_LIFE * 1000));
        const nx = (-dy / l) * wdt;
        const ny = (dx / l) * wdt;
        left.push(`${(pts[i].x + nx).toFixed(1)},${(pts[i].y + ny).toFixed(1)}`);
        right.unshift(`${(pts[i].x - nx).toFixed(1)},${(pts[i].y - ny).toFixed(1)}`);
      }
      d += `M${left.join('L')}L${right.join('L')}Z`;
    }
    if (d) this.trailPath.setAttribute('d', d);
    else this.trailPath.removeAttribute('d');
  }

  // ——— drawing ———

  draw(ctx: CanvasRenderingContext2D) {
    const t = theme.current;
    const { w, h } = this;
    // Once the room's own canvas is showing, the stage behind it is a still:
    // paint it once, not every frame (Safari pays for every full repaint).
    if (!this.live || !this.painted || theme.current !== this.paintedTheme) {
      paintBackdrop(ctx, w, h, t, { tint: this.tint, floorY: null, spot: { x: w / 2, y: h * 0.5, r: Math.min(w, h) * 0.8 } });
      this.painted = this.live;
      this.paintedTheme = theme.current;
    }
    const view = this.s.render();
    if (!this.live) ctx.drawImage(view, 0, 0, w, h);
  }
}
