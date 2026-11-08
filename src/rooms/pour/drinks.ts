/** What can be poured. Colours are tuned to sit inside the pastel palette. */
export interface Drink {
  id: 'milk' | 'cola' | 'boba' | 'lemonade' | 'cocoa';
  name: string;
  /** The liquid near the top, and deeper down the glass. */
  color: string;
  deep: string;
  /** The froth on top. */
  foam: string;
  /** Foam made per unit poured, at a normal pouring speed (0 = none). */
  foamy: number;
  /** Bubbles rising through it, and a fizz you can hear. */
  fizz: boolean;
  /** Already waiting in the glass: tapioca pearls, or ice and a lemon wheel. */
  extra?: 'pearls' | 'ice';
  /** Where its fill line can be drawn; cola's stays low enough that its foam fits. */
  lines: [number, number];
  /** What it's poured from: the glass jug, a lemonade pitcher, a glass bottle, or a milk carton. */
  from: Pourer;
  /** Dark enough that the glass's face is drawn light over it. */
  dark?: boolean;
  /**
   * How it pours — each drink has its own little trick to learn:
   * how fast it comes (× the jug's usual flow), and how close to the line
   * counts as spot on.
   */
  flow: number;
  window: number;
  /** Thick: it starts slow and comes faster the longer you hold (s to full speed). */
  ramp?: number;
  /** It comes in glugs, one every this many seconds. */
  glug?: number;
  /** Hot: steam fogs the glass as it fills and hides the line, so remember where it was. */
  steam?: boolean;
  /** How fast its froth settles (fraction a second); slower means a longer wait. */
  foamFade?: number;
}

export type Pourer = 'jug' | 'pitcher' | 'bottle' | 'carton';

export const DRINKS: Drink[] = [
  {
    id: 'milk',
    name: 'milk',
    color: '#FBF5EA',
    deep: '#EADBC4',
    foam: '#FFFFFF',
    foamy: 0.05,
    fizz: false,
    lines: [0.45, 0.85],
    from: 'carton',
    // The gentle one: a slow steady pour and room either side of the line.
    flow: 0.85,
    window: 0.065,
  },
  {
    id: 'cola',
    name: 'cola',
    color: '#6A2E18',
    deep: '#2E120A',
    foam: '#EBD3B8',
    foamy: 0.45,
    fizz: true,
    lines: [0.42, 0.68],
    from: 'bottle',
    // A big fizzy head that takes its time to settle: stop low and wait.
    flow: 1,
    window: 0.055,
    foamFade: 0.6,
    dark: true,
  },
  {
    id: 'boba',
    name: 'bubble tea',
    color: '#E9CDA8',
    deep: '#C99C6E',
    foam: '#FBF1E2',
    foamy: 0.18,
    fizz: false,
    extra: 'pearls',
    // Thick tea: a trickle at first that builds the longer you hold.
    flow: 1,
    window: 0.05,
    ramp: 1.6,
    lines: [0.45, 0.85],
    from: 'jug',
  },
  {
    id: 'lemonade',
    name: 'lemonade',
    color: '#FBEA9C',
    deep: '#F1CD58',
    foam: '#FFFBEA',
    foamy: 0.1,
    fizz: false,
    extra: 'ice',
    lines: [0.45, 0.85],
    from: 'pitcher',
    // The ice in the pitcher makes it come in glugs, with a trickle between.
    flow: 1,
    window: 0.05,
    glug: 0.48,
  },
  {
    // The coziest one: warm hot cocoa with a milky froth on top.
    id: 'cocoa',
    name: 'hot cocoa',
    color: '#9A5F3E',
    deep: '#5A321F',
    foam: '#F4DFC6',
    foamy: 0.28,
    fizz: false,
    lines: [0.45, 0.78],
    from: 'jug',
    dark: true,
    // Hot: steam fogs the glass as it fills and hides the line. Look before you pour.
    flow: 0.9,
    window: 0.055,
    steam: true,
  },
];

export const drink = (id: string) => DRINKS.find((d) => d.id === id) ?? DRINKS[0];
