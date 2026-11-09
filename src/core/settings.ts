/** Persisted, tiny user preferences. Storage may be unavailable — never throw. */

export interface Settings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  /** Rooms whose gentle first-time hint has already been dismissed. */
  seenHints: string[];
}

const KEY = 'softspot.settings.v1';
const defaults: Settings = { music: true, sfx: true, haptics: true, seenHints: [] };

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Take only well-typed fields, so a damaged entry can never break launch.
    const p: unknown = raw ? JSON.parse(raw) : null;
    if (p && typeof p === 'object') {
      const o = p as Partial<Record<keyof Settings, unknown>>;
      const flag = (k: 'music' | 'sfx' | 'haptics') => (typeof o[k] === 'boolean' ? (o[k] as boolean) : defaults[k]);
      return {
        music: flag('music'),
        sfx: flag('sfx'),
        haptics: flag('haptics'),
        seenHints: Array.isArray(o.seenHints) ? o.seenHints.filter((h): h is string => typeof h === 'string') : [],
      };
    }
  } catch {
    /* private mode etc. */
  }
  return { ...defaults };
}

let state = load();

export const settings = {
  get value(): Readonly<Settings> {
    return state;
  },
  set<K extends keyof Settings>(key: K, v: Settings[K]) {
    state = { ...state, [key]: v };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(state));
  },
  markHintSeen(room: string) {
    if (!state.seenHints.includes(room)) settings.set('seenHints', [...state.seenHints, room]);
  },
  onChange(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
