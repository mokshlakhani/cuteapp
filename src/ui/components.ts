import { icons, type IconName } from '../design/icons';
import { haptics } from '../core/haptics';
import { ui as uiSound } from '../core/sounds';
import { settings, type Settings } from '../core/settings';
import { audio } from '../core/audio';

/**
 * Reusable UI pieces. Every room builds its (very small) chrome from these,
 * so buttons, toggles, sheets and hints feel identical everywhere.
 */

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) n.append(c);
  return n;
}

/** Tactile press: squish down on touch, spring back with overshoot. */
export function tactile(node: HTMLElement, onTap: (e: PointerEvent) => void, opts: { sound?: boolean; haptic?: boolean } = {}) {
  let pressed = false;
  node.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    audio.unlock();
    pressed = true;
    node.classList.add('is-pressed');
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });
  const release = (e: PointerEvent, fire: boolean) => {
    if (!pressed) return;
    pressed = false;
    node.classList.remove('is-pressed');
    if (!fire) return;
    const r = node.getBoundingClientRect();
    const inside = e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
    if (!inside) return;
    if (opts.sound !== false) uiSound.tap();
    if (opts.haptic !== false) haptics.play('tap');
    onTap(e);
  };
  node.addEventListener('pointerup', (e) => release(e, true));
  node.addEventListener('pointercancel', (e) => release(e, false));
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(new PointerEvent('pointerup'));
    }
  });
  return node;
}

export function iconButton(icon: IconName, label: string, onTap: () => void, cls = '') {
  const b = el('button', `btn btn-icon ${cls}`, { type: 'button', 'aria-label': label, title: label });
  b.innerHTML = icons[icon];
  tactile(b, onTap);
  return b;
}

export function setIcon(b: HTMLElement, icon: IconName) {
  b.innerHTML = icons[icon];
}

// ——— sound menu ———

const toggles: { key: keyof Pick<Settings, 'music' | 'sfx' | 'haptics'>; icon: IconName; label: string }[] = [
  { key: 'music', icon: 'music', label: 'music' },
  { key: 'sfx', icon: 'sound', label: 'sounds' },
  { key: 'haptics', icon: 'vibrate', label: 'haptics' },
];

/** A tiny popover with three on/off pills. That's all the settings there are. */
export class SoundMenu {
  readonly root: HTMLDivElement;
  private open = false;
  private rows = new Map<string, HTMLButtonElement>();

  constructor(private anchor: HTMLElement) {
    this.root = el('div', 'popover', { role: 'dialog', 'aria-label': 'sound settings' });
    for (const t of toggles) {
      const row = el('button', 'toggle', { type: 'button', role: 'switch' });
      row.innerHTML = `<span class="toggle-icon">${icons[t.icon]}</span><span class="toggle-label">${t.label}</span><span class="toggle-pill"><span class="toggle-knob"></span></span>`;
      tactile(
        row,
        () => {
          const v = !settings.value[t.key];
          settings.set(t.key, v);
          uiSound.toggle(v);
          if (t.key === 'haptics' && v) haptics.play('tap');
        },
        { sound: false, haptic: false },
      );
      this.rows.set(t.key, row);
      this.root.append(row);
    }
    this.sync();
    settings.onChange(() => this.sync());
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      if (this.root.contains(e.target as Node) || this.anchor.contains(e.target as Node)) return;
      this.toggle(false);
    });
  }

  private sync() {
    for (const t of toggles) {
      const on = settings.value[t.key];
      const row = this.rows.get(t.key)!;
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-checked', String(on));
    }
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('is-open', this.open);
    uiSound.sheet(this.open);
  }
}

// ——— top bar (persistent across the whole app) ———

export class TopBar {
  readonly root: HTMLDivElement;
  readonly back: HTMLButtonElement;
  readonly sound: HTMLButtonElement;
  readonly menu: SoundMenu;

  constructor(onBack: () => void) {
    this.root = el('div', 'topbar');
    this.back = iconButton('back', 'back home', onBack, 'topbar-back');
    this.sound = iconButton('sound', 'sound settings', () => this.menu.toggle());
    this.menu = new SoundMenu(this.sound);
    const right = el('div', 'topbar-right', {}, [this.sound, this.menu.root]);
    this.root.append(this.back, right);
    const syncIcon = () => setIcon(this.sound, settings.value.sfx || settings.value.music ? 'sound' : 'soundOff');
    syncIcon();
    settings.onChange(syncIcon);
  }

  showBack(show: boolean) {
    this.back.classList.toggle('is-hidden', !show);
    this.back.tabIndex = show ? 0 : -1;
  }
}

// ——— segmented control ———

export class Segmented<T extends string> {
  readonly root: HTMLDivElement;
  private buttons = new Map<T, HTMLButtonElement>();
  private thumb: HTMLDivElement;
  value: T;

  constructor(
    options: { value: T; icon: IconName; label: string }[],
    value: T,
    private onChange: (v: T) => void,
  ) {
    this.value = value;
    this.root = el('div', 'segmented', { role: 'radiogroup' });
    this.thumb = el('div', 'segmented-thumb');
    this.root.append(this.thumb);
    for (const o of options) {
      const b = el('button', 'segmented-item', { type: 'button', role: 'radio', 'aria-label': o.label, title: o.label });
      b.innerHTML = icons[o.icon];
      tactile(b, () => this.set(o.value), { sound: false });
      this.buttons.set(o.value, b);
      this.root.append(b);
    }
    this.sync();
  }

  set(v: T, silent = false) {
    if (v === this.value) return;
    this.value = v;
    this.sync();
    if (!silent) {
      uiSound.toggle(true);
      this.onChange(v);
    }
  }

  private sync() {
    let i = 0;
    for (const [v, b] of this.buttons) {
      const on = v === this.value;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
      if (on) this.thumb.style.transform = `translateX(${i * 100}%)`;
      i++;
    }
  }
}

// ——— hint ———

/** A quiet, one-line nudge that appears once and gets out of the way. */
export class Hint {
  readonly root: HTMLDivElement;
  private timer = 0;

  constructor(text: string, icon?: IconName) {
    this.root = el('div', 'hint', { role: 'status' });
    this.root.innerHTML = `${icon ? `<span class="hint-icon">${icons[icon]}</span>` : ''}<span>${text}</span>`;
  }

  show(delay = 900) {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.root.classList.add('is-shown'), delay);
  }

  hide() {
    clearTimeout(this.timer);
    this.root.classList.remove('is-shown');
  }
}
