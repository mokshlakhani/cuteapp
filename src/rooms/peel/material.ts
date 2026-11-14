import * as THREE from 'three';
import { FRUIT_BUMP, FRUIT_GLSL, fruitUniforms, setFruitUniforms } from '../../render/fruitShader';
import type { SliceFruit } from '../slice/fruits';
import { SPIRAL, START_LON } from './game';

/**
 * The peel room's material: the same solid fruit as everywhere else, with the
 * skin taken off along the spiral. Under the part that's peeled it shows the
 * flesh itself (`uDepth` of the way in), richer than it is and wet: an orange
 * shows its segments, a melon its red, all dimpled so the light glistens on
 * it. The strip is the same skin, seen from behind as the pale inside of the
 * peel (`uPith`). The face stays on: a peeled fruit is still itself.
 */

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uFace;
uniform float uFaceOn;
uniform float uS;
uniform float uTurns;
uniform float uDepth;
uniform float uPith;
uniform vec3 uRipe;
uniform float uStrip;
uniform float uSpin;
varying vec3 vRest;
float peeled = 0.0;
float stripEdge = 0.0;
${FRUIT_GLSL}
// Has band k of the spiral, at this turn f (0..1) round, come off yet?
// The crown over its first band and the base under its last go along with them.
float bandOff(float k, float f) {
  return 1.0 - smoothstep(uS - 0.0015, uS + 0.0015, (clamp(k, 0.0, uTurns - 1.0) + f) / uTurns);
}
float peelMask() {
  float th = acos(clamp(vRest.y / uRad.y, -1.0, 1.0));
  float ph = atan(vRest.z / uRad.z, vRest.x / uRad.x);
  float a = (th - ${SPIRAL.from.toFixed(5)}) / ${(SPIRAL.to - SPIRAL.from).toFixed(5)} * uTurns;
  float f = fract(uSpin * (ph - ${START_LON.toFixed(5)}) / TAU);
  float x = a - f;
  float k = floor(x);
  float w = clamp(fwidth(a) * 1.2, 0.01, 0.2);
  return mix(bandOff(k, f), bandOff(k + 1.0, f), smoothstep(0.5 - w, 0.5 + w, x - k));
}
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
peeled = uStrip > 0.5 ? (gl_FrontFacing ? 0.0 : 1.0) : peelMask();
if (uStrip > 0.5) {
  float thE = acos(clamp(vRest.y / uRad.y, -1.0, 1.0));
  float phE = atan(vRest.z / uRad.z, vRest.x / uRad.x);
  float aE = (thE - ${SPIRAL.from.toFixed(5)}) / ${(SPIRAL.to - SPIRAL.from).toFixed(5)} * uTurns;
  float fE = fract(uSpin * (phE - ${START_LON.toFixed(5)}) / TAU);
  stripEdge = smoothstep(0.52, 0.98, abs(fract(aE - fE + 0.5) - 0.5) * 2.0);
}
vec3 sc = vec3(1.0);
if (peeled < 0.995) sc = fruitColor(vRest);
float skinBump = bumpH;
if (peeled > 0.005) {
  vec3 inside = fruitColor(vRest * (uStrip > 0.5 ? uPith : uDepth));
  // Ripe: richer and a little brighter than the slice's cut faces.
  if (uStrip < 0.5) inside = clamp(mix(vec3(dot(inside, vec3(0.3, 0.55, 0.15))), inside, 1.42) * uRipe, 0.0, 1.0);
  sc = mix(sc, inside, peeled);
}
if (uStrip > 0.5) {
  // Thin cut edges of the peel ribbon transmit warm pith light.
  vec3 edgeGlow = mix(sc, vec3(1.0, 0.97, 0.88), 0.55);
  sc = mix(sc, edgeGlow, stripEdge * 0.42);
}
// A soft lit step where skin ends and flesh begins, and a flesh dimpled with juice.
float dimple = sin(vRest.x * 43.0 + sin(vRest.z * 19.0)) * sin(vRest.y * 47.0 + sin(vRest.x * 17.0)) * sin(vRest.z * 41.0 + sin(vRest.y * 23.0));
bumpH = skinBump * (1.0 - peeled) + peeled * (dimple * 0.0032 * (1.0 - uStrip) - 0.03);
sc *= 1.0 - 0.14 * peeled * (1.0 - peeled) * 4.0;
if (uFaceOn > 0.5) {
  vec3 q = vRest / uRad;
  vec2 fp = vec2(q.x, q.y - 0.08) / 1.2 + 0.5;
  if (q.z > 0.2 && fp.x > 0.0 && fp.x < 1.0 && fp.y > 0.0 && fp.y < 1.0) {
    vec4 ft = texture2D(uFace, fp);
    sc = mix(sc, ft.rgb, ft.a * smoothstep(0.2, 0.5, q.z));
  }
}
diffuseColor.rgb = sc;
`;

const FRAG_ROUGH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uStrip > 0.5 ? 0.5 : 0.24, peeled);
`;

const FRAG_WET = /* glsl */ `
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
if (uStrip < 0.5) {
  material.clearcoat = mix(material.clearcoat, 1.0, peeled);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.14, peeled);
}
#endif
`;

const FRAG_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
${FRUIT_BUMP}
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * max(peeled * 0.08, uStrip * (0.12 + stripEdge * 0.18));
`;

/** Where the flesh is seen from, and the peel's pale inside, as shares of the way in. */
// A watermelon and a cantaloupe come out of their skins still wearing some
// rind (pale over the pink, green-gold over the orange), which is also what
// tells a peeled melon from a peeled orange or peach.
const DEPTH: Record<string, number> = { orange: 0.8, lemon: 0.8, apple: 0.86, kiwi: 0.8, peach: 0.84, watermelon: 0.873, cantaloupe: 0.918 };
/** What ripeness does to each flesh: warmth laid over it. */
const RIPE: Record<string, [number, number, number]> = {
  orange: [1.06, 0.84, 0.5],
  lemon: [1.06, 1, 0.5],
  apple: [1.05, 0.86, 0.46],
  kiwi: [0.9, 0.98, 0.62],
  peach: [1.0, 1.22, 2.6],
  watermelon: [1.03, 0.9, 0.86],
  cantaloupe: [1.0, 0.97, 0.7],
};
const PITH: Record<string, number> = { orange: 0.9, lemon: 0.9, apple: 0.93, kiwi: 0.92, peach: 0.94, watermelon: 0.9, cantaloupe: 0.9 };

const emptyTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/** One material for the fruit (`strip` false) or one for the peel, sharing a fruit's uniforms. */
export function makePeelMaterial(strip: boolean, shared?: Record<string, THREE.IUniform>) {
  const uniforms: Record<string, THREE.IUniform> = shared
    ? { ...shared, uStrip: { value: strip ? 1 : 0 } }
    : { ...fruitUniforms(), uFace: { value: emptyTex }, uFaceOn: { value: 1 }, uS: { value: 0 }, uTurns: { value: 4 }, uDepth: { value: 0.8 }, uPith: { value: 0.9 }, uRipe: { value: new THREE.Vector3(1, 1, 1) }, uSpin: { value: 1 }, uStrip: { value: strip ? 1 : 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.2, envMapIntensity: 0.75, sheen: 0.1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#fff1e0'), side: strip ? THREE.DoubleSide : THREE.FrontSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <lights_physical_fragment>', FRAG_WET)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => `soft-peel-v7-${strip ? 'strip' : 'body'}`;
  return { mat, uniforms };
}

export function dressPeel(mat: THREE.MeshPhysicalMaterial, u: Record<string, THREE.IUniform>, fruit: SliceFruit, turns: number) {
  setFruitUniforms(u as unknown as ReturnType<typeof fruitUniforms>, fruit);
  u.uTurns.value = turns;
  u.uDepth.value = DEPTH[fruit.id] ?? 0.8;
  u.uPith.value = PITH[fruit.id] ?? 0.9;
  (u.uRipe.value as THREE.Vector3).fromArray(RIPE[fruit.id] ?? [1, 1, 1]);
  u.uS.value = 0;
  mat.roughness = 0.78 - fruit.shine * 0.46;
  mat.clearcoat = 0.05 + fruit.shine * 0.7;
  // Velvet and fuzz: a soft sheen at grazing angles on the matte fruits (a peach, a kiwi), next to none on the glossy ones.
  mat.sheen = 0.06 + (1 - fruit.shine) * 0.6;
}
