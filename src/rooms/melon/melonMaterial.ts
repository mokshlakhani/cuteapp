import * as THREE from 'three';
import { fruitPalette } from '../../design/fruitPalette';
import { FRUIT_BUMP, FRUIT_GLSL, fruitUniforms, setFruitUniforms } from '../../render/fruitShader';
import type { PopFruit } from './fruits';

/**
 * The fruit's skin, painted in the shader from each vertex's rest position on
 * the unit fruit (so the pattern stays put however much the bands squeeze it,
 * and the rind pieces that fly off after the pop keep it). It's the very same
 * skin the slice room uses (render/fruitShader.ts), so each fruit looks the
 * same in both: a watermelon's stripes, a cantaloupe's net, an orange's
 * pores, an apple's freckles, a peach's crease, all with the same relief.
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
  /** The skin's darker accent (round the cracks), and the flesh showing through them. */
  uSkinC: THREE.IUniform<THREE.Color>;
  uFlesh: THREE.IUniform<THREE.Color>;
  /** Which fruit, its radii and outline (the shared fruit skin; see render/fruitShader.ts). */
  uFruit: THREE.IUniform<number>;
  uRad: THREE.IUniform<THREE.Vector3>;
  uOutline: THREE.IUniform<THREE.Vector2>;
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
uniform vec3 uSkinC;
uniform vec3 uFlesh;
${FRUIT_GLSL}

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
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  vec3 p = vRest;
  float phi = atan(p.z, p.y);
  // The shared fruit skin: in the fruit's own frame its core runs up y (here
  // it lies along x) and it faces +z. Pushed out onto its outline, then sized.
  vec3 sq = vec3(p.y, p.x, p.z);
  sq /= max(0.05, shellR(sq));
  diffuseColor.rgb = fruitColor(sq * uRad);

  // Cracks: jagged splits creeping outward from the waist either side of the
  // band pile, with a pale rind lip and bright juice-lit flesh gleaming inside.
  if (uCrack > 0.0) {
    float line = 0.0;
    float coreGlow = 0.0;
    float pithRim = 0.0;
    float edge = 0.0;
    for (int k = 0; k < 2; k++) {
      float cx = k == 0 ? uCrackX.x : uCrackX.y;
      float seed = k == 0 ? 3.1 : 8.7;
      // Each crack starts on the front bulge and creeps outward round the fruit
      // over the last second, widening at the waist as the tip advances.
      float start = 1.15 + (k == 0 ? -0.22 : 0.25);
      float len = (0.18 + 0.82 * uCrack) * (k == 0 ? 2.65 : 2.15);
      float a = abs(phi - start);
      float along = clamp(1.0 - smoothstep(max(0.0, len - 0.42), len, a), 0.0, 1.0);
      float taper = smoothstep(len, max(0.0, len - 0.55), a);
      float w = (0.0045 + 0.020 * uCrack) * (0.25 + 0.75 * taper);
      float path = crackPath(phi, seed);
      float d = abs(p.x - cx - path);
      // Forking side branches that creep out as tension mounts.
      float bphi = phi * 2.4 + seed;
      float branchDir = sign(sin(bphi * 3.1));
      float twig = abs(p.x - cx - path - 0.095 * (fract(bphi) - 0.35) * branchDir);
      float twigOn = step(0.58, hash1(floor(bphi))) * smoothstep(0.22, 0.55, uCrack) * taper;
      float mainTear = (1.0 - smoothstep(w * 0.7, w + 0.004, d)) * along;
      float twigTear = (1.0 - smoothstep(w * 0.45, w * 0.45 + 0.0035, twig)) * along * twigOn;
      line = max(line, max(mainTear, twigTear));
      coreGlow = max(coreGlow, (1.0 - smoothstep(0.0, w * 0.48, d)) * along);
      pithRim = max(pithRim, (1.0 - smoothstep(w, w + 0.007, d)) * (1.0 - mainTear) * along);
      edge = max(edge, (1.0 - smoothstep(w + 0.003, w + 0.022, d)) * along);
      edge = max(edge, (1.0 - smoothstep(w * 0.45 + 0.002, w * 0.45 + 0.014, twig)) * along * twigOn * 0.7);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, uSkinC * 0.32, edge * 0.68);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.98, 0.86), pithRim * 0.82);
    bumpH = mix(bumpH, -0.042, clamp(edge * 0.85 + line, 0.0, 1.0));
    vec3 wetJuice = mix(uFlesh, vec3(1.0, 0.94, 0.90), 0.42 + 0.38 * coreGlow) * (1.18 + 0.25 * uCrack);
    diffuseColor.rgb = mix(diffuseColor.rgb, wetJuice, line);
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
    uSkinC: { value: new THREE.Color(W.stripe) },
    uFlesh: { value: new THREE.Color(W.flesh) },
    ...fruitUniforms(),
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
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRUIT_BUMP}`);
  };
  mat.customProgramCacheKey = () => 'soft-fruit-v7';
  return { mat, uniforms };
}

/** Dress a skin material and its uniforms as `fruit`: the slice fruit's skin and gloss. */
export function dressSkin(mat: THREE.MeshPhysicalMaterial, u: MelonUniforms, fruit: PopFruit) {
  setFruitUniforms(u, fruit.look);
  u.uSkinC.value.set(fruit.skin.accent);
  u.uFlesh.value.set(fruit.flesh);
  // The same gloss as in slice (see slice/material.ts dressSlice).
  mat.roughness = 0.78 - fruit.look.shine * 0.46;
  mat.clearcoat = 0.05 + fruit.look.shine * 0.7;
  mat.clearcoatRoughness = 0.18;
  // Velvet and fuzz: a soft sheen at grazing angles on the matte fruits (a peach, a kiwi), next to none on the glossy ones.
  mat.sheen = 0.06 + (1 - fruit.look.shine) * 0.6;
}

/** Flesh with the rind showing at the cut (uses vertex colours). */
export function makeFleshMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
}
