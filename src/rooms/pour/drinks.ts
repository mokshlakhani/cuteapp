/** What can be poured. Colours are tuned to sit inside the pastel palette. */
export interface Drink {
  id: 'milk' | 'soda';
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
}

export const DRINKS: Drink[] = [
  { id: 'milk', name: 'milk', color: '#FBF5EA', deep: '#EADBC4', foam: '#FFFFFF', foamy: 0.05, fizz: false },
  { id: 'soda', name: 'peach soda', color: '#F8BC8A', deep: '#EC8F5C', foam: '#FFF4E8', foamy: 2.3, fizz: true },
];

export const drink = (id: string) => DRINKS.find((d) => d.id === id) ?? DRINKS[0];
