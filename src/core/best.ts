/** A room's high score, kept on this device. */
export function bestStore(key: string) {
  return {
    load() {
      try {
        const p = JSON.parse(localStorage.getItem(key) ?? '{}');
        return Number.isFinite(p.best) && p.best >= 0 ? Math.floor(p.best) : 0;
      } catch {
        return 0;
      }
    },
    save(best: number) {
      try {
        localStorage.setItem(key, JSON.stringify({ best }));
      } catch {
        /* private mode etc. */
      }
    },
  };
}
