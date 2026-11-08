/** The little word beside each bubble: dealt so it's never the same twice running (see core/deck). Short, it sits by the bubble. */

/** Right on the ring. */
export const SOAP_PERFECT = [
  'perfect',
  'spot on',
  'just right',
  'lovely',
  'dreamy',
  'so round',
  'a beauty',
  'bang on',
  'exactly',
  'gorgeous',
  'what a bubble',
  'on the ring',
  'flawless',
  'sweet',
] as const;

/** Held, near the ring. */
export const SOAP_CLOSE = [
  'so close',
  'nearly',
  'close one',
  'almost',
  'nice one',
  'pretty close',
  'not bad',
  'very nice',
  'good one',
  'so near',
  'lovely try',
  'off it goes',
] as const;

/** Let go too soon: it popped. */
export const SOAP_SMALL = [
  'a little small',
  'too small',
  'tiny one',
  'a bit early',
  'wee bubble',
  'not quite',
  'oops, small',
  'blow longer',
  'a little more',
  'too soon',
  'pop!',
  'a mini one',
] as const;

/** Blown past the ring: it popped. */
export const SOAP_BIG = [
  'too big',
  'oops, too big',
  'pop!',
  'a big one',
  'too much air',
  'overblown',
  'a bit greedy',
  'whoosh, pop',
  'stop sooner',
  'ballooned',
  'burst!',
  'past the ring',
] as const;
