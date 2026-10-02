import * as THREE from 'three';
import { fruitPalette as F } from '../../design/fruitPalette';
import { WEDGE } from './Piece';
import type { JellyFruit } from './fruits';

/**
 * The jelly material: a soft, glossy physical material whose colour is a
 * *solid* texture evaluated from each vertex's rest position in its original
 * fruit. Peel, pith, flesh, segments and seeds run through the whole volume,
 * so every cut face shows the right cross-section.
 *
 * Shared look with the rest of soft spot: the same upper-left light, a soft
 * "light through jelly" glow, a pale translucent rim, and the app's own face
 * painted on the caps (under the clear-coat, so it bends with the jelly).
 */

export const NSEEDS = 22;

export interface SharedUniforms {
  [k: string]: THREE.IUniform;
  uSeeds: THREE.IUniform<THREE.Vector4[]>;
  uGlow: THREE.IUniform<number>;
  uRim: THREE.IUniform<number>;
}

function melonSeeds(): THREE.Vector4[] {
  // A deterministic scatter: some at the top surface, some hidden inside.
  const out: THREE.Vector4[] = [];
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const R = WEDGE.radius;
  const h = WEDGE.halfAngle * 0.82;
  for (let i = 0; i < NSEEDS; i++) {
    const r = R * (0.38 + rnd() * 0.42);
    const a = Math.PI / 2 - h + rnd() * 2 * h;
    const y = i % 3 === 0 ? WEDGE.height - 0.12 : 0.5 + rnd() * (WEDGE.height - 0.9);
    out.push(new THREE.Vector4(Math.cos(a) * r, y, Math.sin(a) * r, 0));
  }
  return out;
}

export function createShared(): SharedUniforms {
  return {
    uSeeds: { value: melonSeeds() },
    uGlow: { value: 0.14 },
    uRim: { value: 0.3 },
  };
}

const col = (c: string) => {
  const v = new THREE.Color(c);
  return `vec3(${v.r.toFixed(4)}, ${v.g.toFixed(4)}, ${v.b.toFixed(4)})`;
};

const VERT_HEAD = /* glsl */ `
attribute vec3 aRest;
attribute float aCap;
varying vec3 vRest;
varying float vCap;
`;

const W = F.watermelon;

const FRAG_HEAD = /* glsl */ `
#define NSEEDS ${NSEEDS}
uniform float uFruit;
uniform float uR;
uniform vec2 uTexScale; // (radius, height) of this fruit relative to its design size
uniform vec3 uFlesh;
uniform vec3 uFleshLight;
uniform vec4 uSeeds[NSEEDS];
uniform float uGlow;
uniform float uRim;
uniform sampler2D uFace;
uniform vec4 uFaceRect;
varying vec3 vRest;
varying float vCap;

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

float band(float x, float a, float b, float soft) {
  return smoothstep(a - soft, a + soft, x) * (1.0 - smoothstep(b - soft, b + soft, x));
}

vec3 melonColor(vec3 p, float clearSeeds) {
  float R = uR;
  float r = length(p.xz);
  float edgeSkin = R - 0.42;
  float edgeRind = edgeSkin - 0.72;
  vec3 c = mix(uFlesh, uFleshLight, smoothstep(edgeRind - 2.4, edgeRind, r) * 0.6);
  float grain = sin(p.x * 7.1 + sin(p.z * 5.3)) * sin(p.z * 6.7 + p.y * 3.0);
  c *= 1.0 + grain * 0.04;
  c = mix(c, ${col(W.rind)}, smoothstep(edgeRind - 0.07, edgeRind + 0.07, r));
  float ang = atan(p.z, p.x);
  float st = sin(ang * 34.0 + sin(ang * 90.0) * 0.35 + sin(p.y * 2.2 + ang * 20.0) * 0.25);
  vec3 skin = mix(${col(W.skin)}, ${col(W.stripe)}, smoothstep(-0.2, 0.35, st));
  c = mix(c, skin, smoothstep(edgeSkin - 0.07, edgeSkin + 0.04, r));
  for (int i = 0; i < NSEEDS; i++) {
    vec3 sp = uSeeds[i].xyz * vec3(uTexScale.x, uTexScale.y, uTexScale.x);
    vec3 q = p - sp;
    if (dot(q, q) > 0.25) continue;
    vec2 dir = normalize(sp.xz);
    float a = dot(q.xz, dir);
    float b = dot(q.xz, vec2(-dir.y, dir.x));
    float w = a > 0.0 ? mix(0.17, 0.08, clamp(a / 0.3, 0.0, 1.0)) : 0.17;
    float e = (a * a) / (0.31 * 0.31) + (b * b) / (w * w) + (q.y * q.y) / (0.15 * 0.15);
    float m = (1.0 - smoothstep(0.75, 1.0, e)) * (1.0 - clearSeeds);
    c = mix(c, ${col(W.seed)}, m);
  }
  return c;
}

// Orange & lemon: peel, pith, juicy segments with pale membranes.
vec3 citrusColor(vec3 p, vec3 peel, vec3 pith, vec3 flesh, vec3 membrane, float segs, float clearSeeds, float pips) {
  float r = length(p.xz) / uR;
  float ang = atan(p.z, p.x);
  float seg = abs(fract(ang / 6.2831853 * segs + 0.25) - 0.5) * 2.0;
  // Vesicles: soft radial streaks inside each segment.
  float ves = sin(r * 38.0 + sin(ang * segs * 3.0) * 2.0) * 0.5 + 0.5;
  vec3 c = mix(flesh, mix(flesh, vec3(1.0), 0.28), ves * 0.35 * smoothstep(0.1, 0.4, r));
  float mem = 1.0 - smoothstep(0.03, 0.08 + 0.05 * (1.0 - r), seg);
  c = mix(c, membrane, mem * smoothstep(0.08, 0.16, r));
  c = mix(c, pith, 1.0 - smoothstep(0.08, 0.13, r));
  // Pips (lemon): a few pale teardrops near the middle.
  if (pips > 0.5) {
    float pa = fract(ang / 6.2831853 * segs) - 0.5;
    float pr = r - 0.32;
    float pm = 1.0 - smoothstep(0.7, 1.0, (pa * pa) / 0.012 + (pr * pr) / 0.006 + (p.y - 0.8) * (p.y - 0.8) / 0.3);
    pm *= step(0.5, fract(floor(ang / 6.2831853 * segs) * 0.5)) * (1.0 - clearSeeds);
    c = mix(c, vec3(0.97, 0.94, 0.80), pm);
  }
  c = mix(c, pith, smoothstep(0.84, 0.87, r));
  c = mix(c, peel, smoothstep(0.92, 0.95, r));
  return c;
}

vec3 fruitColor(vec3 p, float clearSeeds) {
  int f = int(uFruit + 0.5);
  if (f == 0) return melonColor(p, clearSeeds);
  if (f == 1) return citrusColor(p, ${col(F.orange.peel)}, ${col(F.orange.pith)}, ${col(F.orange.flesh)}, ${col(F.orange.membrane)}, 10.0, clearSeeds, 0.0);
  if (f == 2) return citrusColor(p, ${col(F.lemon.peel)}, ${col(F.lemon.pith)}, ${col(F.lemon.flesh)}, ${col(F.lemon.membrane)}, 8.0, clearSeeds, 1.0);
  float ang = atan(p.z, p.x);
  if (f == 3) {
    // Kiwi: green flesh with rays, a ring of black seeds, creamy core.
    float r = length(p.xz / (vec2(1.0, 0.85) * uR));
    vec3 c = mix(${col(F.kiwi.flesh)}, mix(${col(F.kiwi.flesh)}, vec3(1.0), 0.35), smoothstep(0.6, 0.25, r));
    c = mix(c, mix(c, vec3(1.0), 0.25), (sin(ang * 26.0) * 0.5 + 0.5) * band(r, 0.3, 0.85, 0.05) * 0.5);
    float seedA = abs(fract(ang / 6.2831853 * 28.0) - 0.5);
    float sm = (1.0 - smoothstep(0.08, 0.2, seedA)) * band(r, 0.38, 0.48, 0.02) * (1.0 - clearSeeds);
    c = mix(c, ${col(F.kiwi.seed)}, sm);
    c = mix(c, ${col(F.kiwi.core)}, 1.0 - smoothstep(0.22, 0.27, r));
    c = mix(c, ${col(F.kiwi.skin)}, smoothstep(0.93, 0.96, r));
    return c;
  }
  if (f == 4) {
    // Strawberry: red edge, pale heart, white rays and golden seeds.
    // Designed at full size; scale this (smaller) slice back up to it.
    vec3 ps = p * (3.553 / uR);
    float r = length(ps.xz / vec2(3.3, 3.4));
    vec3 c = mix(${col(F.strawberry.flesh)}, ${col(F.strawberry.core)}, smoothstep(0.75, 0.15, r) * 0.7);
    float core = 1.0 - smoothstep(0.25, 0.35, abs(ps.x) / (1.0 + max(0.0, -ps.z) * 0.15) + max(0.0, ps.z - 1.4) * 0.3);
    c = mix(c, ${col(F.strawberry.core)}, core * 0.8);
    c = mix(c, mix(c, vec3(1.0), 0.35), (1.0 - smoothstep(0.0, 0.25, abs(sin(ang * 9.0)))) * band(r, 0.3, 0.85, 0.05));
    c = mix(c, ${col(F.strawberry.skin)}, smoothstep(0.86, 0.93, r));
    float sd = specks(ps, 2.2, 0.12) * smoothstep(0.82, 0.9, r) * (1.0 - clearSeeds);
    c = mix(c, ${col(F.strawberry.seed)}, sd);
    return c;
  }
  if (f == 5) {
    // Apple: creamy flesh, a five-point core star with brown pips.
    float r = length(p.xz) / uR;
    vec3 c = mix(${col(F.apple.flesh)}, vec3(0.96, 0.98, 0.82), smoothstep(0.5, 0.9, r) * 0.4);
    float star = 0.3 * (0.72 + 0.28 * cos(5.0 * ang));
    c = mix(c, ${col(F.apple.core)}, 1.0 - smoothstep(star - 0.02, star + 0.02, r));
    float pa = abs(fract(ang / 6.2831853 * 5.0) - 0.5);
    float pip = (1.0 - smoothstep(0.7, 1.0, (pa * pa) / 0.01 + (r - 0.19) * (r - 0.19) / 0.004)) * (1.0 - clearSeeds);
    c = mix(c, ${col(F.apple.seed)}, pip);
    c = mix(c, ${col(F.apple.skin)}, smoothstep(0.93, 0.96, r));
    return c;
  }
  if (f == 6) {
    // Peach: sunny flesh, blushing toward a ridged pit.
    float r = length(p.xz) / uR;
    vec3 c = mix(${col(F.peach.flesh)}, ${col(F.peach.blush)}, smoothstep(0.55, 0.3, r) * 0.7);
    float ridge = sin(ang * 14.0 + r * 30.0) * 0.5 + 0.5;
    vec3 pit = mix(${col(F.peach.pit)}, ${col(F.peach.pit)} * 0.75, ridge);
    c = mix(c, pit, 1.0 - smoothstep(0.27, 0.3, r));
    c = mix(c, ${col(F.peach.skin)}, smoothstep(0.94, 0.97, r));
    return c;
  }
  // Dragon fruit: snowy flesh full of tiny black seeds, magenta skin.
  float r = length(p.xz / (vec2(1.0, 0.87) * uR));
  vec3 c = ${col(F.dragonfruit.flesh)};
  c = mix(c, ${col(F.dragonfruit.seed)}, specks(p, 2.6, 0.075) * (1.0 - smoothstep(0.82, 0.86, r)) * (1.0 - clearSeeds));
  c = mix(c, ${col(F.dragonfruit.rim)}, smoothstep(0.85, 0.88, r));
  c = mix(c, ${col(F.dragonfruit.skin)}, smoothstep(0.92, 0.95, r));
  return c;
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
// Keep seeds out from under the face so it always reads clearly.
float faceZone = 0.0;
if (uFaceRect.w > 0.5) {
  float fd = length(vRest.xz - uFaceRect.xy) / (uFaceRect.z * 0.55);
  faceZone = (1.0 - smoothstep(0.8, 1.0, fd)) * smoothstep(0.6, 0.95, abs(vCap));
}
vec3 jc = fruitColor(vRest, faceZone);
if (uFaceRect.w > 0.5) {
  vec2 f = vec2((vRest.x - uFaceRect.x) / uFaceRect.z + 0.5, (vRest.z - uFaceRect.y) / uFaceRect.z + 0.5);
  float topMask = smoothstep(0.9, 0.995, vCap);
  float botMask = smoothstep(0.9, 0.995, -vCap);
  if (f.x > 0.0 && f.x < 1.0 && f.y > 0.0 && f.y < 1.0) {
    // Face "up" points away from the viewer (−z) so it reads upright.
    vec4 ft = texture2D(uFace, vec2(f.x, 1.0 - f.y));
    vec4 fb = texture2D(uFace, vec2(1.0 - f.x, 1.0 - f.y));
    jc = mix(jc, ft.rgb, ft.a * topMask);
    jc = mix(jc, fb.rgb, fb.a * botMask);
  }
}
diffuseColor.rgb = jc;
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
{
  // Light scattered inside the jelly + a pale translucent rim.
  vec3 vdir = normalize(vViewPosition);
  float facing = abs(dot(normalize(normal), vdir));
  float rim = pow(1.0 - facing, 2.2);
  totalEmissiveRadiance += diffuseColor.rgb * uGlow;
  totalEmissiveRadiance += mix(diffuseColor.rgb, vec3(1.0), 0.45) * rim * uRim;
}
`;

const emptyFace = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export interface LocalUniforms {
  uFace: { value: THREE.Texture };
  uFaceRect: { value: THREE.Vector4 };
  uFruit: { value: number };
  uR: { value: number };
  uTexScale: { value: THREE.Vector2 };
  uFlesh: { value: THREE.Color };
  uFleshLight: { value: THREE.Color };
}

export function makeJellyMaterial(shared: SharedUniforms, fruit: JellyFruit, texR: number, texH: number) {
  const local: LocalUniforms = {
    uFace: { value: emptyFace },
    uFaceRect: { value: new THREE.Vector4(0, 0, 1, 0) },
    uFruit: { value: fruit.code },
    uR: { value: texR },
    uTexScale: { value: new THREE.Vector2(texR / WEDGE.radius, texH / WEDGE.height) },
    uFlesh: { value: new THREE.Color(fruit.melon?.flesh ?? '#ffffff') },
    uFleshLight: { value: new THREE.Color(fruit.melon?.fleshLight ?? '#ffffff') },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    sheen: 0.12,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ffffff'),
    specularIntensity: 0.8,
    envMapIntensity: 0.8,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, local);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;\nvCap = aCap;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'soft-jelly-v3';
  return { mat, local };
}
