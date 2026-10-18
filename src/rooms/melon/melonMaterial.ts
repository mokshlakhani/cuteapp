import * as THREE from 'three';
import { fruitPalette } from '../../design/fruitPalette';
import { PATTERNS, type PopFruit } from './fruits';

/**
 * The fruit's skin, painted in the shader from each vertex's rest position on
 * the unit fruit (so the pattern stays put however much the bands squeeze it,
 * and the rind pieces that fly off after the pop keep it): a watermelon's
 * wavy stripes, a cantaloupe's netting, an orange's dimpled peel, a
 * pomegranate's blushing leather, a dragon fruit's green-tipped scales,
 * kiwi fuzz, pumpkin ribs, coconut husk. All glossy vinyl-toy versions.
 *
 * The face is a small canvas projected onto the middle of its front, so it
 * squashes and bulges with the melon, like every face in soft spot.
 */

const W = fruitPalette.watermelon;

export interface MelonUniforms {
  [k: string]: THREE.IUniform;
  uFace: THREE.IUniform<THREE.Texture | null>;
  uFaceOn: THREE.IUniform<number>;
  /** Face centre and axes on the unit melon, and its size. */
  uFaceC: THREE.IUniform<THREE.Vector3>;
  uFaceU: THREE.IUniform<THREE.Vector3>;
  uFaceV: THREE.IUniform<THREE.Vector3>;
  uFaceSize: THREE.IUniform<number>;
  /** Melon half-length and radius, to project the face without stretching. */
  uShape: THREE.IUniform<THREE.Vector2>;
  /** Cracks opening round the split just before it bursts (0..1), and where. */
  uCrack: THREE.IUniform<number>;
  /** Where the two cracks run: either side of the band pile (normalised). */
  uCrackX: THREE.IUniform<THREE.Vector2>;
  /** Which skin (index into PATTERNS), its three colours, and the flesh showing through cracks. */
  uPattern: THREE.IUniform<number>;
  uSkinA: THREE.IUniform<THREE.Color>;
  uSkinB: THREE.IUniform<THREE.Color>;
  uSkinC: THREE.IUniform<THREE.Color>;
  uFlesh: THREE.IUniform<THREE.Color>;
}

const VERT_HEAD = /* glsl */ `
attribute vec3 aRest;
varying vec3 vRest;
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vRest;
uniform sampler2D uFace;
uniform float uFaceOn;
uniform vec3 uFaceC;
uniform vec3 uFaceU;
uniform vec3 uFaceV;
uniform float uFaceSize;
uniform vec2 uShape;
uniform float uCrack;
uniform vec2 uCrackX;
uniform float uPattern;
uniform vec3 uSkinA;
uniform vec3 uSkinB;
uniform vec3 uSkinC;
uniform vec3 uFlesh;

float hash1(float n) { return fract(sin(n) * 43758.5453); }
/** Smooth 1D value noise. */
float vnoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash1(i), hash1(i + 1.0), u) * 2.0 - 1.0;
}
float crackPath(float phi, float seed) {
  return 0.05 * vnoise(phi * 3.0 + seed) + 0.025 * vnoise(phi * 7.0 + seed * 1.7) + 0.012 * vnoise(phi * 17.0 + seed * 2.3);
}

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/** Smooth 2D value noise, -1..1. */
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}
/** Cells: distance to the nearest point (x) and to the cell's edge (y). */
vec2 cells(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash2(i + g), hash2(i + g + 17.3));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return vec2(d1, d2 - d1);
}

float melonStripes(vec3 p) {
  float phi = atan(p.z, p.y);
  float n = 10.0;
  float w = phi * n / 6.28318
    + 0.17 * sin(p.x * 7.0 + phi * 3.0)
    + 0.07 * sin(p.x * 17.0 - phi * 5.0)
    + 0.04 * sin(p.x * 31.0 + phi * 2.0);
  float s = abs(fract(w) - 0.5) * 2.0;
  // Ragged edges, like the real thing, but still clean and toy-like.
  float edge = 0.42 + 0.06 * sin(p.x * 23.0 + phi * 11.0);
  return 1.0 - smoothstep(edge - 0.05, edge + 0.05, s);
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vRest;
  float phi = atan(p.z, p.y);
  // Around-and-along coordinates, roughly even in size over the surface.
  vec2 uv2 = vec2(p.x * 3.0, phi * 1.1);
  vec3 c;
  if (uPattern < 0.5) {
    // Watermelon: wavy dark stripes end to end, soft mottling between.
    float st = melonStripes(p);
    vec3 skin = mix(uSkinB, uSkinA, 0.35);
    float mott = 0.5 + 0.5 * sin(p.x * 41.0 + sin(p.y * 37.0) * 2.0) * sin(phi * 29.0);
    skin = mix(skin, uSkinB * 1.08, mott * 0.25);
    c = mix(skin, uSkinC, st);
  } else if (uPattern < 1.5) {
    // Cantaloupe: pale raised netting over a tan-green skin, with faint green sutures.
    vec2 ce = cells(uv2 * 4.2);
    float net = 1.0 - smoothstep(0.03, 0.11, ce.y);
    // (The sutures sit in the shallow grooves between the ribs.)
    float sut = 1.0 - smoothstep(0.0, 0.05, abs(fract(phi * 10.0 / 6.28318) - 0.5));
    c = mix(uSkinA, uSkinC, sut * 0.45 * (1.0 - net));
    c = mix(c, uSkinB, net * 0.85);
  } else if (uPattern < 2.5) {
    // Citrus peel: tiny dimpled pores, a little uneven in colour.
    vec2 ce = cells(uv2 * 14.0);
    float pore = 1.0 - smoothstep(0.0, 0.32, ce.x);
    c = mix(uSkinA, uSkinB, 0.25 + 0.2 * vnoise2(uv2 * 2.0));
    c = mix(c, uSkinC, pore * 0.45);
  } else if (uPattern < 3.5) {
    // Honeydew: smooth and pale, the faintest mottling and a few freckles.
    c = mix(uSkinA, uSkinB, 0.35 + 0.25 * vnoise2(uv2 * 2.5));
    float fr = step(0.93, hash2(floor(uv2 * 22.0)));
    c = mix(c, uSkinC, fr * 0.5);
  } else if (uPattern < 4.5) {
    // Pomegranate: deep red leather with lighter, warmer blush patches and tiny dots.
    float bl = smoothstep(-0.1, 0.6, vnoise2(uv2 * 1.3 + 3.0));
    c = mix(uSkinA, uSkinB, bl * 0.65);
    c = mix(c, uSkinC, smoothstep(0.2, 0.9, vnoise2(uv2 * 3.0 - 7.0)) * 0.4);
    c = mix(c, uSkinB * 1.1, step(0.95, hash2(floor(uv2 * 26.0))) * 0.5);
  } else if (uPattern < 5.5) {
    // Dragon fruit: hot pink, covered in big leaf-like scales lying flat along
    // it, each with a pale crease and an edge, fading to green at its tip.
    vec2 q = vec2(p.x * 3.0, phi * 1.25);
    q.y += mod(floor(q.x), 2.0) * 0.5;
    vec2 f = fract(q) - vec2(0.5);
    float wid = 0.34 * (1.0 - smoothstep(-0.45, 0.48, f.x) * 0.9);
    float leaf = 1.0 - smoothstep(wid - 0.03, wid + 0.01, abs(f.y));
    leaf *= step(-0.45, f.x) * (1.0 - step(0.48, f.x));
    float rim = leaf * smoothstep(wid - 0.09, wid - 0.02, abs(f.y));
    float crease = leaf * (1.0 - smoothstep(0.0, 0.025, abs(f.y))) * smoothstep(-0.2, 0.2, f.x);
    float tip = leaf * smoothstep(0.05, 0.42, f.x);
    c = mix(uSkinA, uSkinB, leaf * 0.5 + rim * 0.35 + crease * 0.3);
    c = mix(c, uSkinC, tip);
  } else if (uPattern < 6.5) {
    // Kiwi: brown fuzz, fine and uneven.
    float fz = vnoise2(uv2 * 40.0) * 0.5 + vnoise2(uv2 * 9.0) * 0.5;
    c = mix(uSkinA, fz > 0.0 ? uSkinB : uSkinC, abs(fz) * 0.55);
  } else if (uPattern < 7.5) {
    // Pumpkin: deep grooves between the ribs, lighter on the ridges, faint streaks along.
    float rib = abs(fract(phi * 10.0 / 6.28318) - 0.5) * 2.0;
    c = mix(uSkinC, uSkinA, smoothstep(0.0, 0.35, rib));
    c = mix(c, uSkinB, smoothstep(0.6, 1.0, rib) * 0.45);
    c *= 1.0 + 0.06 * vnoise2(vec2(p.x * 2.0, phi * 30.0));
  } else {
    // Coconut: hairy brown husk in fibres running end to end, and three dark eyes at one end.
    float fib = vnoise2(vec2(p.x * 3.0, phi * 34.0)) * 0.6 + vnoise2(vec2(p.x * 11.0, phi * 70.0)) * 0.4;
    c = mix(uSkinA, fib > 0.0 ? uSkinB : uSkinC, abs(fib) * 0.8);
    for (int k = 0; k < 3; k++) {
      float a = float(k) * 2.094 + 0.6;
      vec3 e = normalize(vec3(0.93, cos(a) * 0.37, sin(a) * 0.37));
      c = mix(c, uSkinC * 0.55, 1.0 - smoothstep(0.06, 0.1, length(p - e)));
    }
  }
  // The two ends darken a touch, like real fruit.
  c *= 1.0 - 0.12 * smoothstep(0.75, 1.0, abs(p.x));
  diffuseColor.rgb = c;

  // Cracks: jagged lines running round the rind either side of the band
  // pile, where the bulge strains hardest, with the pink flesh showing through.
  if (uCrack > 0.0) {
    float w = 0.003 + 0.007 * uCrack;
    float line = 0.0;
    float edge = 0.0;
    for (int k = 0; k < 2; k++) {
      float cx = k == 0 ? uCrackX.x : uCrackX.y;
      float seed = k == 0 ? 3.1 : 8.7;
      // Each crack starts on the side facing you and runs part way round,
      // unevenly, growing as the moment comes.
      float start = 1.1 + (k == 0 ? -0.25 : 0.3);
      float len = uCrack * (k == 0 ? 2.1 : 1.6);
      float a = abs(phi - start);
      float along = 1.0 - smoothstep(len - 0.25, len, a);
      float d = abs(p.x - cx - crackPath(phi, seed));
      // A side branch splitting off now and then.
      float bphi = phi * 2.0 + seed;
      float twig = abs(p.x - cx - crackPath(phi, seed) - 0.07 * (fract(bphi) - 0.5) * sign(sin(bphi * 3.1)));
      float twigOn = step(0.72, hash1(floor(bphi))) * step(0.45, uCrack);
      line = max(line, (1.0 - smoothstep(w, w + 0.004, d)) * along);
      line = max(line, (1.0 - smoothstep(w * 0.6, w * 0.6 + 0.003, twig)) * along * twigOn);
      edge = max(edge, (1.0 - smoothstep(w + 0.003, w + 0.016, d)) * along);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, uSkinC * 0.5, edge * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, uFlesh, line);
  }

  if (uFaceOn > 0.5) {
    vec3 q = vec3(p.x * uShape.x, p.y * uShape.y, p.z * uShape.y);
    vec3 fc = vec3(uFaceC.x * uShape.x, uFaceC.y * uShape.y, uFaceC.z * uShape.y);
    vec3 d = q - fc;
    vec2 uv = vec2(dot(d, uFaceU), dot(d, uFaceV)) / uFaceSize + 0.5;
    float front = step(0.0, dot(normalize(p), normalize(uFaceC)) - 0.2);
    if (front > 0.0 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec4 f = texture2D(uFace, uv);
      diffuseColor.rgb = mix(diffuseColor.rgb, f.rgb / max(f.a, 1e-3), f.a);
    }
  }
}
`;

export function makeMelonMaterial(withFace: boolean): { mat: THREE.MeshPhysicalMaterial; uniforms: MelonUniforms } {
  const uniforms: MelonUniforms = {
    uFace: { value: null },
    uFaceOn: { value: withFace ? 1 : 0 },
    uFaceC: { value: new THREE.Vector3(0, 0.34, 0.94).normalize() },
    uFaceU: { value: new THREE.Vector3(1, 0, 0) },
    uFaceV: { value: new THREE.Vector3(0, -1, 0) },
    uFaceSize: { value: 1.25 },
    uShape: { value: new THREE.Vector2(1, 1) },
    uCrack: { value: 0 },
    uCrackX: { value: new THREE.Vector2(-0.3, 0.3) },
    uPattern: { value: 0 },
    uSkinA: { value: new THREE.Color(W.skin) },
    uSkinB: { value: new THREE.Color(W.skinLight) },
    uSkinC: { value: new THREE.Color(W.stripe) },
    uFlesh: { value: new THREE.Color(W.flesh) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16,
    sheen: 0.15,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    envMapIntensity: 0.7,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR);
  };
  mat.customProgramCacheKey = () => 'soft-fruit-v5';
  return { mat, uniforms };
}

/** Dress a skin material and its uniforms as `fruit`. */
export function dressSkin(mat: THREE.MeshPhysicalMaterial, u: MelonUniforms, fruit: PopFruit) {
  const k = fruit.skin;
  u.uPattern.value = PATTERNS.indexOf(k.pattern);
  u.uSkinA.value.set(k.base);
  u.uSkinB.value.set(k.light);
  u.uSkinC.value.set(k.accent);
  u.uFlesh.value.set(fruit.flesh);
  mat.roughness = k.roughness;
  mat.clearcoat = k.clearcoat;
  mat.clearcoatRoughness = k.clearcoat > 0.2 ? 0.16 : 0.6;
  mat.sheen = k.sheen;
}

/** Flesh with the rind showing at the cut (uses vertex colours). */
export function makeFleshMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
}
