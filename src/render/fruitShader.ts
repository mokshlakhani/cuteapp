import * as THREE from 'three';
import { fruitPalette as F } from '../design/fruitPalette';

/**
 * The fruits' skins and insides, shared by every room that shows a fruit
 * (slice and pop), so an orange in one is the same orange in the other.
 *
 * `fruitColor(p)` gives the colour at a point `p` of the fruit (scene units,
 * its core along y, its face toward +z), anywhere in its volume: skin, pith,
 * flesh, cores and seeds. It also sets `bumpH`, the height of the skin's
 * little relief there (an orange's pores, a cantaloupe's net), which
 * FRUIT_BUMP tilts the lighting by. It needs the uniforms below: which fruit
 * (`uFruit`, see slice/fruits.ts `code`), its radii and its outline.
 */

const col = (c: string) => {
  const v = new THREE.Color(c);
  return `vec3(${v.r.toFixed(4)}, ${v.g.toFixed(4)}, ${v.b.toFixed(4)})`;
};

const W = F.watermelon;

export const FRUIT_GLSL = /* glsl */ `
#define TAU 6.2831853
uniform float uFruit;
uniform vec3 uRad;
// The outline turned round the core: (roundness e, taper); see slice/polyhedron.ts.
uniform vec2 uOutline;
// Height of the skin's relief here (scene units), for the lighting.
float bumpH = 0.0;

vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

// Little round specks scattered through the volume (one per cell).
float specks(vec3 p, float density, float size) {
  vec3 q = p * density;
  vec3 c = floor(q);
  vec3 o = hash3(c) * 0.6 + 0.2;
  float d = length(fract(q) - o) / density;
  return 1.0 - smoothstep(size * 0.6, size, d);
}

// Distance to the nearest edge of a 3D cell pattern (a cantaloupe's net).
float cellEdge(vec3 p) {
  vec3 c = floor(p);
  float f1 = 9.0;
  float f2 = 9.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = c + vec3(float(x), float(y), float(z));
    float d = length(p - g - hash3(g));
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;
}

float band(float x, float a, float b, float soft) {
  return smoothstep(a - soft, a + soft, x) * (1.0 - smoothstep(b - soft, b + soft, x));
}

// How far out a point sits in its fruit: 0 at the middle, 1 on the skin,
// following the fruit's outline (see polyhedron.ts shell()).
float shellR(vec3 q) {
  float ax = length(q.xz) / max(0.05, 1.0 + uOutline.y * q.y);
  return pow(pow(ax, uOutline.x) + pow(abs(q.y), uOutline.x), 1.0 / uOutline.x);
}

// Distance from the core, as a share of the fruit's width at that height.
float coreR(vec3 q) {
  float t = clamp(abs(q.y), 0.0, 0.999);
  float w = pow(1.0 - pow(t, uOutline.x), 1.0 / uOutline.x) * (1.0 + uOutline.y * q.y);
  return length(q.xz) / max(0.08, w);
}

// q: the point in the fruit, normalised by its radii; r: shellR(q).
vec3 citrus(vec3 q, float r, vec3 peel, vec3 pith, vec3 flesh, vec3 membrane, float segs, float pips) {
  float ax = coreR(q);
  float ang = atan(q.z, q.x);
  float seg = abs(fract(ang / TAU * segs + 0.25) - 0.5) * 2.0;
  // Juice vesicles: soft teardrop streaks fanning out from the core.
  float ves = sin(ax * 38.0 + sin(ang * segs * 3.0 + q.y * 9.0) * 2.2) * 0.5 + 0.5;
  vec3 c = mix(flesh, mix(flesh, vec3(1.0), 0.32), ves * 0.38 * smoothstep(0.1, 0.4, ax));
  c = mix(c, flesh * 0.9, (1.0 - ves) * 0.15);
  float mem = 1.0 - smoothstep(0.03, 0.08 + 0.05 * (1.0 - ax), seg);
  c = mix(c, membrane, mem * smoothstep(0.08, 0.16, ax));
  c = mix(c, pith, 1.0 - smoothstep(0.07, 0.11, ax));
  if (pips > 0.5) {
    float pa = fract(ang / TAU * segs) - 0.5;
    float pm = 1.0 - smoothstep(0.7, 1.0, (pa * pa) / 0.012 + (ax - 0.3) * (ax - 0.3) / 0.006 + q.y * q.y / 0.04);
    pm *= step(0.5, fract(floor(ang / TAU * segs) * 0.5));
    c = mix(c, vec3(0.97, 0.94, 0.80), pm);
  }
  c = mix(c, pith, smoothstep(0.875, 0.895, r));
  // The peel: oil-gland pores, each a tiny dip that catches the light.
  float pore = specks(q, 20.0, 0.03);
  bumpH = -pore * 0.004;
  vec3 pc = peel * (0.98 - 0.04 * pore);
  c = mix(c, pc, smoothstep(0.935, 0.95, r));
  return c;
}

// Watermelon seeds: flat dark teardrops in loose rings, pointing in to the
// middle, a few pale ones among them.
vec4 melonSeeds(vec3 q, float r, float ring, float salt) {
  float ang = atan(q.z, q.x) + salt;
  vec2 cid = floor(vec2(ang / TAU * 16.0, q.y * 4.2 + salt));
  vec3 h = hash3(vec3(cid, 7.0 + salt));
  float ca = (cid.x + 0.5 + (h.x - 0.5) * 0.4) / 16.0 * TAU;
  float cy = (cid.y + 0.5 + (h.y - 0.5) * 0.3 - salt) / 4.2;
  float cr = ring + (h.z - 0.5) * 0.1;
  float da = ang - ca;
  da -= TAU * floor(da / TAU + 0.5);
  float dr = r - cr;
  float w = mix(0.022, 0.045, smoothstep(-0.07, 0.05, dr));
  float e = (dr * dr) / (0.07 * 0.07) + (da * r) * (da * r) / (w * w) + (q.y - cy) * (q.y - cy) / (0.05 * 0.05);
  float on = step(0.12, fract(h.z * 13.7)) * (1.0 - smoothstep(0.75, 1.0, e));
  vec3 c = fract(h.x * 31.3) < 0.15 ? vec3(0.96, 0.93, 0.82) : ${col(W.seed)};
  return vec4(c, on);
}

vec3 fruitColor(vec3 p) {
  vec3 q = p / uRad;
  float r = shellR(q);
  float ax = coreR(q);
  float ang = atan(q.z, q.x);
  int f = int(uFruit + 0.5);
  if (f == 0) {
    // Watermelon: dark stripes running pole to pole, a pale rind, red flesh, seeds in rings.
    vec3 c = mix(${col(W.flesh)}, ${col(W.fleshLight)}, smoothstep(0.55, 0.86, r) * 0.6);
    c *= 1.0 + 0.05 * sin(q.x * 31.0 + sin(q.z * 23.0)) * sin(q.z * 29.0 + q.y * 9.0);
    vec4 seed = melonSeeds(q, r, 0.64, 0.0);
    c = mix(c, seed.rgb, seed.a);
    seed = melonSeeds(q, r, 0.46, 0.5);
    c = mix(c, seed.rgb, seed.a);
    c = mix(c, ${col(W.rind)}, smoothstep(0.865, 0.885, r));
    float st = sin(ang * 9.0 + sin(q.y * 5.0) * 0.5 + sin(ang * 23.0 + q.y * 3.0) * 0.18);
    vec3 skin = mix(${col(W.skinLight)}, ${col(W.stripe)}, smoothstep(-0.25, 0.3, st));
    // The pale field spot where it lay on the ground.
    skin = mix(skin, vec3(0.86, 0.84, 0.52), smoothstep(-0.78, -0.95, q.y) * 0.8);
    return mix(c, skin, smoothstep(0.94, 0.955, r));
  }
  if (f == 1) return citrus(q, r, ${col(F.orange.peel)}, ${col(F.orange.pith)}, ${col(F.orange.flesh)}, ${col(F.orange.membrane)}, 11.0, 0.0);
  if (f == 6) return citrus(q, r, ${col(F.lemon.peel)}, ${col(F.lemon.pith)}, ${col(F.lemon.flesh)}, ${col(F.lemon.membrane)}, 9.0, 1.0);
  if (f == 2) {
    // Apple: creamy flesh, a faint ring of veins, a five-point core star with brown pips.
    vec3 c = mix(${col(F.apple.flesh)}, vec3(0.97, 0.98, 0.84), smoothstep(0.5, 0.95, r) * 0.4);
    c = mix(c, vec3(0.86, 0.9, 0.66), band(ax, 0.4, 0.43, 0.012) * smoothstep(0.75, 0.4, abs(q.y)) * 0.5);
    float core = 0.27 * (0.72 + 0.28 * cos(5.0 * ang)) * (1.0 - q.y * q.y * 1.4);
    c = mix(c, ${col(F.apple.core)}, 1.0 - smoothstep(core - 0.02, core + 0.02, ax));
    float pa = abs(fract(ang / TAU * 5.0) - 0.5);
    float pip = 1.0 - smoothstep(0.7, 1.0, (pa * pa) / 0.01 + (ax - 0.17) * (ax - 0.17) / 0.004 + q.y * q.y / 0.05);
    c = mix(c, ${col(F.apple.seed)}, pip);
    // Skin: red, streaked gold toward its base, freckled with pale lenticels.
    float streak = sin(ang * 31.0 + q.y * 4.0 + sin(ang * 7.0) * 2.0) * 0.5 + 0.5;
    vec3 skin = mix(${col(F.apple.skin)}, vec3(0.98, 0.5, 0.36), streak * 0.14 * smoothstep(0.1, -0.7, q.y) + 0.14 * smoothstep(-0.2, -0.9, q.y));
    skin = mix(skin, vec3(1.0, 0.84, 0.66), specks(q, 13.0, 0.014) * 0.3);
    // The hollow round the stem: a little russet and gold.
    skin = mix(skin, vec3(0.72, 0.6, 0.28), smoothstep(0.93, 0.995, q.y) * 0.55);
    return mix(c, skin, smoothstep(0.955, 0.97, r));
  }
  if (f == 3) {
    // Kiwi: green flesh with pale rays, a ring of black seeds round a creamy core, fuzzy brown skin.
    vec3 c = mix(${col(F.kiwi.flesh)}, mix(${col(F.kiwi.flesh)}, vec3(1.0), 0.35), smoothstep(0.55, 0.22, ax));
    c = mix(c, mix(c, vec3(1.0), 0.25), (sin(ang * 26.0) * 0.5 + 0.5) * band(ax, 0.28, 0.85, 0.05) * 0.5);
    float cr = 0.22 * (1.0 - 0.5 * q.y * q.y);
    float seedA = abs(fract(ang / TAU * 28.0 + q.y * 1.7) - 0.5);
    float sm = (1.0 - smoothstep(0.1, 0.22, seedA)) * band(ax, cr + 0.12, cr + 0.21, 0.02);
    c = mix(c, ${col(F.kiwi.seed)}, sm);
    c = mix(c, ${col(F.kiwi.core)}, 1.0 - smoothstep(cr - 0.03, cr + 0.02, ax));
    // Fine brown fuzz: soft mottling, the faintest relief.
    float fuzz = specks(q, 46.0, 0.012);
    bumpH = fuzz * 0.0015;
    vec3 skin = ${col('#7A5534')} * (0.95 + 0.12 * specks(q, 18.0, 0.04) - 0.06 * fuzz);
    return mix(c, skin, smoothstep(0.95, 0.965, r));
  }
  if (f == 4) {
    // Peach: sunny flesh, blushing red toward a ridged pit; skin blushes toward its top.
    float pr = length(q * vec3(1.0, 0.85, 1.12));
    vec3 c = mix(${col(F.peach.flesh)}, ${col(F.peach.blush)}, smoothstep(0.62, 0.36, pr) * 0.7);
    c = mix(c, ${col(F.peach.blush)} * 0.9, smoothstep(0.5, 0.36, pr) * (sin(ang * 9.0 + q.y * 7.0) * 0.5 + 0.5) * 0.4);
    float ridge = sin(ang * 14.0 + pr * 30.0 + q.y * 6.0) * 0.5 + 0.5;
    c = mix(c, mix(${col(F.peach.pit)}, ${col(F.peach.pit)} * 0.72, ridge), 1.0 - smoothstep(0.33, 0.35, pr));
    vec3 skin = mix(vec3(1.0, 0.72, 0.36), ${col(F.peach.skin)}, smoothstep(-0.5, 0.6, q.y + sin(ang * 2.0) * 0.25));
    skin = mix(skin, skin * 0.85, specks(q, 40.0, 0.012) * 0.5);
    // Its crease, running down one side from the stem.
    float side = abs(atan(q.z, q.x)) * length(q.xz);
    float crease = exp(-side * side / 0.0025) * smoothstep(-0.75, -0.1, q.y);
    bumpH = -crease * 0.05;
    skin = mix(skin, ${col(F.peach.skin)} * 0.78, crease * 0.6);
    return mix(c, skin, smoothstep(0.96, 0.975, r));
  }
  if (f == 5) {
    // Dragon fruit: snowy flesh full of tiny black seeds, a pink rim, magenta skin (its scales are real leaves; see extras).
    vec3 c = ${col(F.dragonfruit.flesh)};
    c = mix(c, ${col(F.dragonfruit.seed)}, specks(q, 16.0, 0.012) * (1.0 - smoothstep(0.84, 0.87, r)));
    c = mix(c, ${col(F.dragonfruit.rim)}, smoothstep(0.87, 0.9, r));
    float row = q.y * 2.6;
    float u = ang / TAU * 7.0 + 0.5 * mod(floor(row), 2.0);
    vec2 cell = vec2(fract(u) - 0.5, fract(row));
    float leaf = abs(cell.x) * 2.0 / max(0.05, 1.0 - cell.y * 0.9);
    float flap = (1.0 - smoothstep(0.75, 0.95, leaf)) * smoothstep(0.05, 0.25, cell.y);
    bumpH = flap * 0.02;
    vec3 skin = mix(${col(F.dragonfruit.skin)}, ${col(F.dragonfruit.rim)}, flap * 0.3);
    return mix(c, skin, smoothstep(0.935, 0.95, r));
  }
  // Cantaloupe: a netted skin, a pale green rind, orange flesh, a seed hollow in the middle.
  float hr = length(q * vec3(1.0, 0.8, 1.0));
  vec3 c = mix(${col(F.goldenMelon.flesh)}, ${col(F.goldenMelon.fleshLight)}, smoothstep(0.75, 0.42, r) * 0.7);
  vec3 hollow = mix(vec3(1.0, 0.68, 0.3), vec3(0.98, 0.6, 0.22), specks(q, 9.0, 0.06));
  hollow = mix(hollow, vec3(0.98, 0.93, 0.78), specks(q * vec3(1.0, 0.6, 1.0), 7.0, 0.06) * smoothstep(0.18, 0.3, hr));
  c = mix(c, hollow, 1.0 - smoothstep(0.34, 0.37, hr));
  c = mix(c, vec3(0.8, 0.88, 0.55), smoothstep(0.91, 0.925, r));
  // A fine raised net of pale cork over greenish-tan skin.
  float net = 1.0 - smoothstep(0.012, 0.035, cellEdge(q * 9.0));
  bumpH = net * 0.012;
  float sut = smoothstep(0.85, 1.0, abs(sin(ang * 5.0)));
  vec3 skin = mix(${col('#9A915A')}, ${col('#87905A')}, sut * 0.6);
  skin = mix(skin, ${col('#E6D8B0')}, net * 0.9);
  return mix(c, skin, smoothstep(0.94, 0.955, r));
}
`;

/** Tilt the shading normal by the skin's relief (as three's bump maps do). Goes after normal_fragment_maps. */
export const FRUIT_BUMP = /* glsl */ `
{
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  vec2 dh = vec2(dFdx(bumpH), dFdy(bumpH));
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1) * faceDirection;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  normal = normalize(abs(det) * normal - grad);
}
`;

export interface FruitSkin {
  code: number;
  radii: [number, number, number];
  shape: { e: number; taper: number };
}

export function fruitUniforms() {
  return {
    uFruit: { value: 0 },
    uRad: { value: new THREE.Vector3(1, 1, 1) },
    uOutline: { value: new THREE.Vector2(2, 0) },
  };
}

export function setFruitUniforms(u: ReturnType<typeof fruitUniforms>, f: FruitSkin) {
  u.uFruit.value = f.code;
  u.uRad.value.set(...f.radii);
  u.uOutline.value.set(f.shape.e, f.shape.taper);
}
