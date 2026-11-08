/**
 * What the pour room says once a glass is judged. Kind every time, and never
 * the same thing twice running: each list is dealt like a shuffled deck, and
 * only reshuffled once every line in it has had its turn.
 */

export const PERFECT_TITLES = [
  'perfect',
  'just right',
  'lovely pour',
  'spot on',
  'right on the line',
  'beautiful',
  'nailed it',
  'oh, nice',
  'so smooth',
  'what a pour',
  'a perfect glass',
  'exactly right',
  'chef’s kiss',
  'look at that',
  'steady hands',
  'bang on',
  'too good',
  'right there',
  'mmm, perfect',
  'like a pro',
  'just so',
  'sweet spot',
  'neat as can be',
  'how lovely',
  'gorgeous',
] as const;

export const PERFECT_SUBS = [
  'cheers',
  'enjoy every sip',
  'just how you like it',
  'a little treat',
  'sip slowly',
  'you earned this one',
  'lovely and full',
  'cozy and full',
  'drink up',
  'that hit the spot',
  'a calm little win',
  'easy does it',
  'made with care',
  'pour another?',
  'smooth as anything',
] as const;

/** `#` is the streak. */
export const STREAK_SUBS = [
  '# in a row',
  '# in a row now',
  'that’s # running',
  '# perfect pours',
  '# and counting',
  'a run of #',
  '# without a drop off',
  '# glasses, all just right',
] as const;

export const CLOSE_TITLES = [
  'so close',
  'nearly',
  'a hair short',
  'almost there',
  'just shy',
  'oh, so near',
  'a whisker off',
  'nearly perfect',
] as const;

export const CLOSE_SUBS = [
  'just a sip more',
  'one tiny drop more',
  'a smidge more next time',
  'hold on a blink longer',
  'right at the edge',
  'that was close',
  'you’ll get it next one',
  'still a lovely glass',
] as const;

export const SHORT_TITLES = [
  'almost',
  'a light pour',
  'room for more',
  'a little shy',
  'a short one',
  'just a taste',
  'a gentle start',
  'half a treat',
] as const;

export const SHORT_SUBS = [
  'a little more next time',
  'hold on a bit longer',
  'keep it pouring',
  'there’s plenty more',
  'no rush, try again',
  'fill it up next time',
  'a few more glugs',
  'nice and easy, next one',
] as const;

export const OVER_TITLES = [
  'a little extra',
  'a generous pour',
  'a touch over',
  'extra cozy',
  'bonus sips',
  'just past it',
  'a bit much',
  'a happy top-up',
  'overflowing love',
  'a big one',
] as const;

export const OVER_SUBS = [
  'more for you',
  'let go a touch sooner',
  'nobody minds extra',
  'a little early next time',
  'that’s a treat',
  'stop a blink earlier',
  'generous, like you',
  'sooner next time',
  'still delicious',
  'a sip to spare',
] as const;

export const SPILL_TITLES = [
  'oops, a happy spill',
  'whoops',
  'a little splash',
  'over the top',
  'oh dear',
  'a tiny flood',
  'spilled a bit',
  'drip drip',
] as const;

export const SPILL_SUBS = [
  'let go a touch sooner',
  'the table’s thirsty too',
  'all good, try again',
  'no harm done',
  'we’ll wipe it up',
  'a little earlier next time',
  'happens to everyone',
  'fresh glass coming',
] as const;

const decks = new Map<readonly string[], string[]>();
const lastOf = new Map<readonly string[], string>();

/**
 * The next line from `list`: every line once, in a shuffled order, before
 * any comes round again — and never the same one twice in a row.
 */
export function deal(list: readonly string[], rnd = Math.random): string {
  let deck = decks.get(list);
  if (!deck || !deck.length) {
    deck = [...list];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
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

/** Start every deck afresh (tests). */
export function resetWords() {
  decks.clear();
  lastOf.clear();
}

/** Every line there is to say, counted. */
export const WORD_COUNT = [
  PERFECT_TITLES,
  PERFECT_SUBS,
  STREAK_SUBS,
  CLOSE_TITLES,
  CLOSE_SUBS,
  SHORT_TITLES,
  SHORT_SUBS,
  OVER_TITLES,
  OVER_SUBS,
  SPILL_TITLES,
  SPILL_SUBS,
].reduce((n, l) => n + l.length, 0);
