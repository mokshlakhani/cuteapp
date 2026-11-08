/**
 * What each game is called and what you do in it, in a few words. Plain data
 * with no room code behind it, so the home shelf (via rooms.ts) and the
 * website can share it without the website pulling in three.js.
 */
export interface CatalogEntry {
  /** A room id, as in rooms.ts and howto.ts. */
  id: string;
  name: string;
  /** What you do in it, in a few words, for its tile. */
  blurb: string;
}

export const CATALOG: CatalogEntry[] = [
  { id: 'melon', name: 'pop', blurb: 'squeeze it till it pops' },
  { id: 'jelly', name: 'jelly', blurb: 'squish a wobbly jelly' },
  { id: 'wrap', name: 'bubbles', blurb: 'remember the pattern' },
  { id: 'pour', name: 'pour', blurb: 'pour a cozy drink' },
  { id: 'slice', name: 'slice', blurb: 'cut a little snack' },
  { id: 'peel', name: 'peel', blurb: 'one long, slow peel' },
  { id: 'soap', name: 'soap', blurb: 'blow a gentle bubble' },
  { id: 'stack', name: 'stack', blurb: 'stack a cozy cairn' },
];

export const entry = (id: string): CatalogEntry => {
  const e = CATALOG.find((c) => c.id === id);
  if (!e) throw new Error(`no game called ${id}`);
  return e;
};
