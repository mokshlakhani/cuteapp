/** What stack says when a run ends: dealt so it's never the same twice running (see core/deck). */

/** Beat your best. */
export const STACK_BEST = [
  'a new best',
  'your tallest yet',
  'sky high',
  'a record tower',
  'new heights',
  'look how tall',
  'tallest ever',
  'beat your best',
  'what a cairn',
  'towering',
  'up, up, up',
  'a proud stack',
  'higher than ever',
  'top of the world',
] as const;

/** Matched your best. */
export const STACK_MATCHED = [
  'just matched your best',
  'tied your best',
  'level with your best',
  'right at your best',
  'same as your best',
  'your best, again',
] as const;

/** Ended below your best. */
export const STACK_ENDED = [
  'down it goes',
  'a gentle tumble',
  'timber!',
  'oops, a wobble',
  'it toppled',
  'so nearly',
  'rest a moment',
  'tumbledown',
  'a cozy pile',
  'almost steady',
  'try again',
  'it leaned too far',
  'whoops-a-daisy',
  'steady next time',
  'a soft landing',
] as const;

/** The word beside a stone as it tips. */
export const STACK_TIP = [
  'whoops',
  'oh no',
  'tip!',
  'wobble',
  'careful',
  'uh oh',
  'oopsie',
  'tumble',
  'toppled',
  'oh dear',
  'wheee',
  'too far',
  'bump',
  'clunk',
  'off it goes',
] as const;
