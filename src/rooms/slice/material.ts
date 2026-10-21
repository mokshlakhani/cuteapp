import * as THREE from 'three';
import { FRUIT_BUMP, FRUIT_GLSL, fruitUniforms, setFruitUniforms } from '../../render/fruitShader';
import type { SliceFruit } from './fruits';

/**
 * The slice fruits' material: a glossy physical material whose colour is a
 * *solid* texture of the fruit, evaluated at each point's place in the whole
 * fruit (`aRest`). Skin, pith, flesh, cores and seeds run through the volume,
 * so a cut anywhere shows the right cross-section — on the whole fruit and on
 * every piece it falls into. How deep a point lies follows the fruit's own
 * outline (`uOutline`, the same one its mesh is turned from), so an apple's
 * skin is as thin at its shoulders as at its middle.
 *
 * The skin has a little relief, drawn into the lighting rather than the
 * mesh: an orange's pores, a cantaloupe's raised net, a kiwi's fuzz, a
 * peach's crease. On the whole fruit the cuts made so far show as pale seams
 * round the skin, which flare as the knife passes and then glow softly, and
 * the app's face is painted on its front.
 */

/** The most cuts the whole fruit can show seams for. */
export const MAX_CUTS = 8;

export interface SliceUniforms {
  [k: string]: THREE.IUniform;
  uFruit: THREE.IUniform<number>;
  uRad: THREE.IUniform<THREE.Vector3>;
  uOutline: THREE.IUniform<THREE.Vector2>;
  uFace: THREE.IUniform<THREE.Texture>;
  uFaceOn: THREE.IUniform<number>;
  uCuts: THREE.IUniform<THREE.Vector4[]>;
  uGlow: THREE.IUniform<number[]>;
  uCutCount: THREE.IUniform<number>;
}

const VERT_HEAD = /* glsl */ `
attribute vec3 aRest;
varying vec3 vRest;
`;

const FRAG_HEAD = /* glsl */ `
#define MAX_CUTS ${MAX_CUTS}
uniform sampler2D uFace;
uniform float uFaceOn;
uniform vec4 uCuts[MAX_CUTS];
uniform float uGlow[MAX_CUTS];
uniform float uCutCount;
varying vec3 vRest;
float seamGlow = 0.0;
float inside = 0.0;
${FRUIT_GLSL}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
vec3 sc = fruitColor(vRest);
float rr = shellR(vRest / uRad);
inside = 1.0 - smoothstep(0.93, 0.95, rr);
if (uFaceOn > 0.5) {
  vec3 q = vRest / uRad;
  vec2 fp = vec2(q.x, q.y - 0.08) / 1.2 + 0.5;
  if (q.z > 0.2 && fp.x > 0.0 && fp.x < 1.0 && fp.y > 0.0 && fp.y < 1.0) {
    vec4 ft = texture2D(uFace, fp);
    sc = mix(sc, ft.rgb, ft.a * (1.0 - inside) * smoothstep(0.2, 0.5, q.z));
  }
}
// The seams of the cuts so far, round the skin.
float seam = 0.0;
for (int i = 0; i < MAX_CUTS; i++) {
  if (float(i) >= uCutCount) break;
  float d = abs(dot(uCuts[i].xyz, vRest) - uCuts[i].w);
  float fw = fwidth(d);
  float line = 1.0 - smoothstep(0.018, 0.018 + fw * 1.5, d);
  float halo = (1.0 - smoothstep(0.0, 0.16, d)) * uGlow[i];
  seam = max(seam, line);
  seamGlow = max(seamGlow, line * (0.25 + uGlow[i] * 1.4) + halo * 0.5);
}
sc = mix(sc, vec3(1.0, 0.97, 0.9), seam * (1.0 - inside));
seamGlow *= 1.0 - inside;
// Relief only on the skin, and smoothed out under the seams.
bumpH *= (1.0 - inside) * (1.0 - seam);
diffuseColor.rgb = sc;
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
${FRUIT_BUMP}
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
// Cut flesh is wet and glossy, whatever the skin is like.
roughnessFactor = mix(roughnessFactor, 0.34, inside);
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * seamGlow;
// A little light in the flesh, so cut faces glow like fresh fruit.
totalEmissiveRadiance += diffuseColor.rgb * inside * 0.1;
`;

const emptyTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export function makeSliceMaterial(seams: boolean) {
  const uniforms: SliceUniforms = {
    ...fruitUniforms(),
    uFace: { value: emptyTex },
    uFaceOn: { value: 0 },
    uCuts: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4(0, 1, 0, 99)) },
    uGlow: { value: new Array(MAX_CUTS).fill(0) },
    uCutCount: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.75,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => `soft-slice-v2-${seams ? 's' : 'p'}`;
  return { mat, uniforms };
}

/**
 * Dress a material for a fruit: its solid texture, its outline and how glossy
 * its skin is. (Clearcoat stays above zero for every fruit, so switching
 * fruit never swaps the shader program mid-game.)
 */
export function dressSlice(mat: THREE.MeshPhysicalMaterial, u: SliceUniforms, fruit: SliceFruit) {
  setFruitUniforms(u, fruit);
  mat.roughness = 0.78 - fruit.shine * 0.46;
  mat.clearcoat = 0.05 + fruit.shine * 0.7;
}
