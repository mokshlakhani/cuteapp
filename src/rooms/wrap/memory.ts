import { deal } from '../../core/deck';
import { MEMORY_BIGGER, MEMORY_CLOSE, MEMORY_FUZZY, MEMORY_PERFECT, MEMORY_SMALLER } from './words';
/**
 * The bubble wrap's memory game, kept free of the canvas so it can be tested.
 * A pattern of bubbles glows for a moment; then you pop the ones you saw and
 * tap done. How well it matches: every bubble you got right counts, every
 * one you missed or popped by mistake counts against. A perfect round makes
 * the next pattern one bubble bigger; a rough one makes it one smaller.
 */

/** The smallest and largest patterns. */
export const MEMORY_MIN = 4;
export const MEMORY_MAX = 14;

/** How long a pattern of `n` glows (s): a little longer for bigger ones, but only just long enough. */
export const flashFor = (n: number) => 0.9 + 0.2 * n;

/** `n` different bubbles out of `count`, picked at random. */
export function pickPattern(count: number, n: number, rnd = Math.random): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1)) % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, Math.min(n, count)).sort((a, b) => a - b);
}

export type Grade = 'perfect' | 'close' | 'fuzzy';

export interface MemoryScore {
  /** In the pattern, and popped. */
  matched: number;
  /** In the pattern, but left alone. */
  missed: number;
  /** Popped, but not in the pattern. */
  wrong: number;
  /** 0..1: matched over everything that should or shouldn't have been popped. */
  accuracy: number;
  /** How it went: every one and nothing extra, near enough, or a fuzzy one. */
  grade: Grade;
}

/** How a round went: `pattern` the glowing bubbles, `popped` the ones you popped. */
export function scoreMemory(pattern: Iterable<number>, popped: Iterable<number>): MemoryScore {
  const want = new Set(pattern);
  const got = new Set(popped);
  let matched = 0;
  for (const i of got) if (want.has(i)) matched++;
  const wrong = got.size - matched;
  const missed = want.size - matched;
  const accuracy = want.size + wrong === 0 ? 1 : matched / (want.size + wrong);
  const grade: Grade = accuracy >= 1 ? 'perfect' : accuracy >= 0.6 ? 'close' : 'fuzzy';
  return { matched, missed, wrong, accuracy, grade };
}

/** The next pattern's size: one more after a perfect round, one fewer after a rough one. */
export function nextSize(n: number, grade: Grade) {
  const next = grade === 'perfect' ? n + 1 : grade === 'fuzzy' ? n - 1 : n;
  return Math.max(MEMORY_MIN, Math.min(MEMORY_MAX, next));
}

/** What to say once it's scored: a headline and a quieter line. Just how many you got: no percentages, no extras. */
export function memoryVerdict(s: MemoryScore, n: number, rnd = Math.random): [string, string] {
  const line = `${s.matched} of ${n}`;
  if (s.grade === 'perfect') return [deal(MEMORY_PERFECT, rnd), n < MEMORY_MAX ? `${line} · ${deal(MEMORY_BIGGER, rnd)}` : line];
  if (s.grade === 'close') return [deal(MEMORY_CLOSE, rnd), line];
  return [deal(MEMORY_FUZZY, rnd), n > MEMORY_MIN ? `${line} · ${deal(MEMORY_SMALLER, rnd)}` : line];
}

const KEY = 'softspot.wrap.memory.v1';

/** The pattern size you're on, kept between visits. */
export function loadMemory(): number {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return Number.isFinite(p.size) ? Math.max(MEMORY_MIN, Math.min(MEMORY_MAX, Math.floor(p.size))) : MEMORY_MIN + 1;
  } catch {
    return MEMORY_MIN + 1;
  }
}

export function saveMemory(size: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ size }));
  } catch {
    /* private mode */
  }
}
