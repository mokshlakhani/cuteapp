/** The stars a room has quietly kept. Storage may be unavailable: never throw. */
export function keepStars(room: string, earned: number) {
  const key = `softspot.${room}.v1`;
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? '{}');
    const stars = Number.isFinite(p.stars) && p.stars >= 0 ? Math.floor(p.stars) : 0;
    localStorage.setItem(key, JSON.stringify({ stars: stars + earned }));
  } catch {
    /* private mode etc. */
  }
}
