/** What slice says when a fruit falls apart: dealt so it's never the same twice running (see core/deck). */

/** Exactly the order. */
export const SLICE_PERFECT = [
  'yum, just right',
  'perfect slices',
  'a lovely snack',
  'spot on',
  'exactly right',
  'neat as can be',
  'chef’s kiss',
  'beautifully cut',
  'right on the number',
  'what a slicer',
  'snack time',
  'clean cuts',
  'just as asked',
  'nailed the order',
  'tidy little pieces',
  'sharp work',
] as const;

/** More pieces than the order. */
export const SLICE_OVER = [
  'a few extra',
  'bonus bites',
  'extra snacks',
  'a little over',
  'more to share',
  'generous slicing',
  'one cut too keen',
  'plenty to go round',
  'past the order',
  'extra crumbs',
  'over by a bit',
  'snacks for later',
] as const;

/** One piece short. */
export const SLICE_CLOSE = [
  'so close',
  'nearly',
  'one piece shy',
  'almost there',
  'just short',
  'a whisker off',
  'oh, so near',
  'nearly perfect',
  'one more cut away',
  'very nearly',
] as const;

/** More than one piece short. */
export const SLICE_SHORT = [
  'a good start',
  'room for more',
  'a chunky snack',
  'big bites',
  'a hearty cut',
  'a little short',
  'keep going next time',
  'chunky pieces',
  'a rustic cut',
  'a few short',
] as const;

/** A nudge under a short one. */
export const SLICE_TIPS = [
  'turn it, and cross your cuts',
  'cross every cut you’ve made',
  'turn it between cuts',
  'cut across the other cuts',
  'swipe beside it to turn it',
] as const;
