import { el, tactile } from './components';
import { icons } from '../design/icons';
import { ui as uiSound } from '../core/sounds';
import { howTo } from '../app/howto';

/**
 * The help card: a soft rounded card in the middle of the screen, over a
 * dimmed room, saying how to play the game you're in — only that game. Its
 * button is in every game's top bar, never on the home screen. Tap outside
 * it, the ×, or Escape to close.
 */
export class HelpCard {
  readonly root: HTMLDivElement;
  private card: HTMLDivElement;
  private title: HTMLHeadingElement;
  private body: HTMLDivElement;
  open = false;

  constructor() {
    this.root = el('div', 'help-scrim', { 'aria-hidden': 'true' });
    this.card = el('div', 'help-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-title' });
    this.title = el('h2', 'help-title', { id: 'help-title' });
    const close = el('button', 'btn btn-icon help-close', { type: 'button', 'aria-label': 'close', title: 'close' });
    close.innerHTML = icons.close;
    tactile(close, () => this.hide());
    const head = el('div', 'help-head', {}, [this.title, close]);
    this.body = el('div', 'help-body');
    this.card.append(head, this.body);
    this.root.append(this.card);

    // Tap the dimmed room around the card to close it.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide();
    });
    // While it's open, keys belong to the card: Escape closes it, and Space
    // or Enter don't reach the room underneath (no pouring behind it).
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.hide();
        } else if ((e.key === ' ' || e.key === 'Enter') && !this.card.contains(e.target as Node)) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      { capture: true },
    );
  }

  /** Open on how to play `roomId`, called `name`. Nothing to show (home): stays shut. */
  show(roomId: string, name = roomId) {
    const h = howTo(roomId);
    if (!h) return;
    this.title.textContent = name;
    const steps = el('ol', 'help-steps');
    for (const s of h.steps) steps.append(el('li', '', {}, [s]));
    const tips = el('ul', 'help-tips');
    for (const t of h.tips) tips.append(el('li', '', {}, [t]));
    this.body.replaceChildren(
      el('p', 'help-goal', {}, [h.goal]),
      el('h3', 'help-label', {}, ['how to play']),
      steps,
      el('h3', 'help-label', {}, ['good to know']),
      tips,
    );
    this.body.scrollTop = 0;
    this.open = true;
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
    uiSound.sheet(true);
    this.card.querySelector<HTMLButtonElement>('.help-close')?.focus({ preventScroll: true });
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    uiSound.sheet(false);
  }

  toggle(roomId: string, name?: string) {
    if (this.open) this.hide();
    else this.show(roomId, name);
  }
}
