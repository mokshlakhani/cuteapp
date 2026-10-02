import * as THREE from 'three';
import type { Variety } from './varieties';
import { WEDGE } from './Piece';

/**
 * The melon-jelly material: a glossy physical material whose colour is a
 * *solid* texture evaluated from each vertex's rest position in the original
 * fruit. Flesh, pale rind, striped skin and seeds therefore run through the
 * whole volume — every cut face shows the right cross-section.
 *
 * On top of that: a soft "light through jelly" glow, a bright translucent rim,
 * and a face decal painted onto the caps, under the clear-coat, so it reads
 * as being inside the jelly and bends with it.
 */

export const NSEEDS = 22;

export interface SharedUniforms {
  [k: string]: THREE.IUniform;
  uFlesh: THREE.IUniform<THREE.Color>;
  uFleshLight: THREE.IUniform<THREE.Color>;
  uRind: THREE.IUniform<THREE.Color>;
  uSkin: THREE.IUniform<THREE.Color>;
  uSkinStripe: THREE.IUniform<THREE.Color>;
  uSeed: THREE.IUniform<THREE.Color>;
  uApex: THREE.IUniform<THREE.Vector2>;
  uRadius: THREE.IUniform<number>;
  uSkinW: THREE.IUniform<number>;
  uRindW: THREE.IUniform<number>;
  uSeeds: THREE.IUniform<THREE.Vector4[]>;
  uGlow: THREE.IUniform<number>;
  uRim: THREE.IUniform<number>;
}

function seededSeeds(): THREE.Vector4[] {
  // Deterministic layout: a ring near the rind, a few deeper, some at the top
  // surface (visible like the reference), some hidden inside for cuts to find.
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

export function createShared(v: Variety): SharedUniforms {
  const u: SharedUniforms = {
    uFlesh: { value: new THREE.Color() },
    uFleshLight: { value: new THREE.Color() },
    uRind: { value: new THREE.Color() },
    uSkin: { value: new THREE.Color() },
    uSkinStripe: { value: new THREE.Color() },
    uSeed: { value: new THREE.Color() },
    uApex: { value: new THREE.Vector2(0, 0) },
    uRadius: { value: WEDGE.radius },
    uSkinW: { value: 0.42 },
    uRindW: { value: 0.72 },
    uSeeds: { value: seededSeeds() },
    uGlow: { value: 0.16 },
    uRim: { value: 0.32 },
  };
  applyVariety(u, v);
  return u;
}

export function applyVariety(u: SharedUniforms, v: Variety) {
  u.uFlesh.value.set(v.flesh);
  u.uFleshLight.value.set(v.fleshLight);
  u.uRind.value.set(v.rind);
  u.uSkin.value.set(v.skin);
  u.uSkinStripe.value.set(v.skinStripe);
  u.uSeed.value.set(v.seed);
}

const VERT_HEAD = /* glsl */ `
attribute vec3 aRest;
attribute float aCap;
varying vec3 vRest;
varying float vCap;
`;

const FRAG_HEAD = /* glsl */ `
#define NSEEDS ${NSEEDS}
uniform vec3 uFlesh;
uniform vec3 uFleshLight;
uniform vec3 uRind;
uniform vec3 uSkin;
uniform vec3 uSkinStripe;
uniform vec3 uSeed;
uniform vec2 uApex;
uniform float uRadius;
uniform float uSkinW;
uniform float uRindW;
uniform vec4 uSeeds[NSEEDS];
uniform float uGlow;
uniform float uRim;
uniform sampler2D uFace;
uniform vec4 uFaceRect;
varying vec3 vRest;
varying float vCap;

vec3 melonColor(vec3 p, float clearSeeds) {
  vec2 d = p.xz - uApex;
  float r = length(d);
  float edgeSkin = uRadius - uSkinW;
  float edgeRind = edgeSkin - uRindW;
  // Juicy flesh, a touch lighter toward the rind, with a faint grain.
  vec3 col = mix(uFlesh, uFleshLight, smoothstep(edgeRind - 2.4, edgeRind, r) * 0.6);
  float grain = sin(p.x * 7.1 + sin(p.z * 5.3)) * sin(p.z * 6.7 + p.y * 3.0);
  col *= 1.0 + grain * 0.04;
  col = mix(col, uRind, smoothstep(edgeRind - 0.07, edgeRind + 0.07, r));
  // Striped skin
  float ang = atan(d.y, d.x);
  // Long jagged stripes running top to bottom, like a real rind.
  float st = sin(ang * 34.0 + sin(ang * 90.0) * 0.35 + sin(p.y * 2.2 + ang * 20.0) * 0.25);
  vec3 skin = mix(uSkin, uSkinStripe, smoothstep(-0.2, 0.35, st));
  col = mix(col, skin, smoothstep(edgeSkin - 0.07, edgeSkin + 0.04, r));
  // Teardrop seeds, pointing out toward the rind.
  for (int i = 0; i < NSEEDS; i++) {
    vec3 q = p - uSeeds[i].xyz;
    if (dot(q, q) > 0.25) continue;
    vec2 dir = normalize(uSeeds[i].xz - uApex);
    float a = dot(q.xz, dir);
    float b = dot(q.xz, vec2(-dir.y, dir.x));
    float w = a > 0.0 ? mix(0.17, 0.08, clamp(a / 0.3, 0.0, 1.0)) : 0.17;
    float e = (a * a) / (0.31 * 0.31) + (b * b) / (w * w) + (q.y * q.y) / (0.15 * 0.15);
    float m = (1.0 - smoothstep(0.75, 1.0, e)) * (1.0 - clearSeeds);
    vec3 seedCol = mix(uSeed, vec3(0.35, 0.22, 0.18), smoothstep(0.0, 0.6, -a / 0.3) * 0.5);
    col = mix(col, seedCol, m);
  }
  return col;
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
vec3 jc = melonColor(vRest, faceZone);
if (uFaceRect.w > 0.5) {
  vec2 f = vec2((vRest.x - uFaceRect.x) / uFaceRect.z + 0.5, (vRest.z - uFaceRect.y) / uFaceRect.z + 0.5);
  float topMask = smoothstep(0.9, 0.995, vCap);
  float botMask = smoothstep(0.9, 0.995, -vCap);
  if (f.x > 0.0 && f.x < 1.0 && f.y > 0.0 && f.y < 1.0) {
    // Face "up" points away from the camera (−z) so it reads upright.
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
  // Light scattered inside the jelly + a bright translucent rim.
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

export function makeJellyMaterial(shared: SharedUniforms) {
  const local = {
    uFace: { value: emptyFace as THREE.Texture },
    uFaceRect: { value: new THREE.Vector4(0, 0, 1, 0) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.26,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.12,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#ffffff'),
    specularIntensity: 0.9,
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
  mat.customProgramCacheKey = () => 'melon-jelly-v1';
  return { mat, local };
}
