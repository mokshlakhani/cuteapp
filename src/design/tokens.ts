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
} as const;

export type PastelName = keyof typeof pastel;

export const themes: Record<Theme['name'], Theme> = {
  day: {
    name: 'day',
    bg: '#FCF8F1',
    bgDeep: '#F5ECDF',
    surface: '#FFFDF9',
    surfaceSunk: '#F1E8DA',
    ink: '#5E4B42',
    inkSoft: '#9C8A7E',
    inkFaint: '#CDBFB2',
    shadowRgb: '128, 92, 66',
    shadowStrength: 1,
    faceInk: '#4A362F',
    floorEdge: 'rgba(255,255,255,0.75)',
    grain: 0.035,
  },
  // A soft "before sleep" palette: warm plum dusk, never pure dark.
  dusk: {
    name: 'dusk',
    bg: '#3A3346',
    bgDeep: '#2C2737',
    surface: '#4A4258',
    surfaceSunk: '#3A3347',
    ink: '#F6EBDD',
    inkSoft: '#C2B4C2',
    inkFaint: '#7D7088',
    shadowRgb: '16, 10, 26',
    shadowStrength: 1.35,
    faceInk: '#3A2A2A',
    floorEdge: 'rgba(255,240,230,0.12)',
    grain: 0.05,
  },
};

/** Per-room tint applied over the shared background wash. */
export const roomTint = {
  home: pastel.butter,
  melon: pastel.sage,
  jelly: pastel.peach,
  soon1: pastel.sky,
  soon2: pastel.lilac,
  soon3: pastel.peach,
} as const;

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
