/** What bubbles says when a round is scored: dealt so it's never the same twice running (see core/deck). */

/** Every one, nothing extra. */
export const MEMORY_PERFECT = [
  'perfect memory',
  'spot on',
  'every one',
  'sharp as a tack',
  'nailed it',
  'what a memory',
  'all of them',
  'brilliant',
  'not one missed',
  'exactly right',
  'you remembered',
  'clever you',
  'picture perfect',
  'like a camera',
  'all present',
  'a perfect match',
  'on the dot',
  'well remembered',
] as const;

/** Most of them. */
export const MEMORY_CLOSE = [
  'so close',
  'nearly',
  'almost all',
  'very nearly',
  'just a slip',
  'nearly perfect',
  'one little mix-up',
  'not far off',
  'oh, so near',
  'mostly right',
  'nearly there',
  'a near thing',
  'good memory',
  'close call',
] as const;

/** A fuzzy one. */
export const MEMORY_FUZZY = [
  'a fuzzy one',
  'a bit hazy',
  'tricky one',
  'a little foggy',
  'that was hard',
  'a blur',
  'mixed up',
  'try another',
  'a wobbly one',
  'not this time',
  'a head-scratcher',
  'it slipped away',
  'so many bubbles',
  'a dreamy guess',
] as const;

export const MEMORY_BIGGER = ['next one’s bigger', 'a bigger one next', 'one more next time', 'up a bubble'] as const;
export const MEMORY_SMALLER = ['a smaller one next', 'one fewer next', 'easing off a bubble', 'a smaller one now'] as const;
