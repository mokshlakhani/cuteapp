/**
 * How to play each toy: what the help card (the ? button) says. Plain, kind
 * and complete enough that nobody has to guess — but nothing here is a rule
 * you can break: every toy is fine to just mess about with.
 */
export interface HowTo {
  /** A room id from rooms.ts. */
  id: string;
  /** One line: what you're doing here. */
  goal: string;
  /** How to play, step by step. */
  steps: string[];
  /** Good to know: the finer points. */
  tips: string[];
}

export const HOWTO: HowTo[] = [
  {
    id: 'melon',
    goal: 'Snap rubber bands round a fruit, one by one, until it bursts.',
    steps: [
      'Tap the fruit, or swipe down across it, to snap a rubber band round its middle.',
      'Every band pinches it a little tighter: it squishes into a peanut shape, gets nervous, and starts to creak.',
      'Keep adding bands. Nobody knows which one will be too many — that’s the fun.',
      'When it bursts, poke the pieces around. They pop away after a moment and a new fruit drops in.',
    ],
    tips: [
      'The number at the top counts the bands on the fruit.',
      'Each fruit bursts its own way — watermelon, orange, coconut, pomegranate and more.',
    ],
  },
  {
    id: 'jelly',
    goal: 'Squish, slice and melt soft fruit jellies on a cloth.',
    steps: [
      'Use the switch at the bottom to pick your hand or the knife.',
      'With your hand: grab a jelly to slide it around, flick it to toss it, or twist it.',
      'With the knife: draw a line right across a jelly to slice it in two.',
      'Push two pieces of the same fruit together and they melt back into one.',
      'Tap + to put another fruit on the cloth.',
    ],
    tips: [
      'The sliders button opens settings: make jellies wobblier or firmer, livelier or more syrupy, switch on slow motion, see inside them, pause, or give everything a nudge.',
      'Pieces too small to cut can still be melted together. If the cloth gets full, melt a few to make room.',
    ],
  },
  {
    id: 'wrap',
    goal: 'A memory game on bubble wrap: remember which bubbles glow, then pop just those.',
    steps: [
      'A fresh sheet unrolls and, after a moment, a pattern of bubbles glows gold. Remember where they are — the glow doesn’t last long.',
      'When the glow fades, pop the bubbles you remember: press one and let go to pop it.',
      'Only the bubble under your finger when you let go pops, so if you change your mind, slide off before letting go and it puffs back up.',
      'When you think you have them all, tap done.',
    ],
    tips: [
      'Bubbles you got right shine gold, ones you missed get a dashed gold ring, and ones popped by mistake get a coral ring. Up top, it says how many of the pattern you got.',
      'Get every one, with no extras, and the next pattern is a bubble bigger. A fuzzy round makes it a bubble smaller.',
      'The result stays a few seconds before the next sheet; tap anywhere to move on sooner.',
      'The three buttons beside done pick the wrap: lots of small bubbles, the usual size, or a few big ones. A new sheet of that size unrolls straight away.',
      'Each new sheet comes in a different colour of film.',
    ],
  },
  {
    id: 'pour',
    goal: 'Fill each glass right to the line etched on it.',
    steps: [
      'Press and hold anywhere to tip the jug and pour. Let go to stop.',
      'The drink settles for a moment, then the glass is judged. Stopping close to the line — a little over or a little under — counts as perfect.',
      'Every perfect pour in a row adds to your streak, and the jug pours a touch faster each time.',
      'A miss simply starts the streak over. Your best streak is kept.',
    ],
    tips: [
      'What’s already falling keeps falling after you let go, so stop just before the line.',
      'Every drink pours its own way:',
      'Milk is slow and gentle, with the most room either side of the line.',
      'Cola froths up. Stop low and wait for the foam to settle.',
      'Bubble tea starts as a trickle and speeds up the longer you hold.',
      'Lemonade comes in glugs with a thin trickle between them: wait out a glug, then creep up to the line.',
      'Hot cocoa steams up the glass and hides the line, so note where it is before you pour.',
      'Pour too much and it spills over the rim — no harm done, a fresh glass is on its way.',
    ],
  },
  {
    id: 'slice',
    goal: 'Cut each fruit into exactly the number of pieces it asks for.',
    steps: [
      'The order is shown at the top, like “8 little pieces · 3 cuts, if you can”.',
      'Swipe across the fruit to cut it. The knife follows your swipe exactly.',
      'Swipe beside the fruit (not over it) to turn it, so your next cut goes a different way through it.',
      'The pieces hold together until your last cut, then the fruit falls apart on the board and is counted.',
    ],
    tips: [
      'The trick is to cross every cut you’ve already made: that’s how few cuts make many pieces.',
      'A cut that would only shave off a sliver doesn’t count.',
      'Land exactly on the number and you get a little fanfare; otherwise it tells you how close you came.',
    ],
  },
  {
    id: 'peel',
    goal: 'Peel the whole fruit in as few long strips as you can, keeping your pace in the green.',
    steps: [
      'Trace circles with your finger round the ring, either way round. The fruit turns with you, a little more than your finger does, and the skin comes away in one long, curly strip.',
      'The pace meter under the fruit shows how fast you’re going: the bead is your pace, the green zone is the pace the strip is happy at, and the red either side is too slow or too fast.',
      'Keep the bead in the green. Too fast and the strip pulls tight; too slow and it sags under its own weight.',
      'Stay in the red too long and the strip snaps, and a new one starts where it stopped. Keep circling until the fruit is clean.',
    ],
    tips: [
      'The green zone wanders as you go — quicker here, gentler there — so watch it and adjust.',
      'It also gets narrower as the strip grows long, so the end of a fruit takes the most care.',
      'Thinner strips want a gentler pace overall.',
      'Lift your finger to rest: the peel waits for you, and you get a moment to get going again.',
      'The fruit always comes clean; one unbroken strip gets a little fanfare.',
    ],
  },
  {
    id: 'soap',
    goal: 'Blow each bubble to exactly the size of the ring.',
    steps: [
      'Press and hold anywhere to blow. A bubble swells out of the wand and its note climbs as it grows.',
      'You’ll hear a soft ding when it reaches the ring.',
      'Let go to set it free: it pinches off and floats away, and the next ring is ready at once.',
      'Let go too early or blow too far past the ring and the bubble pops, which ends your run.',
    ],
    tips: [
      'The number at the top is how many bubbles in a row have held, with your best underneath.',
      'Every bubble grows at its own pace, swelling and easing, so watch it rather than counting.',
      'Tap a floating bubble to pop it, just because.',
    ],
  },
  {
    id: 'stack',
    goal: 'Build the tallest tower of stones you can.',
    steps: [
      'A stone hangs above the board. Drag anywhere to move it left and right.',
      'Let go to drop it onto the tower.',
      'The tower stands as long as each stone’s weight rests over the stone beneath it.',
      'When a stone tips, the view glides back down what you built and a new tower begins.',
    ],
    tips: [
      'The tower sways more as it grows, so time your drop: let go a little early, or wait for it to swing back.',
      'Once the tower nears the top of the screen, the view climbs with it.',
      'Your tallest tower is kept as your best.',
    ],
  },
];

export const howTo = (id: string) => HOWTO.find((h) => h.id === id) ?? null;
