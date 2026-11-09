/**
 * The website's view of the shelf: each game's name and blurb (shared with the
 * game's home via app/catalog), its tile colours (design/tokens), how to play
 * it (app/howto), and a screenshot captured from the real game
 * (scripts/capture-shots.mjs). Only plain data is imported here, never room
 * code, so the website stays light.
 */
import { CATALOG } from '../app/catalog';
import { howTo, type HowTo } from '../app/howto';
import { tile } from '../design/tokens';
import type { IconName } from '../design/icons';

import melonShot from './shots/melon.webp';
import jellyShot from './shots/jelly.webp';
import wrapShot from './shots/wrap.webp';
import pourShot from './shots/pour.webp';
import sliceShot from './shots/slice.webp';
import peelShot from './shots/peel.webp';
import soapShot from './shots/soap.webp';
import stackShot from './shots/stack.webp';

export interface Toy {
  id: string;
  name: string;
  blurb: string;
  face: string;
  edge: string;
  shot: string;
  /** Where the toy sits in its screenshot, for cropping (CSS object-position y). */
  focus: string;
  /** How your hands play it. */
  controls: string;
  /** The icon for that gesture. */
  gesture: IconName;
  /** What it keeps, if anything: said kindly. */
  keeps: string;
  howto: HowTo;
}

const EXTRA: Record<string, Pick<Toy, 'shot' | 'focus' | 'controls' | 'gesture' | 'keeps'>> = {
  melon: { shot: melonShot, focus: '62%', controls: 'tap, or swipe down', gesture: 'press', keeps: 'just for fun' },
  jelly: { shot: jellyShot, focus: '52%', controls: 'grab, flick, draw to slice', gesture: 'hand', keeps: 'just for fun' },
  wrap: { shot: wrapShot, focus: '50%', controls: 'press and let go', gesture: 'press', keeps: 'patterns grow as you remember' },
  pour: { shot: pourShot, focus: '62%', controls: 'press and hold · space', gesture: 'press', keeps: 'your best streak' },
  slice: { shot: sliceShot, focus: '52%', controls: 'swipe across', gesture: 'knife', keeps: 'a new order every fruit' },
  peel: { shot: peelShot, focus: '50%', controls: 'trace slow circles', gesture: 'turn', keeps: 'as few strips as you can' },
  soap: { shot: soapShot, focus: '55%', controls: 'press and hold', gesture: 'press', keeps: 'your best run' },
  stack: { shot: stackShot, focus: '60%', controls: 'drag, then let go', gesture: 'hand', keeps: 'your tallest tower' },
};

export const TOYS: Toy[] = CATALOG.map((c) => {
  const how = howTo(c.id);
  if (!how) throw new Error(`no how-to for ${c.id}`);
  return { ...c, ...tile[c.id], ...EXTRA[c.id], howto: how };
});

export const toy = (id: string) => TOYS.find((t) => t.id === id) ?? null;

/** The game's address, opening straight into one toy if asked. */
/** The game lives at the site's root; the website is in site/, one folder down. */
export const playUrl = (id?: string) => (id ? `../?room=${encodeURIComponent(id)}` : '../');
