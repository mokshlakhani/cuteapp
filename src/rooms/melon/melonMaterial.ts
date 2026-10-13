import * as THREE from 'three';
import { fruitPalette } from '../../design/fruitPalette';

/**
 * The melon's skin: a glossy vinyl-toy watermelon with wavy stripes running
 * end to end, painted in the shader from each vertex's rest position on the
 * unit melon (so stripes stay put however much the bands squeeze it, and the
 * rind shards that fly off after the pop keep their stripes).
 *
 * The face is a small canvas projected onto the middle of its front, so it
 * squashes and bulges with the melon, like every face in soft spot.
 */

const W = fruitPalette.watermelon;

const col = (c: string) => {
  const v = new THREE.Color(c);
  return `vec3(${v.r.toFixed(4)}, ${v.g.toFixed(4)}, ${v.b.toFixed(4)})`;
};

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
  float st = melonStripes(p);
  vec3 skin = mix(${col(W.skinLight)}, ${col(W.skin)}, 0.35);
  // Soft mottling in the light bands.
  float mott = 0.5 + 0.5 * sin(p.x * 41.0 + sin(p.y * 37.0) * 2.0) * sin(atan(p.z, p.y) * 29.0);
  skin = mix(skin, ${col(W.skinLight)} * 1.08, mott * 0.25);
  vec3 c = mix(skin, ${col(W.stripe)}, st);
  // The two ends darken a touch, like a real melon.
  c *= 1.0 - 0.12 * smoothstep(0.75, 1.0, abs(p.x));
  diffuseColor.rgb = c;

  // Cracks: jagged lines running round the rind either side of the band
  // pile, where the bulge strains hardest, with the pink flesh showing through.
  if (uCrack > 0.0) {
    float phi = atan(p.z, p.y);
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
    diffuseColor.rgb = mix(diffuseColor.rgb, ${col(W.stripe)} * 0.5, edge * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${col(W.flesh)}, line);
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

export function makeMelonMaterial(withFace: boolean) {
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
  mat.customProgramCacheKey = () => 'soft-melon-v4';
  return { mat, uniforms };
}

/** Pink flesh with the pale rind showing at the cut (uses vertex colours). */
export function makeFleshMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
}
