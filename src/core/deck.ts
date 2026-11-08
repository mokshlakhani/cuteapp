/**
 * Lines dealt like a shuffled deck: every line in a list once, in a fresh
 * order, before any comes round again — and never the same one twice in a
 * row, even across a reshuffle. So what a room says after each round keeps
 * changing.
 */

const decks = new Map<readonly string[], string[]>();
const lastOf = new Map<readonly string[], string>();

/** The next line from `list`. */
export function deal(list: readonly string[], rnd = Math.random): string {
  let deck = decks.get(list);
  if (!deck || !deck.length) {
    deck = [...list];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1)) % (i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Fresh deck: don't open with the line the last one ended on.
    const last = lastOf.get(list);
    if (deck.length > 1 && deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    decks.set(list, deck);
  }
  const line = deck.pop()!;
  lastOf.set(list, line);
  return line;
}

/** Fill `{name}` slots in a line. */
export const fill = (line: string, vars: Record<string, string | number>) => line.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Start every deck afresh (tests). */
export function resetDecks() {
  decks.clear();
  lastOf.clear();
}
