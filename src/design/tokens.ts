/**
 * soft spot — design tokens.
 *
 * Every room (and every future room) pulls its colours, type, radii, motion
 * and lighting from here. Nothing in a room should hard-code a UI colour or
 * an easing curve; fruit/material colours live with the toy that owns them
 * but are tuned to sit inside this palette.
 */

export interface Theme {
  name: 'day' | 'dusk';
  /** A pale ground (dark outlines, white highlights) or a deep one (glowing edges, light ink). */
  light: boolean;
  /** Page background, top of the vertical wash. */
  bg: string;
  /** Page background, bottom of the vertical wash (and floor base). */
  bgDeep: string;
  /** Raised surfaces: buttons, cards, sheets. */
  surface: string;
  /** Slightly sunk surfaces: segmented-control track, pressed states. */
  surfaceSunk: string;
  /** Primary text & icon colour (warm cocoa, never pure black). */
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** Warm-tinted shadow base (r,g,b) — shadows are never grey. */
  shadowRgb: string;
  /** Strength multiplier applied to all contact shadows. */
  shadowStrength: number;
  /** Faces on toys: eye/mouth colour. */
  faceInk: string;
  /** Floor highlight line. */
  floorEdge: string;
  /** Paper grain opacity. */
  grain: number;
  /** Two soft colour glows over the wash: a rosy one up top, a cool one low down. */
  glowWarm: string;
  glowCool: string;
}

/** Soft pastel accents shared by UI tints, rubber bands and particles. */
export const pastel = {
  sage: '#BEDCB1',
  mint: '#C9E8D2',
  pink: '#F8BFC3',
  peach: '#FDCFAF',
  butter: '#FCE7A2',
  sky: '#C0DAEF',
  lilac: '#D9CAEE',
  berry: '#E98E8A', // desaturated red
  aqua: '#BCE6E7',
  clay: '#E7C6B0',
  honey: '#FBD787',
} as const;

export type PastelName = keyof typeof pastel;

export const themes: Record<Theme['name'], Theme> = {
  // A lamplit evening: deep mulberry falling to cocoa, with an amber lamp
  // glow up top and a terracotta ember low down. No blue anywhere: the
  // whole world is lit like a room with the lamps on. Cream ink holds 5:1.
  day: {
    name: 'day',
    light: false,
    bg: '#7E465B',
    bgDeep: '#502C39',
    surface: '#925B64',
    surfaceSunk: '#6D3D47',
    ink: '#FFF1E2',
    inkSoft: '#F6DCC8',
    inkFaint: '#D1A38F',
    shadowRgb: '54, 20, 22',
    shadowStrength: 1.2,
    faceInk: '#3C2127',
    floorEdge: 'rgba(255,226,196,0.2)',
    grain: 0.05,
    glowWarm: '#FEB46A',
    glowCool: '#D17456',
  },
  // The same room after dark: deeper, with the lamps glowing warmer.
  dusk: {
    name: 'dusk',
    light: false,
    bg: '#4C2A33',
    bgDeep: '#2B191F',
    surface: '#603B43',
    surfaceSunk: '#45282F',
    ink: '#FDEBDA',
    inkSoft: '#DFBFAB',
    inkFaint: '#A37E6F',
    shadowRgb: '21, 7, 9',
    shadowStrength: 1.35,
    faceInk: '#3C2127',
    floorEdge: 'rgba(255,214,170,0.12)',
    grain: 0.055,
    glowWarm: '#F0994C',
    glowCool: '#A34B37',
  },
};

/** Per-room tint applied over the shared background wash. */
export const roomTint = {
  home: pastel.butter,
  melon: pastel.sage,
  jelly: pastel.peach,
  wrap: pastel.sky,
  pour: pastel.lilac,
  slice: pastel.pink,
  soap: pastel.aqua,
  stack: pastel.clay,
  peel: pastel.honey,
} as const;

/** Rows on the shelf, two tiles to a row: every tile the same size. */
export const ROOM_ROWS = 4;

/** Each game's tile on the shelf, and the soft edge under it: earthy, muted, deep enough for cream titles. */
export const tile: Record<string, { face: string; edge: string }> = {
  melon: { face: '#AF4C41', edge: '#7b342b' },
  jelly: { face: '#497A63', edge: '#335846' },
  wrap: { face: '#7A6097', edge: '#54416b' },
  pour: { face: '#4A738D', edge: '#325063' },
  slice: { face: '#956722', edge: '#6c4912' },
  peel: { face: '#AD522E', edge: '#79371D' },
  soap: { face: '#A14E6D', edge: '#70344B' },
  stack: { face: '#557B43', edge: '#3C592E' },
};

export const type = {
  display: `'Fredoka', 'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`,
  text: `'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, sans-serif`,
  size: { title: 34, heading: 20, label: 15, caption: 13 },
  weight: { regular: 500, medium: 600, bold: 700 },
} as const;

export const radius = { xs: 10, sm: 14, md: 20, lg: 28, xl: 36, pill: 999 } as const;

/** Durations in ms. */
export const duration = { quick: 140, base: 260, calm: 480, room: 640 } as const;

/** Spring presets (stiffness, damping) used for both canvas and UI motion. */
export const springs = {
  /** UI presses, small settles. Barely overshoots. */
  soft: { stiffness: 260, damping: 22 },
  /** Toys settling after a poke. Visible jiggle. */
  wobbly: { stiffness: 210, damping: 9 },
  /** Slow breathing / idle drifts. */
  gentle: { stiffness: 60, damping: 12 },
  /** Elastic snaps (rubber band, jelly snap-back). */
  snap: { stiffness: 420, damping: 14 },
} as const;

/** CSS counterparts of the canvas curves, so DOM and canvas move alike. */
export const cssEase = {
  out: 'cubic-bezier(.22,1,.36,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  overshoot: 'cubic-bezier(.34,1.56,.64,1)',
} as const;

/**
 * One light for the whole world: soft, from the upper left. Highlights,
 * shading and shadows on every toy derive from this direction.
 */
export const light = { x: -0.42, y: -0.9 } as const;

/** Physical world constants shared by rooms. */
export const world = {
  gravity: 2000, // px/s²
  /** Floor sits at this fraction of the usable height (above the dock). */
  floorRatio: 0.8,
} as const;
