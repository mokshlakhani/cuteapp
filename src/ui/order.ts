import { reducedMotion } from '../render/camera';
import { el } from './components';

/**
 * The chrome of a room with orders (slice, soap, stack, peel): the order and
 * how it went, the count so far, and little words that rise off the toy.
 */

/** The order as it's given, and how it went: a headline and a quieter line. */
export class OrderToast {
  readonly root: HTMLElement;
  private title = el('span', 'order-toast-title');
  private sub = el('span', 'order-toast-sub');

  constructor() {
    this.root = el('div', 'order-toast', { 'aria-live': 'polite' }, [this.title, this.sub]);
  }

  show(title: string, sub: string) {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.root.classList.add('is-shown');
  }

  hide() {
    this.root.classList.remove('is-shown');
  }
}

/** The big number at the top, what it's counting toward, and a row of pips. */
export class OrderHud {
  readonly root: HTMLElement;
  private num = el('span', 'order-count-num', {}, ['0']);
  private box = el('div', 'order-count', {}, [this.num]);
  private goal = el('span', 'order-goal');
  private pips = el('div', 'order-pips', { 'aria-hidden': 'true' });

  constructor() {
    this.root = el('div', 'order-hud', { role: 'status', 'aria-live': 'polite' }, [this.box, this.goal, this.pips]);
  }

  set(count: number, goal: string, done: boolean, over: boolean, bump: boolean) {
    this.num.textContent = String(count);
    this.goal.textContent = goal;
    this.box.classList.toggle('is-done', done);
    this.box.classList.toggle('is-over', over);
    if (bump && !reducedMotion) {
      this.box.classList.remove('is-up');
      void this.box.offsetWidth;
      this.box.classList.add('is-up');
    }
  }

  setPips(total: number, used: number) {
    if (this.pips.childElementCount !== total) this.pips.replaceChildren(...Array.from({ length: total }, () => el('span', 'order-pip')));
    [...this.pips.children].forEach((p, i) => p.classList.toggle('is-used', i < used));
  }
}

/** A little word rising off the toy. */
export class Rising {
  readonly root = el('div', 'order-plus', { 'aria-hidden': 'true' });
  /** How far its middle stays from the sides, so it's always all on screen. */
  private left = 0;
  private right = Infinity;

  show(text: string, p: { x: number; y: number }) {
    this.root.textContent = text;
    this.root.classList.remove('is-up');
    const edge = this.root.offsetWidth / 2 + 10;
    this.left = edge;
    this.right = (this.root.parentElement?.clientWidth ?? Infinity) - edge;
    this.move(p);
    this.root.classList.add('is-up');
  }

  /** Keep it beside something that's moving: smoothly, off the main layout. */
  move(p: { x: number; y: number }) {
    const x = Math.max(this.left, Math.min(this.right, p.x));
    this.root.style.translate = `${x.toFixed(1)}px ${p.y.toFixed(1)}px`;
  }
}

/**
 * A soft burst of twinkles for the moments that earn one: exactly the order,
 * one unbroken strip, a perfect bubble, a new best. A handful of four-point
 * sparkles drift out from a spot and fade: warm, brief, and only transforms
 * and opacity, so it costs the frame nothing. One shape for every room.
 */
export class Twinkle {
  readonly root = el('div', 'twinkle', { 'aria-hidden': 'true' });
  private bits: HTMLElement[] = [];

  constructor(count = 9) {
    for (let i = 0; i < count; i++) {
      const b = el('span', 'twinkle-bit');
      this.bits.push(b);
      this.root.append(b);
    }
  }

  /** Burst from `p` (px in the room), reaching about `reach` px. */
  burst(p: { x: number; y: number }, reach = 70) {
    if (reducedMotion) return;
    this.root.style.translate = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
    const turn = Math.random() * Math.PI * 2;
    this.bits.forEach((b, i) => {
      // Evenly round, a little uneven, drifting up more than down.
      const a = turn + (i / this.bits.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const d = reach * (0.55 + Math.random() * 0.45);
      b.style.setProperty('--dx', `${(Math.cos(a) * d).toFixed(1)}px`);
      b.style.setProperty('--dy', `${(Math.sin(a) * d * 0.85 - reach * 0.18).toFixed(1)}px`);
      b.style.setProperty('--s', (0.6 + Math.random() * 0.7).toFixed(2));
      b.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 120)}deg`);
      b.style.animationDelay = `${Math.round(Math.random() * 110)}ms`;
    });
    this.root.classList.remove('is-up');
    void this.root.offsetWidth;
    this.root.classList.add('is-up');
  }
}
