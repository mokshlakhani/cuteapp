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
    if (raw) return { ...defaults, ...JSON.parse(raw) };
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
