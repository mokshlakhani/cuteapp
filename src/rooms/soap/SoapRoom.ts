import type { RoomNav, Scene } from '../../app/scene';
import type { Pointer } from '../../core/input';
import type { Insets } from '../../render/stage';
import { theme } from '../../design/theme';
import { roomTint } from '../../design/tokens';
import { clamp } from '../../core/math';
import { panFor } from '../../core/audio';
import { material } from '../../core/sounds';
import { haptics } from '../../core/haptics';
import { settings } from '../../core/settings';
import { paintBackdrop } from '../../render/paint';
import { reducedMotion } from '../../render/camera';
import { el, Hint } from '../../ui/components';
import { OrderHud, Rising } from '../../ui/order';
import { getSoapScene, type Bubble, type SoapScene } from './SoapScene';
import { burstAt, callFor, loadBest, NEAR, offBy, OVER, orderFor, PUFF, rateAt, Run, saveBest, type Order } from './game';

type Phase = 'ready' | 'blow';

/** A haptic tick for every this much growth. */
const TICK = 0.09;
/** The breath's sound, every so many seconds. */
const BREATH = 0.13;
/** Notes the rising tone climbs through, from nothing to the biggest bubble. */
const STEPS = 14;

/**
 * Room: soap. A wand stands in a dish of soapy water, and a dashed ring shows
 * how big to blow. Hold anywhere and a bubble swells out of the wand, its note
 * climbing, with a ding as it reaches the ring. Let go and it pinches off and
 * floats up off the screen, and the next ring is ready at once: there's never
 * a wait. A word beside the bubble says how it went. Go 8% past the ring and
 * it pops by itself, which ends your run: the number at the top is how many
 * bubbles you've let go in a row, under your high score. Every bubble is a
 * different size and has a different film. Tap one that's floating to pop it,
 * just because.
 */
export class SoapRoom implements Scene {
  readonly id = 'soap';
  readonly tint = roomTint.soap;
  readonly ui: HTMLElement;
  readonly view: HTMLCanvasElement;
  live = false;

  private s: SoapScene;
  private w = 0;
  private h = 0;
  private hint = new Hint('hold to blow, let go on the ring', 'press');
  private phase: Phase = 'ready';
  private phaseT = 0;
  private order: Order;
  /** The finger blowing the bubble. */
  private finger: number | null = null;
  private size = 0;
  private ticked = 0;
  private breathAt = 0;
  private painted = false;
  private paintedTheme: unknown = null;
  /** The bubble whose word is showing, and where the word sits from it. */
  private worded: Bubble | null = null;
  private wordX = 0;
  private wordY = 0;
  /** The note the rising tone is on, whether it's on the ring, and perfect ones in a row. */
  private step = 0;
  private near = false;
  private streak = 0;

  private run = new Run(loadBest());

  private hud = new OrderHud();
  private plus = new Rising();
  private ring = el('div', 'soap-ring', { 'aria-hidden': 'true' });

  constructor(_nav: RoomNav) {
    this.ui = el('div', 'room room-soap');
    this.order = orderFor();
    this.ui.append(this.hud.root, this.ring, this.plus.root, this.hint.root);
    this.s = getSoapScene();
    this.view = this.s.canvas;
    this.s.events = {
      burst: (at, size) => {
        material.soapPop(size, panFor(this.s.toScreen(at).x, this.w));
        haptics.play('soft');
      },
    };
  }

  layout(w: number, h: number, safe: Insets) {
    this.w = w;
    this.h = h;
    this.s.resize(w, h, window.devicePixelRatio || 1, safe.top + 118, h - safe.bottom - 30);
    this.placeRing();
    this.painted = false;
  }

  enter() {
    this.run.end();
    this.syncHud(false);
    this.beginOrder();
    if (!settings.value.seenHints.includes(this.id)) this.hint.show(1400);
    this.painted = false;
  }

  leave() {
    this.hint.hide();
    this.finger = null;
    // The room keeps running through the transition: a breath must end here.
    this.phase = 'ready';
    this.ring.classList.remove('is-near');
    this.s.clearAll();
    this.worded = null;
  }

  // ——— the bubble ———

  private beginOrder() {
    this.order = orderFor(Math.random, this.order);
    this.phase = 'ready';
    this.phaseT = 0;
    this.s.face.base = 'calm';
    this.placeRing();
    this.ring.classList.remove('is-near', 'is-new');
    void this.ring.offsetWidth;
    this.ring.classList.add('is-shown', 'is-new');
  }

  private syncHud(bump: boolean) {
    this.hud.set(this.run.count, `high score ${this.run.best}`, false, false, bump);
  }

  private placeRing() {
    const g = this.s.ghost(this.order.size);
    const d = Math.round(g.r * 2);
    this.ring.style.width = this.ring.style.height = `${d}px`;
    this.ring.style.transform = `translate(${Math.round(g.x - d / 2)}px, ${Math.round(g.y - d / 2)}px)`;
  }

  // ——— input ———

  pointerDown(p: Pointer) {
    // A breath can start at any moment; a second finger can still pop what's floating.
    if (this.finger !== null) {
      this.s.popAt(p.x, p.y);
      return;
    }
    this.finger = p.id;
    this.phase = 'blow';
    this.phaseT = 0;
    this.size = 0;
    this.ticked = 0;
    this.breathAt = 0;
    this.step = 0;
    this.near = false;
    this.s.startBlow();
    this.s.blow(0);
    this.s.face.set('wide', 0.5);
    this.hint.hide();
    haptics.play('tick');
  }

  pointerMove(_p: Pointer) {}

  pointerUp(p: Pointer, cancelled: boolean) {
    if (p.id !== this.finger) return;
    this.finger = null;
    if (this.phase !== 'blow') return;
    // Interrupted, or only a tap: it sinks back with nothing lost, and a tap pops what it hit.
    if (cancelled || this.size < PUFF) {
      this.s.deflate();
      this.phase = 'ready';
      this.phaseT = 0;
      this.ring.classList.remove('is-near');
      if (!cancelled) this.s.popAt(p.x, p.y);
      return;
    }
    const target = this.order.size;
    const pan = panFor(this.w / 2, this.w);
    const perfect = Math.abs(offBy(this.size, target)) <= NEAR.exact;
    const beside = this.s.besideLive;
    const beat = this.run.add();
    saveBest(this.run.best);
    this.syncHud(true);
    this.plus.show(beat ? 'new high score!' : callFor(this.size, target), beside);
    const at = this.s.liveAt;
    this.worded = this.s.release();
    this.wordX = beside.x - at.x;
    this.wordY = beside.y - at.y;
    material.soapFree(this.size, pan);
    this.streak = perfect ? this.streak + 1 : 0;
    if (perfect) material.soapChime(this.streak, pan);
    if (beat) material.sparkle(0);
    haptics.play(perfect ? 'soft' : 'tap');
    settings.markHintSeen(this.id);
    this.beginOrder();
  }

  // ——— simulation ———

  update(dt: number) {
    this.phaseT += dt;
    if (this.phase === 'blow') this.stepBlow(dt);
    this.s.update(dt);
    this.stepWord();
  }

  /** The word stays beside its bubble as it floats. */
  private stepWord() {
    const at = this.worded && this.s.track(this.worded);
    if (at) this.plus.move({ x: at.x + this.wordX, y: at.y + this.wordY });
    else this.worded = null;
  }

  private stepBlow(dt: number) {
    const target = this.order.size;
    this.size += rateAt(this.order.pace, this.phaseT, this.size) * dt;
    this.s.blow(this.size);
    const off = offBy(this.size, target);
    const strain = clamp(off / OVER, 0, 1);
    this.s.strain = reducedMotion ? 0 : strain;
    if (strain > 0.5) this.s.face.set('strain', 0.2);
    else if (strain > 0) this.s.face.set('nervous', 0.2);
    else this.s.face.look(0, -0.4);
    const near = Math.abs(off) <= NEAR.exact;
    this.ring.classList.toggle('is-near', near);
    // A ding as it reaches the ring.
    if (near && !this.near) {
      material.soapRing(0);
      haptics.play('tick');
    }
    this.near = near;
    this.breathAt -= dt;
    if (this.breathAt <= 0) {
      this.breathAt = BREATH;
      material.soapBlow(this.size, 0);
    }
    // Its note climbs as it grows, and past the ring the film starts to sing.
    const step = Math.floor(this.size * STEPS);
    if (step > this.step) {
      this.step = step;
      if (strain === 0) material.soapRise(step, 0);
    }
    if (strain > 0) material.soapStrain(strain, 0);
    if (this.size - this.ticked > TICK) {
      this.ticked = this.size;
      haptics.play('tick');
    }
    if (this.size >= burstAt(target)) {
      this.finger = null;
      this.streak = 0;
      this.run.end();
      this.syncHud(false);
      this.plus.show('too big', this.s.besideLive);
      this.s.burstLive();
      this.worded = null;
      this.beginOrder();
    }
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
