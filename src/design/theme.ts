import { themes, type Theme, type as typeTokens, radius, cssEase, duration } from './tokens';

type Listener = (t: Theme) => void;

const listeners = new Set<Listener>();
let current: Theme = themes.day;

function detect(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? themes.dusk : themes.day;
  } catch {
    return themes.day;
  }
}

/** Mirror tokens into CSS custom properties so DOM chrome matches the canvas. */
function applyCss(t: Theme) {
  const s = document.documentElement.style;
  s.setProperty('--bg', t.bg);
  s.setProperty('--bg-deep', t.bgDeep);
  s.setProperty('--surface', t.surface);
  s.setProperty('--surface-sunk', t.surfaceSunk);
  s.setProperty('--ink', t.ink);
  s.setProperty('--ink-soft', t.inkSoft);
  s.setProperty('--ink-faint', t.inkFaint);
  s.setProperty('--shadow-rgb', t.shadowRgb);
  s.setProperty('--font-display', typeTokens.display);
  s.setProperty('--font-text', typeTokens.text);
  s.setProperty('--r-sm', `${radius.sm}px`);
  s.setProperty('--r-md', `${radius.md}px`);
  s.setProperty('--r-lg', `${radius.lg}px`);
  s.setProperty('--r-xl', `${radius.xl}px`);
  s.setProperty('--ease-out', cssEase.out);
  s.setProperty('--ease-in-out', cssEase.inOut);
  s.setProperty('--ease-overshoot', cssEase.overshoot);
  s.setProperty('--d-quick', `${duration.quick}ms`);
  s.setProperty('--d-base', `${duration.base}ms`);
  s.setProperty('--d-calm', `${duration.calm}ms`);
  document.documentElement.dataset.theme = t.name;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', t.bg);
  document.body.style.background = t.bg;
}

export const theme = {
  get current() {
    return current;
  },
  init() {
    current = detect();
    applyCss(current);
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        current = detect();
        applyCss(current);
        listeners.forEach((l) => l(current));
      });
    } catch {
      /* older webviews: stay on day */
    }
  },
  onChange(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
