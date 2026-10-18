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
  /** Under the skin: how thick the rind is (fraction of the radius), and its colours at the torn edge. */
  rind: { thick: number; outer: string; inner: string };
  /** The flesh, a lighter tone of it, and the inside face of the rind pieces. */
  flesh: string;
  fleshLight: string;
  lining: string;
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
    rind: { thick: 0.16, outer: W.rind, inner: W.rind },
    flesh: W.flesh,
    fleshLight: W.fleshLight,
    lining: W.flesh,
    inside: 'lumps',
    shards: [20, 30],
    chunks: 1,
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
    rind: { thick: 0.1, outer: '#B9D59A', inner: '#D7E7B0' },
    flesh: '#FF9F45',
    fleshLight: '#FFC27F',
    lining: '#FFAE5C',
    inside: 'lumps',
    shards: [16, 24],
    chunks: 0.9,
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
    rind: { thick: 0.08, outer: '#D3E8A2', inner: '#E2F1BE' },
    flesh: '#B7E296',
    fleshLight: '#D4F0B7',
    lining: '#C4E8A6',
    inside: 'lumps',
    shards: [16, 24],
    chunks: 0.9,
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
    rind: { thick: 0.13, outer: '#FFD9A6', inner: '#FFF3DC' },
    flesh: '#FFA42B',
    fleshLight: '#FFC163',
    lining: '#FFF1D6',
    inside: 'segments',
    shards: [9, 14],
    chunks: 0.75,
    juice: { color: '#FFA62E', amount: 1.45, mist: 0.55 },
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
    rind: { thick: 0.12, outer: '#FFF0A6', inner: '#FFFBE6' },
    flesh: '#FFE55C',
    fleshLight: '#FFF29A',
    lining: '#FFF9DD',
    inside: 'segments',
    shards: [9, 14],
    chunks: 0.75,
    juice: { color: '#FFE45A', amount: 1.45, mist: 0.6 },
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
    rind: { thick: 0.14, outer: '#F3D9B5', inner: '#F8EBCF' },
    flesh: '#D8143C',
    fleshLight: '#FF5A78',
    lining: '#F6E5C4',
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
    rind: { thick: 0.07, outer: '#F48DBA', inner: '#F9B8D4' },
    flesh: '#FBF6F1',
    fleshLight: '#FFFFFF',
    lining: '#FCF3F5',
    inside: 'lumps',
    shards: [14, 22],
    chunks: 1,
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
    rind: { thick: 0.22, outer: '#5E3D24', inner: '#FFFDF5' },
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
    rind: { thick: 0.17, outer: '#FFB54D', inner: '#FFC46B' },
    flesh: '#FF9B2E',
    fleshLight: '#FFB65C',
    lining: '#FFA640',
    inside: 'lumps',
    shards: [14, 20],
    chunks: 0.7,
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
    rind: { thick: 0.05, outer: '#9ED05A', inner: '#A9D86A' },
    flesh: '#7DC443',
    fleshLight: '#A8DC6E',
    lining: '#86C94C',
    inside: 'lumps',
    shards: [14, 22],
    chunks: 1,
    juice: { color: '#9BD45A', amount: 0.8, mist: 0.3 },
    seeds: { kind: 'tiny', color: '#1E1A14', count: 2.5, size: 0.05 },
    pulp: { color: '#F3F6D4', count: 0.6, strings: false },
    blush: '#FF9AAE',
  },
];

export const popFruit = (id: string) => POP_FRUITS.find((f) => f.id === id) ?? POP_FRUITS[0];

/** A random fruit, never the one just popped. */
export function nextPopFruit(prev: PopFruit | null, rnd = Math.random) {
  const options = prev ? POP_FRUITS.filter((f) => f.id !== prev.id) : POP_FRUITS;
  return options[Math.min(options.length - 1, Math.floor(rnd() * options.length))];
}
