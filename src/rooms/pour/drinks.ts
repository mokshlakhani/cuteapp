/** What can be poured. Colours are tuned to sit inside the pastel palette. */
export interface Drink {
  id: 'milk' | 'cola' | 'boba' | 'lemonade';
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
  },
];

export const drink = (id: string) => DRINKS.find((d) => d.id === id) ?? DRINKS[0];
