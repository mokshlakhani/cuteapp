import { material } from '../core/sounds';
import { haptics } from '../core/haptics';
import { reducedMotion } from '../render/camera';
import { el } from './components';

const STAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6c.4 0 .7.2.9.6l2.1 4.3 4.7.7c.9.1 1.2 1.2.6 1.8l-3.4 3.3.8 4.7c.2.9-.8 1.5-1.5 1.1L12 17.9l-4.2 2.2c-.8.4-1.7-.2-1.5-1.1l.8-4.7-3.4-3.3c-.6-.6-.3-1.7.6-1.8l4.7-.7 2.1-4.3c.2-.4.5-.6.9-.6Z"/></svg>';

/**
 * The chrome of a room with orders (slice, soap, stack, peel): the order and
 * how it went, the count so far, and little words that rise off the toy.
 */

/** The order as it's given, and how it went: a headline, a quieter line, and stars that fill in one by one. */
export class OrderToast {
  readonly root: HTMLElement;
  private title = el('span', 'order-toast-title');
  private sub = el('span', 'order-toast-sub');
  private row = el('div', 'order-stars', { 'aria-hidden': 'true' });
  private total = 0;
  private shown = 0;

  constructor() {
    for (let i = 0; i < 3; i++) {
      const s = el('span', 'order-star');
      s.innerHTML = STAR;
      this.row.append(s);
    }
    this.root = el('div', 'order-toast', { 'aria-live': 'polite' }, [this.row, this.title, this.sub]);
  }

  show(title: string, sub: string, stars = 0) {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.total = stars;
    this.shown = 0;
    this.root.classList.toggle('has-stars', stars > 0);
    [...this.row.children].forEach((s) => s.classList.remove('is-on'));
    this.root.classList.add('is-shown');
  }

  hide() {
    this.root.classList.remove('is-shown');
  }

  /** Fill in the stars one after another; `t` is seconds since it was shown. */
  reveal(t: number) {
    const due = Math.min(this.total, Math.floor((t - 0.15) / 0.28) + 1);
    while (this.shown < due && t > 0.15) {
      this.row.children[this.shown].classList.add('is-on');
      material.star(this.shown, 0);
      haptics.play(this.shown === 2 ? 'soft' : 'tick');
      this.shown++;
      if (this.shown === 3) material.tada();
    }
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

  show(text: string, p: { x: number; y: number }) {
    this.root.textContent = text;
    this.move(p);
    this.root.classList.remove('is-up');
    void this.root.offsetWidth;
    this.root.classList.add('is-up');
  }

  /** Keep it beside something that's moving. */
  move(p: { x: number; y: number }) {
    this.root.style.left = `${Math.round(p.x)}px`;
    this.root.style.top = `${Math.round(p.y)}px`;
  }
}
