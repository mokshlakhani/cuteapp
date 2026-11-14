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
// Grazing-angle fuzz/velvet sheen intensity and tint on the skin.
float skinSheen = 0.0;
vec3 skinSheenCol = vec3(1.0);

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
  float pore = specks(q, 22.0, 0.032) + 0.45 * specks(q, 38.0, 0.018);
  bumpH = -pore * 0.0085;
  vec3 pc = peel * (0.98 - 0.07 * pore);
  // Navel dimple at the bottom pole of oranges.
  if (pips < 0.5) {
    float navR = length(q.xz);
    float navY = smoothstep(-0.80, -0.96, q.y);
    float navDimple = (1.0 - smoothstep(0.06, 0.19, navR)) * navY;
    float navRing = band(navR, 0.11, 0.18, 0.035) * navY;
    float navCrease = (sin(ang * 7.0) * 0.5 + 0.5) * navDimple;
    bumpH += (navRing * 0.018 - navDimple * 0.038);
    pc = mix(pc, peel * 0.72, navDimple * (0.55 + 0.35 * navCrease));
    pc = mix(pc, pith * 0.92, (1.0 - smoothstep(0.0, 0.055, navR)) * navY * 0.65);
  }
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
  bumpH = 0.0;
  skinSheen = 0.0;
  vec3 q = p / uRad;
  float r = shellR(q);
  float ax = coreR(q);
  float ang = atan(q.z, q.x);
  int f = int(uFruit + 0.5);
  if (f == 0) {
    // Watermelon: dark stripes running pole to pole, a pale rind, red flesh with a paler fibrous heart, seeds in rings.
    vec3 c = mix(${col(W.flesh)}, ${col(W.fleshLight)}, smoothstep(0.55, 0.86, r) * 0.6);
    // Paler rose heart at the center and radial vascular fibres.
    float heart = (1.0 - smoothstep(0.0, 0.36, r)) * 0.38;
    float fibre = (sin(ang * 32.0 + sin(r * 22.0 + q.y * 8.0) * 1.5) * 0.5 + 0.5) * band(r, 0.12, 0.78, 0.08);
    c = mix(c, ${col(W.fleshLight)}, heart + fibre * 0.16);
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
    // Apple: creamy flesh, a distinct ring of veins, a five-point core star with brown pips.
    vec3 c = mix(${col(F.apple.flesh)}, vec3(0.97, 0.98, 0.84), smoothstep(0.5, 0.95, r) * 0.4);
    c = mix(c, vec3(0.80, 0.85, 0.56), band(ax, 0.39, 0.435, 0.014) * smoothstep(0.82, 0.35, abs(q.y)) * 0.72);
    float core = 0.28 * (0.70 + 0.30 * cos(5.0 * ang)) * (1.0 - q.y * q.y * 1.3);
    c = mix(c, ${col(F.apple.core)}, 1.0 - smoothstep(core - 0.022, core + 0.022, ax));
    // The core's papery edge, so the star reads on off-centre cuts too.
    c = mix(c, vec3(0.74, 0.62, 0.32), band(ax, core - 0.015, core + 0.016, 0.011) * 0.75);
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
    // Kiwi: green flesh with pale rays, a ring of black seeds round a creamy core, warm fuzzy brown skin.
    vec3 c = mix(${col(F.kiwi.flesh)}, mix(${col(F.kiwi.flesh)}, vec3(1.0), 0.35), smoothstep(0.55, 0.22, ax));
    c = mix(c, mix(c, vec3(1.0), 0.25), (sin(ang * 26.0) * 0.5 + 0.5) * band(ax, 0.28, 0.85, 0.05) * 0.5);
    float cr = 0.22 * (1.0 - 0.5 * q.y * q.y);
    float seedA = abs(fract(ang / TAU * 28.0 + q.y * 1.7) - 0.5);
    float sm = (1.0 - smoothstep(0.1, 0.22, seedA)) * band(ax, cr + 0.12, cr + 0.21, 0.02);
    c = mix(c, ${col(F.kiwi.seed)}, sm);
    c = mix(c, ${col(F.kiwi.core)}, 1.0 - smoothstep(cr - 0.03, cr + 0.02, ax));
    // Warm lighter-brown fuzzy skin with short hair-like relief and grazing-angle fuzz sheen.
    float fuzz = specks(q, 52.0, 0.013) + 0.5 * specks(q * vec3(1.2, 2.2, 1.2), 38.0, 0.016);
    float skinMask = smoothstep(0.95, 0.965, r);
    bumpH = fuzz * 0.0045 * skinMask;
    skinSheen = skinMask * (0.72 + 0.28 * fuzz);
    skinSheenCol = vec3(0.92, 0.80, 0.58);
    vec3 skin = ${col('#9A7348')} * (0.96 + 0.14 * specks(q, 18.0, 0.04) - 0.05 * fuzz);
    return mix(c, skin, skinMask);
  }
  if (f == 4) {
    // Peach: sunny yellow-gold flesh, blushing red toward a ridged pit; velvet skin with a deep anatomical crease.
    float pr = length(q * vec3(1.0, 0.85, 1.12));
    vec3 c = mix(${col(F.peach.flesh)}, ${col(F.peach.blush)}, smoothstep(0.62, 0.36, pr) * 0.7);
    c = mix(c, ${col(F.peach.blush)} * 0.9, smoothstep(0.5, 0.36, pr) * (sin(ang * 9.0 + q.y * 7.0) * 0.5 + 0.5) * 0.4);
    float ridge = sin(ang * 14.0 + pr * 30.0 + q.y * 6.0) * 0.5 + 0.5;
    c = mix(c, mix(${col(F.peach.pit)}, ${col(F.peach.pit)} * 0.72, ridge), 1.0 - smoothstep(0.33, 0.35, pr));
    // Soft, gradual blush gradient from golden-yellow belly to rosy cheek.
    float blushT = smoothstep(-0.72, 0.78, q.y + sin(ang * 2.0) * 0.28 + cos(ang * 3.0 - 0.5) * 0.14);
    vec3 skin = mix(vec3(1.0, 0.78, 0.38), ${col(F.peach.skin)}, blushT);
    float velvet = specks(q, 48.0, 0.011);
    skin = mix(skin, skin * 0.88, velvet * 0.4);
    // Deep, sculpted suture crease running down one side from the stem.
    float ca = atan(q.z, q.x) - 0.62;
    float side = abs(ca - TAU * floor(ca / TAU + 0.5)) * length(q.xz);
    float cleftLen = smoothstep(-0.88, -0.05, q.y);
    float crease = (exp(-side * side / 0.0075) * 0.7 + exp(-side * side / 0.0016) * 0.55) * cleftLen;
    float skinMask = smoothstep(0.96, 0.975, r);
    bumpH = (-crease * 0.095 + velvet * 0.0018) * skinMask;
    skinSheen = skinMask * 0.88;
    skinSheenCol = vec3(1.0, 0.90, 0.78);
    skin = mix(skin, ${col(F.peach.skin)} * 0.66, clamp(crease * 0.75, 0.0, 1.0));
    return mix(c, skin, skinMask);
  }
  if (f == 5) {
    // Dragon fruit: snowy flesh full of tiny black seeds, a pink rim, magenta skin with long curved bract scales.
    vec3 c = ${col(F.dragonfruit.flesh)};
    c = mix(c, ${col(F.dragonfruit.seed)}, specks(q, 16.0, 0.012) * (1.0 - smoothstep(0.84, 0.87, r)));
    c = mix(c, ${col(F.dragonfruit.rim)}, smoothstep(0.87, 0.9, r));
    // Longer, gracefully curved scales in staggered rows, with a deep fold shadow beneath each bract and curling green tips.
    float row = q.y * 1.65 + 0.18;
    float u = ang / TAU * 6.0 + 0.5 * mod(floor(row), 2.0);
    vec2 cell = vec2(fract(u) - 0.5, fract(row));
    // Subtle S-curve and outward flare toward the tip of each scale.
    float curveX = cell.x - sin(cell.y * 3.14159) * 0.055 * sign(cell.x);
    float wide = 0.52 * pow(max(0.0, 1.0 - cell.y * 0.92), 0.66);
    float edgeDist = wide - abs(curveX);
    float flap = smoothstep(-0.02, 0.055, edgeDist) * smoothstep(0.0, 0.06, cell.y);
    float midrib = exp(-curveX * curveX / 0.003) * flap * smoothstep(0.1, 0.85, cell.y);
    // Darker fold shadow immediately outside/beneath each overlapping scale.
    float foldShadow = smoothstep(-0.09, -0.005, edgeDist) * (1.0 - flap) * smoothstep(0.0, 0.85, cell.y);
    float baseShadow = (1.0 - smoothstep(0.0, 0.14, cell.y)) * flap;
    float tip = flap * smoothstep(0.46, 0.88, cell.y);
    bumpH = flap * (0.01 + 0.042 * cell.y * cell.y + midrib * 0.008) - foldShadow * 0.014;
    vec3 skin = mix(${col(F.dragonfruit.skin)} * 0.86, ${col(F.dragonfruit.skin)}, flap);
    skin = mix(skin, ${col(F.dragonfruit.skin)} * 0.58, clamp(foldShadow * 0.85 + baseShadow * 0.45, 0.0, 1.0));
    skin = mix(skin, ${col(F.dragonfruit.rim)}, (flap * cell.y * 0.35 + midrib * 0.25));
    skin = mix(skin, vec3(0.58, 0.82, 0.32), tip * 0.94);
    return mix(c, skin, smoothstep(0.935, 0.95, r));
  }
  // Cantaloupe: a fine raised cork net, pale green rind, salmon-orange flesh, and a real recessed seed hollow with stringy fibres & seeds.
  float hr = length(q * vec3(1.0, 0.8, 1.0));
  vec3 c = mix(${col(F.goldenMelon.flesh)}, ${col(F.goldenMelon.fleshLight)}, smoothstep(0.75, 0.42, r) * 0.7);
  // Recessed seed cavity: dark shadowed hollow at the center, stringy orange fibrous webbing, and clustered pale cream seeds.
  float inHollow = 1.0 - smoothstep(0.33, 0.38, hr);
  float cavityDepth = 1.0 - smoothstep(0.0, 0.34, hr);
  float strands = sin(ang * 20.0 + sin(q.y * 16.0 + ang * 5.0) * 2.4) * 0.5 + 0.5;
  strands = smoothstep(0.35, 0.85, strands) * smoothstep(0.06, 0.32, hr);
  vec3 hollow = mix(vec3(0.92, 0.48, 0.22), vec3(0.58, 0.24, 0.10), cavityDepth * 0.82);
  hollow = mix(hollow, vec3(1.0, 0.72, 0.42), strands * 0.75);
  // Clustered teardrop seeds suspended along the stringy wall of the hollow.
  float seedRing = band(hr, 0.14, 0.31, 0.04);
  float seedCluster = specks(q * vec3(1.1, 0.75, 1.1), 11.5, 0.052) * seedRing;
  hollow = mix(hollow, vec3(0.99, 0.94, 0.78), seedCluster);
  c = mix(c, hollow, inHollow);
  c = mix(c, vec3(0.8, 0.88, 0.55), smoothstep(0.91, 0.925, r));
  // Finer, raised cork net over sage-tan skin.
  float edge1 = cellEdge(q * 13.0);
  float edge2 = cellEdge(q * 21.0 + 3.7);
  float net = max(1.0 - smoothstep(0.008, 0.026, edge1), (1.0 - smoothstep(0.01, 0.028, edge2)) * 0.65);
  float skinMask = smoothstep(0.94, 0.955, r);
  bumpH = mix(-cavityDepth * 0.025 * inHollow, (net * 0.020 - (1.0 - net) * 0.003), skinMask);
  float sut = smoothstep(0.85, 1.0, abs(sin(ang * 5.0)));
  vec3 skin = mix(${col('#9A915A')}, ${col('#7D8850')}, sut * 0.65);
  // Subtle dark border right beside each cork ridge so the raised net pops in relief.
  float netShadow = smoothstep(0.022, 0.045, edge1) * (1.0 - smoothstep(0.045, 0.08, edge1));
  skin *= 1.0 - 0.14 * netShadow;
  skin = mix(skin, ${col('#EDE1BE')}, net * 0.94);
  return mix(c, skin, skinMask);
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
  if (skinSheen > 0.001) {
    float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
    float sheenRim = pow(1.0 - ndv, 2.2) * skinSheen;
    diffuseColor.rgb = mix(diffuseColor.rgb, skinSheenCol, sheenRim * 0.52);
  }
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
