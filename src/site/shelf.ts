/**
 * "Your shelf": what the game has quietly kept on this device. The website and
 * the game share an origin, so it reads the same localStorage the rooms write
 * (keys from core/best, wrap/memory and the pour room). Nothing
 * leaves the device.
 */
import { MEMORY_MIN } from '../rooms/wrap/memory';

export interface Kept {
  id: string;
  /** The game's name, as on its tile. */
  game: string;
  value: number;
  /** What the number counts, said kindly. */
  unit: (n: number) => string;
}

const read = (key: string, field: string): number | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')?.[field];
    return Number.isFinite(v) ? Math.floor(v) : null;
  } catch {
    return null;
  }
};

const plural = (one: string, many: string) => (n: number) => (n === 1 ? one : many);

/** Everything worth showing, in shelf order. Rooms you haven't played (or that keep nothing yet) are left out. */
export function readShelf(): Kept[] {
  const rows: (Kept | null)[] = [
    keep('wrap', 'bubbles', read('softspot.wrap.memory.v1', 'size'), plural('bubble in your next pattern', 'bubbles in your next pattern'), MEMORY_MIN + 2),
    keep('pour', 'pour', read('softspot.pour.v2', 'best'), plural('perfect pour in a row', 'perfect pours in a row')),
    keep('soap', 'soap', read('softspot.soap.v1', 'best'), plural('bubble held in a row', 'bubbles held in a row')),
    keep('stack', 'stack', read('softspot.stack.v1', 'best'), plural('stone tall', 'stones tall')),
  ];
  return rows.filter((r): r is Kept => r !== null);
}

/** A row, if there's something to show. Bubbles always keeps a pattern size, so it only shows once you've grown it. */
function keep(id: string, game: string, value: number | null, unit: Kept['unit'], from = 1): Kept | null {
  return value === null || value < from ? null : { id, game, value, unit };
}
