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
  sage: '#BFD9B4',
  mint: '#CBE6D3',
  pink: '#F4C3C6',
  peach: '#F8D0B4',
  butter: '#F6E4A8',
  sky: '#C3DAEC',
  lilac: '#D9CCEC',
  berry: '#E39490', // desaturated red
  aqua: '#BFE3E4',
  clay: '#E3C7B4',
  honey: '#F3D48F',
} as const;

export type PastelName = keyof typeof pastel;

export const themes: Record<Theme['name'], Theme> = {
  // A lamplit evening: deep mulberry falling to cocoa, with an amber lamp
  // glow up top and a terracotta ember low down. No blue anywhere: the
  // whole world is lit like a room with the lamps on. Cream ink holds 5:1.
  day: {
    name: 'day',
    light: false,
    bg: '#7A4A5C',
    bgDeep: '#4E2E3A',
    surface: '#8E5F66',
    surfaceSunk: '#6A4049',
    ink: '#FFF1E2',
    inkSoft: '#F3DCCB',
    inkFaint: '#CDA593',
    shadowRgb: '52, 22, 24',
    shadowStrength: 1.2,
    faceInk: '#3A2328',
    floorEdge: 'rgba(255,226,196,0.2)',
    grain: 0.05,
    glowWarm: '#F4B474',
    glowCool: '#C9785E',
  },
  // The same room after dark: deeper, with the lamps glowing warmer.
  dusk: {
    name: 'dusk',
    light: false,
    bg: '#4A2C34',
    bgDeep: '#2A1A1F',
    surface: '#5E3D44',
    surfaceSunk: '#432A30',
    ink: '#FBEBDC',
    inkSoft: '#DCC0AE',
    inkFaint: '#A07F72',
    shadowRgb: '20, 8, 10',
    shadowStrength: 1.35,
    faceInk: '#3A2328',
    floorEdge: 'rgba(255,214,170,0.12)',
    grain: 0.055,
    glowWarm: '#E59A57',
    glowCool: '#9C4F3E',
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
  melon: { face: '#A85248', edge: '#763830' },
  jelly: { face: '#4E7A65', edge: '#355646' },
  wrap: { face: '#7A6493', edge: '#544468' },
  pour: { face: '#4E7289', edge: '#354F60' },
  slice: { face: '#946A2C', edge: '#664818' },
  peel: { face: '#A55636', edge: '#733A23' },
  soap: { face: '#9C536E', edge: '#6C384C' },
  stack: { face: '#587A48', edge: '#3D5631' },
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
