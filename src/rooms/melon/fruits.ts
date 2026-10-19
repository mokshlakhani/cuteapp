import { fruitPalette } from '../../design/fruitPalette';

/**
 * The fruits that can sit on the pop table. Each one is described the way it
 * really is: its shape and skin, what's under the skin, how it gives way when
 * it bursts (a watermelon's brittle rind shatters, an orange's peel tears in
 * a few big flaps, a coconut's shell cracks into a handful of hard pieces),
 * and what's inside — pink flesh and black seeds, juicy segments, ruby arils,
 * stringy pulp and flat seeds, white meat and coconut water.
 */

/** How the skin is painted (see melonMaterial). */
export const PATTERNS = ['stripes', 'net', 'peel', 'smooth', 'leather', 'scales', 'fuzz', 'ribs', 'husk'] as const;
export type SkinPattern = (typeof PATTERNS)[number];

export type StemKind = 'vine' | 'nub' | 'leafy' | 'crown' | 'pumpkin' | 'none';
/** What the flesh breaks into: soft lumps, citrus segments, clusters of arils, curls of coconut meat. */
export type InsideKind = 'lumps' | 'segments' | 'arils' | 'meat';
/** Seeds: watermelon teardrops, flat melon/pumpkin seeds, juicy arils, tiny black specks, citrus pips. */
export type SeedKind = 'teardrop' | 'flat' | 'aril' | 'tiny' | 'pip' | 'none';
/** The outline along its length: an ellipse, or a lemon's pointed ends. */
export type Profile = 'ellipse' | 'lemon';

export interface PopFruit {
  id: string;
  name: string;
  /** Length along its axis, relative to the watermelon (round fruits are shorter). */
  aspect: number;
  profile: Profile;
  /** Ribs pressed into the surface (count around, depth as a fraction of the radius). */
  ribs?: { n: number; depth: number };
  skin: {
    pattern: SkinPattern;
    /** Main colour, a lighter one, and an accent (stripes, net, scale tips, fibres). */
    base: string;
    light: string;
    accent: string;
    roughness: number;
    clearcoat: number;
    sheen: number;
  };
  stem: StemKind;
  /**
   * What a broken piece of the skin is made of, as you'd see at its torn
   * edge: how deep it goes (fraction of the radius) and the layers from the
   * skin inward (0 = just under the skin, 1 = the inside face). A watermelon
   * piece is green skin, a pale rind band, then red flesh; an orange's is a
   * thin peel and a thick white pith; a coconut's is husk, a dark shell and
   * white meat.
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

export const POP_FRUITS: PopFruit[] = [
  {
    id: 'watermelon',
    name: 'watermelon',
    aspect: 1,
    profile: 'ellipse',
    skin: { pattern: 'stripes', base: W.skin, light: W.skinLight, accent: W.stripe, roughness: 0.38, clearcoat: 0.7, sheen: 0.15 },
    stem: 'vine',
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
    blush: '#FF9AAE',
  },
  {
    id: 'cantaloupe',
    name: 'cantaloupe',
    aspect: 0.8,
    profile: 'ellipse',
    ribs: { n: 10, depth: 0.018 },
    skin: { pattern: 'net', base: '#C9B57E', light: '#EFE3BE', accent: '#93A866', roughness: 0.75, clearcoat: 0.1, sheen: 0.3 },
    stem: 'nub',
    rind: {
      thick: 0.42,
      layers: [
        [0, '#A8B07A'],
        [0.05, '#CFE3A6'],
        [0.14, '#FFB566'],
        [0.5, '#FF9F45'],
      ],
    },
    flesh: '#FF9F45',
    fleshLight: '#FFC27F',
    lining: '#FFAE5C',
    speckle: { color: '#F4E3B6', density: 0.05 },
    inside: 'lumps',
    shards: [16, 24],
    chunks: 0.6,
    juice: { color: '#FFB066', amount: 0.8, mist: 0.25 },
    seeds: { kind: 'flat', color: '#F4E3B6', count: 1.1, size: 0.1 },
    pulp: { color: '#FF9A3C', count: 0.8, strings: true },
    blush: '#FF9E7A',
  },
  {
    id: 'honeydew',
    name: 'honeydew',
    aspect: 0.86,
    profile: 'ellipse',
    skin: { pattern: 'smooth', base: '#DCE8AC', light: '#F2F7D8', accent: '#C2D394', roughness: 0.42, clearcoat: 0.45, sheen: 0.2 },
    stem: 'nub',
    rind: {
      thick: 0.4,
      layers: [
        [0, '#C9D69A'],
        [0.04, '#E9F4CA'],
        [0.12, '#C9ECA8'],
        [0.5, '#B7E296'],
      ],
    },
    flesh: '#B7E296',
    fleshLight: '#D4F0B7',
    lining: '#C6E9A8',
    speckle: { color: '#F3EBC6', density: 0.04 },
    inside: 'lumps',
    shards: [16, 24],
    chunks: 0.6,
    juice: { color: '#CDEDAA', amount: 0.85, mist: 0.25 },
    seeds: { kind: 'flat', color: '#F3EBC6', count: 1, size: 0.09 },
    pulp: { color: '#CBE8A4', count: 0.7, strings: true },
    blush: '#FFA9A0',
  },
  {
    id: 'orange',
    name: 'orange',
    aspect: 0.74,
    profile: 'ellipse',
    skin: { pattern: 'peel', base: '#F7861E', light: '#FFA947', accent: '#DE6B0E', roughness: 0.55, clearcoat: 0.35, sheen: 0.1 },
    stem: 'leafy',
    rind: {
      thick: 0.14,
      layers: [
        [0, '#F37F18'],
        [0.22, '#FFB866'],
        [0.38, '#FFF3DC'],
      ],
    },
    flesh: '#FFA42B',
    fleshLight: '#FFC163',
    lining: '#FFF1D6',
    inside: 'segments',
    shards: [9, 14],
    chunks: 1.3,
    juice: { color: '#FFA62E', amount: 1.8, mist: 0.55 },
    seeds: { kind: 'pip', color: '#F6E8C4', count: 0.25, size: 0.1 },
    pulp: { color: '#FFB547', count: 1.6, strings: false },
    blush: '#FF8A5C',
  },
  {
    id: 'lemon',
    name: 'lemon',
    aspect: 0.86,
    profile: 'lemon',
    skin: { pattern: 'peel', base: '#F4C91C', light: '#FFE45E', accent: '#DDB000', roughness: 0.5, clearcoat: 0.4, sheen: 0.1 },
    stem: 'leafy',
    rind: {
      thick: 0.13,
      layers: [
        [0, '#EFC316'],
        [0.22, '#FFE985'],
        [0.38, '#FFFBE6'],
      ],
    },
    flesh: '#FFE55C',
    fleshLight: '#FFF29A',
    lining: '#FFF9DD',
    inside: 'segments',
    shards: [9, 14],
    chunks: 1.3,
    juice: { color: '#FFE45A', amount: 1.8, mist: 0.6 },
    seeds: { kind: 'pip', color: '#F7F0CF', count: 0.3, size: 0.09 },
    pulp: { color: '#FFE96B', count: 1.6, strings: false },
    blush: '#FFA07A',
  },
  {
    id: 'pomegranate',
    name: 'pomegranate',
    aspect: 0.78,
    profile: 'ellipse',
    skin: { pattern: 'leather', base: '#C42539', light: '#E8635F', accent: '#86162A', roughness: 0.5, clearcoat: 0.5, sheen: 0.15 },
    stem: 'crown',
    rind: {
      thick: 0.17,
      layers: [
        [0, '#A81E30'],
        [0.18, '#E8C9A2'],
        [0.4, '#F6E5C4'],
      ],
    },
    flesh: '#D8143C',
    fleshLight: '#FF5A78',
    lining: '#F6E5C4',
    speckle: { color: '#D8143C', density: 0.09 },
    inside: 'arils',
    shards: [7, 12],
    chunks: 0.7,
    juice: { color: '#C8103A', amount: 0.9, mist: 0.2 },
    seeds: { kind: 'aril', color: '#E5163F', count: 2.4, size: 0.13 },
    pulp: { color: '#F6E5C4', count: 0.6, strings: false },
    blush: '#FF9AAE',
  },
  {
    id: 'dragonfruit',
    name: 'dragon fruit',
    aspect: 0.95,
    profile: 'ellipse',
    skin: { pattern: 'scales', base: '#E0237B', light: '#F45E9F', accent: '#7DBF4A', roughness: 0.4, clearcoat: 0.55, sheen: 0.15 },
    stem: 'none',
    rind: {
      thick: 0.38,
      layers: [
        [0, '#E0237B'],
        [0.07, '#F27AAE'],
        [0.15, '#FCEFF4'],
        [0.3, '#FBF6F1'],
      ],
    },
    flesh: '#FBF6F1',
    fleshLight: '#FFFFFF',
    lining: '#FCF3F5',
    speckle: { color: '#1C1416', density: 0.13 },
    inside: 'lumps',
    shards: [14, 22],
    chunks: 0.75,
    juice: { color: '#F6E3EC', amount: 0.7, mist: 0.2 },
    seeds: { kind: 'tiny', color: '#1C1416', count: 2.2, size: 0.05 },
    pulp: { color: '#FFFFFF', count: 0.8, strings: false },
    blush: '#FF9AC4',
  },
  {
    id: 'coconut',
    name: 'coconut',
    aspect: 0.86,
    profile: 'ellipse',
    skin: { pattern: 'husk', base: '#7A5232', light: '#A27650', accent: '#4A2F1B', roughness: 0.95, clearcoat: 0, sheen: 0.6 },
    stem: 'none',
    rind: {
      thick: 0.3,
      layers: [
        [0, '#7A5232'],
        [0.42, '#6B4A2E'],
        [0.5, '#3A2414'],
        [0.58, '#3A2414'],
        [0.64, '#FFFDF5'],
      ],
    },
    flesh: '#FFFDF5',
    fleshLight: '#F3EEE2',
    lining: '#FFFDF5',
    inside: 'meat',
    shards: [5, 9],
    chunks: 0.45,
    juice: { color: '#F2EFE8', amount: 1.2, mist: 0.4 },
    seeds: { kind: 'none', color: '#ffffff', count: 0, size: 0 },
    pulp: { color: '#FFFFFF', count: 0.5, strings: false },
    blush: '#FFB3A0',
  },
  {
    id: 'pumpkin',
    name: 'pumpkin',
    aspect: 0.72,
    profile: 'ellipse',
    ribs: { n: 10, depth: 0.06 },
    skin: { pattern: 'ribs', base: '#F2871A', light: '#FFAD48', accent: '#C2600A', roughness: 0.5, clearcoat: 0.3, sheen: 0.1 },
    stem: 'pumpkin',
    rind: {
      thick: 0.32,
      layers: [
        [0, '#D9700E'],
        [0.07, '#FFB54D'],
        [0.4, '#FF9B2E'],
      ],
    },
    flesh: '#FF9B2E',
    fleshLight: '#FFB65C',
    lining: '#FFA640',
    speckle: { color: '#FBF3DC', density: 0.035 },
    inside: 'lumps',
    shards: [14, 20],
    chunks: 0.45,
    juice: { color: '#FFAA45', amount: 0.45, mist: 0.1 },
    seeds: { kind: 'flat', color: '#FBF3DC', count: 1.3, size: 0.14 },
    pulp: { color: '#F7931E', count: 1.2, strings: true },
    blush: '#FF8F6B',
  },
  {
    id: 'kiwi',
    name: 'kiwi',
    aspect: 0.9,
    profile: 'ellipse',
    skin: { pattern: 'fuzz', base: '#8E6B3D', light: '#A98654', accent: '#6A4E2E', roughness: 0.95, clearcoat: 0, sheen: 0.9 },
    stem: 'none',
    rind: {
      thick: 0.36,
      layers: [
        [0, '#6E5130'],
        [0.05, '#A6D861'],
        [0.15, '#7DC443'],
        [0.75, '#86C94C'],
      ],
    },
    flesh: '#7DC443',
    fleshLight: '#A8DC6E',
    lining: '#C9E9A2',
    speckle: { color: '#1E1A14', density: 0.11 },
    inside: 'lumps',
    shards: [14, 22],
    chunks: 0.75,
    juice: { color: '#9BD45A', amount: 0.8, mist: 0.3 },
    seeds: { kind: 'tiny', color: '#1E1A14', count: 2.5, size: 0.05 },
    pulp: { color: '#F3F6D4', count: 0.6, strings: false },
    blush: '#FF9AAE',
  },
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
