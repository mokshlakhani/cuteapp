import { fruitPalette as F } from '../../design/fruitPalette';
import type { Shape } from './polyhedron';

/**
 * The fruits that float over the slice board. Each has its own outline
 * (an apple's broad shoulders, a lemon's pointed ends, a kiwi's long oval)
 * and a colour that runs all the way through (see material.ts — `code`
 * picks the branch), so every cut shows the right cross-section: an
 * orange's segments, an apple's star, a kiwi's ring of seeds. The little
 * things on top (a stem and leaf, a calyx, a dragon fruit's scales) are
 * in extras.ts.
 */
export interface SliceFruit {
  id: string;
  name: string;
  /** Shader branch: 0 watermelon, 1 orange, 2 apple, 3 kiwi, 4 peach, 5 dragon fruit, 6 lemon, 7 cantaloupe. */
  code: number;
  /** Radii (x, y up the core, z), in scene units. */
  radii: [number, number, number];
  /** Its outline turned round the core. */
  shape: Shape;
  /** A gloss level for its skin: 0 matte (kiwi, peach) to 1 shiny (apple). */
  shine: number;
  /** Cheeks on its face. */
  blush: string;
  /** The colour of its juice and the little bits that fly off a cut. */
  juice: string;
}

export const SLICE_FRUITS: SliceFruit[] = [
  // A navel orange: a touch flatter than round.
  { id: 'orange', name: 'orange', code: 1, radii: [1.5, 1.4, 1.5], shape: { e: 2.1, taper: 0 }, shine: 0.55, blush: '#FF8C6B', juice: F.orange.flesh },
  // Broad shoulders, narrowing to its base.
  { id: 'apple', name: 'apple', code: 2, radii: [1.52, 1.36, 1.52], shape: { e: 2.35, taper: 0.1 }, shine: 1, blush: '#FF9AA2', juice: F.apple.flesh },
  // A long, slightly flattened oval.
  { id: 'kiwi', name: 'kiwi', code: 3, radii: [1.14, 1.6, 1.04], shape: { e: 2.15, taper: 0 }, shine: 0.1, blush: '#F59C9A', juice: F.kiwi.flesh },
  // A small round "sugar baby" melon, just taller than wide.
  { id: 'watermelon', name: 'watermelon', code: 0, radii: [1.72, 1.78, 1.72], shape: { e: 2, taper: 0 }, shine: 0.8, blush: '#FF9AAE', juice: F.watermelon.flesh },
  // Round, a little lopsided by its crease.
  { id: 'peach', name: 'peach', code: 4, radii: [1.5, 1.46, 1.42], shape: { e: 2.05, taper: -0.04 }, shine: 0.15, blush: '#FF8F80', juice: F.peach.flesh },
  // An egg, wider below, under its scales.
  { id: 'dragonfruit', name: 'dragon fruit', code: 5, radii: [1.28, 1.66, 1.28], shape: { e: 1.9, taper: -0.1 }, shine: 0.6, blush: '#FF9ACB', juice: F.dragonfruit.flesh },
  // Pointed at both ends (its little tips are in extras).
  { id: 'lemon', name: 'lemon', code: 6, radii: [1.2, 1.52, 1.2], shape: { e: 1.6, taper: 0 }, shine: 0.55, blush: '#FFA98A', juice: F.lemon.flesh },
  { id: 'cantaloupe', name: 'cantaloupe', code: 7, radii: [1.68, 1.58, 1.68], shape: { e: 2.05, taper: 0 }, shine: 0.2, blush: '#FF8C7A', juice: F.goldenMelon.flesh },
];

/** A fruit at random, never the one just before. */
export function fruitFor(prev: SliceFruit | null, rnd = Math.random): SliceFruit {
  const pool = prev ? SLICE_FRUITS.filter((f) => f.id !== prev.id) : SLICE_FRUITS;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}
