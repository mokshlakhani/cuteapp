import { fruitPalette } from '../../design/fruitPalette';
import { SLICE_FRUITS, type SliceFruit } from '../slice/fruits';
import { MELON_A, MELON_R } from './shape';

/**
 * The fruits that can sit on the pop table: the same eight as in slice, and
 * they look exactly the same — the outline, skin, stem and leaf all come from
 * the slice fruit (`look`), so an apple is the same apple in every room.
 * What's described here is what only pop needs: how it gives way when it
 * bursts (a watermelon's brittle rind shatters, an orange's peel tears in a
 * few big flaps) and what's inside — pink flesh and black seeds, juicy
 * segments, creamy apple, a peach's sunny flesh.
 */

/** What the flesh breaks into: soft lumps, citrus segments, clusters of arils, curls of coconut meat. */
export type InsideKind = 'lumps' | 'segments' | 'arils' | 'meat';
/** Seeds: watermelon teardrops, flat melon seeds, juicy arils, tiny black specks, citrus pips. */
export type SeedKind = 'teardrop' | 'flat' | 'aril' | 'tiny' | 'pip' | 'none';

export interface PopFruit {
  id: string;
  name: string;
  /** The same fruit in slice: its outline, skin, gloss, stem and leaves. */
  look: SliceFruit;
  /** Length along its axis, relative to the watermelon's old long shape (from the slice fruit's proportions). */
  aspect: number;
  /** The skin's main colour and a darker accent, for the torn edges and the cracks just before it goes. */
  skin: { base: string; accent: string };
  /**
   * What a broken piece of the skin is made of, as you'd see at its torn
   * edge: how deep it goes (fraction of the radius) and the layers from the
   * skin inward (0 = just under the skin, 1 = the inside face). A watermelon
   * piece is green skin, a pale rind band, then red flesh; an orange's is a
   * thin peel and a thick white pith.
   */
  rind: { thick: number; layers: [number, string][] };
  /** The flesh, a lighter tone of it, and the inside face of the broken pieces. */
  flesh: string;
  fleshLight: string;
  lining: string;
  /** Seeds showing on the inside face (fraction of it, and colour): watermelon pips, kiwi and dragon fruit specks. */
  speckle?: { color: string; density: number };
  inside: InsideKind;
  /** Rind pieces it breaks into, and how much flesh comes out in lumps (× the watermelon's). */
  shards: [number, number];
  chunks: number;
  juice: { color: string; amount: number; mist: number };
  seeds: { kind: SeedKind; color: string; count: number; size: number };
  /** Little bits of pulp, and whether there are stringy strands of it too. */
  pulp: { color: string; count: number; strings: boolean };
  /** Blush on the faces of the bigger chunks. */
  blush: string;
}

const W = fruitPalette.watermelon;
const P = fruitPalette;

/** A pop fruit from its slice twin: same name and look, its length from the same proportions. */
function fruit(id: string, burst: Omit<PopFruit, 'id' | 'name' | 'look' | 'aspect' | 'blush'>): PopFruit {
  const look = SLICE_FRUITS.find((f) => f.id === id)!;
  const [rx, ry, rz] = look.radii;
  return { id, name: look.name, look, aspect: ((ry / Math.max(rx, rz)) * MELON_R) / MELON_A, blush: look.blush, ...burst };
}

export const POP_FRUITS: PopFruit[] = [
  fruit('watermelon', {
    skin: { base: W.skin, accent: W.stripe },
    rind: {
      thick: 0.34,
      layers: [
        [0, '#3E8F45'],
        [0.05, '#E4F0C2'],
        [0.28, W.rind],
        [0.4, '#FF9AA6'],
        [0.55, W.flesh],
      ],
    },
    flesh: W.flesh,
    fleshLight: W.fleshLight,
    lining: W.flesh,
    speckle: { color: W.seed, density: 0.035 },
    inside: 'lumps',
    shards: [20, 30],
    chunks: 0.85,
    juice: { color: '#FF5C70', amount: 1, mist: 0.3 },
    seeds: { kind: 'teardrop', color: W.seed, count: 1, size: 0.1 },
    pulp: { color: W.flesh, count: 1, strings: false },
  }),
  fruit('cantaloupe', {
    skin: { base: '#9A915A', accent: '#6E6A3E' },
    rind: {
      thick: 0.42,
      layers: [
        [0, '#A8A070'],
        [0.05, '#CFE3A6'],
        [0.14, '#FFB566'],
        [0.5, P.goldenMelon.flesh],
      ],
    },
    flesh: P.goldenMelon.flesh,
    fleshLight: P.goldenMelon.fleshLight,
    lining: '#FFAE5C',
    speckle: { color: '#F4E3B6', density: 0.05 },
    inside: 'lumps',
    shards: [16, 24],
    chunks: 0.6,
    juice: { color: '#FFB066', amount: 0.8, mist: 0.25 },
    seeds: { kind: 'flat', color: '#F4E3B6', count: 1.1, size: 0.1 },
    pulp: { color: '#FF9A3C', count: 0.8, strings: true },
  }),
  fruit('orange', {
    skin: { base: P.orange.peel, accent: '#DE6B0E' },
    rind: {
      thick: 0.14,
      layers: [
        [0, '#F37F18'],
        [0.22, '#FFB866'],
        [0.38, P.orange.pith],
      ],
    },
    flesh: P.orange.flesh,
    fleshLight: '#FFC163',
    lining: '#FFF1D6',
    inside: 'segments',
    shards: [9, 14],
    chunks: 1.3,
    juice: { color: '#FFA62E', amount: 1.8, mist: 0.55 },
    seeds: { kind: 'pip', color: '#F6E8C4', count: 0.25, size: 0.1 },
    pulp: { color: '#FFB547', count: 1.6, strings: false },
  }),
  fruit('lemon', {
    skin: { base: P.lemon.peel, accent: '#DDB000' },
    rind: {
      thick: 0.13,
      layers: [
        [0, '#EFC316'],
        [0.22, '#FFE985'],
        [0.38, P.lemon.pith],
      ],
    },
    flesh: P.lemon.flesh,
    fleshLight: '#FFF29A',
    lining: '#FFF9DD',
    inside: 'segments',
    shards: [9, 14],
    chunks: 1.3,
    juice: { color: '#FFE45A', amount: 1.8, mist: 0.6 },
    seeds: { kind: 'pip', color: '#F7F0CF', count: 0.3, size: 0.09 },
    pulp: { color: '#FFE96B', count: 1.6, strings: false },
  }),
  fruit('apple', {
    // A thin red skin over crisp, creamy flesh; brown pips from the core.
    skin: { base: P.apple.skin, accent: '#A81E2A' },
    rind: {
      thick: 0.12,
      layers: [
        [0, '#D8303C'],
        [0.12, '#FFF6DA'],
        [0.4, P.apple.flesh],
      ],
    },
    flesh: P.apple.flesh,
    fleshLight: '#FFF8E2',
    lining: '#FFF4D4',
    inside: 'lumps',
    shards: [8, 12],
    chunks: 1.1,
    juice: { color: '#FFF3D6', amount: 0.6, mist: 0.35 },
    seeds: { kind: 'pip', color: P.apple.seed, count: 0.45, size: 0.1 },
    pulp: { color: P.apple.flesh, count: 1.1, strings: false },
  }),
  fruit('peach', {
    // Velvet skin, juicy sunny flesh blushing red toward the pit.
    skin: { base: P.peach.skin, accent: '#C9452E' },
    rind: {
      thick: 0.1,
      layers: [
        [0, '#F2694C'],
        [0.25, '#FF9A50'],
        [0.5, P.peach.flesh],
      ],
    },
    flesh: P.peach.flesh,
    fleshLight: '#FFC873',
    lining: '#FFA445',
    speckle: { color: P.peach.blush, density: 0.03 },
    inside: 'lumps',
    shards: [8, 12],
    chunks: 1.2,
    juice: { color: '#FFB45A', amount: 1.3, mist: 0.45 },
    seeds: { kind: 'none', color: P.peach.pit, count: 0, size: 0 },
    pulp: { color: '#FFAE48', count: 1.3, strings: false },
  }),
  fruit('dragonfruit', {
    skin: { base: P.dragonfruit.skin, accent: '#9C1457' },
    rind: {
      thick: 0.38,
      layers: [
        [0, P.dragonfruit.skin],
        [0.07, '#F27AAE'],
        [0.15, '#FCEFF4'],
        [0.3, P.dragonfruit.flesh],
      ],
    },
    flesh: P.dragonfruit.flesh,
    fleshLight: '#FFFFFF',
    lining: '#FCF3F5',
    speckle: { color: P.dragonfruit.seed, density: 0.13 },
    inside: 'lumps',
    shards: [14, 22],
    chunks: 0.75,
    juice: { color: '#F6E3EC', amount: 0.7, mist: 0.2 },
    seeds: { kind: 'tiny', color: P.dragonfruit.seed, count: 2.2, size: 0.05 },
    pulp: { color: '#FFFFFF', count: 0.8, strings: false },
  }),
  fruit('kiwi', {
    skin: { base: '#7A5534', accent: '#4E3420' },
    rind: {
      thick: 0.36,
      layers: [
        [0, '#6E5130'],
        [0.05, '#A6D861'],
        [0.15, P.kiwi.flesh],
        [0.75, '#86C94C'],
      ],
    },
    flesh: P.kiwi.flesh,
    fleshLight: '#A8DC6E',
    lining: '#C9E9A2',
    speckle: { color: P.kiwi.seed, density: 0.11 },
    inside: 'lumps',
    shards: [14, 22],
    chunks: 0.75,
    juice: { color: '#9BD45A', amount: 0.8, mist: 0.3 },
    seeds: { kind: 'tiny', color: P.kiwi.seed, count: 2.5, size: 0.05 },
    pulp: { color: P.kiwi.core, count: 0.6, strings: false },
  }),
];

export const popFruit = (id: string) => POP_FRUITS.find((f) => f.id === id) ?? POP_FRUITS[0];

const BAG_KEY = 'softspot.pop.bag.v1';

/** The fruits still to come this round (ids), kept between visits. */
let bag: string[] = loadBag();

function loadBag(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BAG_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((id) => POP_FRUITS.some((f) => f.id === id)) : [];
  } catch {
    return [];
  }
}

function saveBag() {
  try {
    localStorage.setItem(BAG_KEY, JSON.stringify(bag));
  } catch {
    /* private mode: the order just won't survive a restart */
  }
}

/**
 * The next fruit for the table, dealt from a shuffled bag: every fruit comes
 * round once before any comes round again, in a fresh order each round, and
 * never the same fruit twice in a row (not even across the join between
 * rounds). The bag is kept, so a round carries on where you left it.
 */
export function nextPopFruit(prev: PopFruit | null, rnd = Math.random) {
  if (!bag.length) {
    bag = POP_FRUITS.map((f) => f.id);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (prev && bag.length > 1 && bag[0] === prev.id) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  const id = bag.shift()!;
  saveBag();
  return popFruit(id);
}

/** A fruit at random, without touching the room's bag (for the home card). */
export function anyPopFruit(rnd = Math.random) {
  return POP_FRUITS[Math.min(POP_FRUITS.length - 1, Math.floor(rnd() * POP_FRUITS.length))];
}
