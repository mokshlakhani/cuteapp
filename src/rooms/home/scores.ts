/** What the shelf shows of how you've done, read from what each room keeps. */

const KEPT: Record<string, string> = {
  soap: 'softspot.soap.v1',
  stack: 'softspot.stack.v1',
  pour: 'softspot.pour.v2',
};

/** A room's best, or null if it doesn't keep one or there's nothing yet. Storage may be unavailable: never throw. */
export function bestFor(id: string) {
  const key = KEPT[id];
  if (!key) return null;
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}')?.best;
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : null;
  } catch {
    return null;
  }
}
