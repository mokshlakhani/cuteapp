import * as THREE from 'three';
import { fruitPalette as F } from '../../design/fruitPalette';
import type { SliceFruit } from './fruits';
import { onSkin, skinNormal, type V3 } from './polyhedron';

/**
 * The little things on a fruit that make it read as itself: an apple's
 * stem and leaf, an orange's green calyx, a lemon's pointed tips, a dragon
 * fruit's leafy scales. They're small separate meshes in the toy style
 * (soft, rounded, flat colour), each pinned to a spot on the skin. The knife
 * doesn't cut them: when the fruit falls apart, each goes with the piece
 * it's sitting on.
 */
export interface Extra {
  obj: THREE.Object3D;
  /** Where it's pinned, in the fruit's own space. */
  at: V3;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.6) {
  const key = `${color}|${roughness}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    mats.set(key, m);
  }
  return m;
}

let bractMat: THREE.MeshStandardMaterial | null = null;

const GREEN = '#6FAE45';
const DARK_GREEN = '#4E8A3A';
const BROWN = '#7A5230';

/** A soft leaf: a flattened, pointed spheroid, its base at the origin, pointing along +y. */
function leafGeo(len: number, wid: number) {
  const g = new THREE.SphereGeometry(1, 14, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // Pointed at the tip, rounded at the base.
    const k = y > 0 ? 1 - y * 0.75 : 1;
    p.setXYZ(i, p.getX(i) * wid * k, (y + 1) * 0.5 * len, p.getZ(i) * wid * 0.22 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A curved stalk from the origin, up and leaning over. */
function stalkGeo(len: number, r: number, lean: number) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, -0.05, 0),
    new THREE.Vector3(0, len * 0.6, 0),
    new THREE.Vector3(lean, len, 0),
  );
  return new THREE.TubeGeometry(curve, 10, r, 8, false);
}

/** Point an object's +y along `dir`, with its flat side (+z) facing `face`. */
function aim(obj: THREE.Object3D, dir: THREE.Vector3, face: THREE.Vector3) {
  const y = dir.clone().normalize();
  const z = face.clone().addScaledVector(y, -face.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A ring of `n` small leaves round the top, lying back onto the skin (a calyx). */
function calyx(n: number, len: number, color: string, top: THREE.Vector3, tilt = 1.15) {
  const g = new THREE.Group();
  g.position.copy(top);
  const geo = leafGeo(len, len * 0.42);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const m = new THREE.Mesh(geo, mat(color, 0.55));
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    aim(m, out.clone().multiplyScalar(Math.sin(tilt)).add(new THREE.Vector3(0, Math.cos(tilt), 0)), new THREE.Vector3(0, 1, 0));
    g.add(m);
  }
  return g;
}

export function buildExtras(fruit: SliceFruit): Extra[] {
  const radii = fruit.radii as V3;
  const s = fruit.shape;
  const ry = radii[1];
  const top = new THREE.Vector3(0, ry, 0);
  const out: Extra[] = [];
  const add = (obj: THREE.Object3D, at: V3) => {
    obj.traverse((o) => {
      o.castShadow = true;
    });
    out.push({ obj, at });
  };

  switch (fruit.id) {
    case 'orange': {
      // A little green star of a calyx and the stub of its stem.
      const g = calyx(5, 0.2, DARK_GREEN, top.clone().setY(ry - 0.02), 1.3);
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 8), mat('#6B7A3A'));
      stub.position.y = 0.04;
      g.add(stub);
      add(g, [0, ry, 0]);
      break;
    }
    case 'apple': {
      // A woody stem rising from its hollow, and a leaf.
      const g = new THREE.Group();
      g.position.set(0, ry - 0.1, 0);
      g.add(new THREE.Mesh(stalkGeo(0.48, 0.04, 0.1), mat(BROWN, 0.7)));
      const leaf = new THREE.Mesh(leafGeo(0.62, 0.28), mat(GREEN, 0.5));
      leaf.position.set(0.04, 0.3, 0);
      aim(leaf, new THREE.Vector3(0.9, 0.35, -0.25), new THREE.Vector3(0, 1, 0.2));
      g.add(leaf);
      add(g, [0, ry, 0]);
      break;
    }
    case 'lemon': {
      // Its pointed tips, in its own yellow, and a dot of green calyx on top.
      const tipGeo = new THREE.SphereGeometry(1, 14, 10);
      tipGeo.scale(0.13, 0.2, 0.13);
      const peel = mat(F.lemon.peel, 0.4);
      for (const sgn of [1, -1]) {
        const tip = new THREE.Mesh(tipGeo, peel);
        tip.position.set(0, sgn * (ry - 0.02), 0);
        add(tip, [0, sgn * ry, 0]);
      }
      const dot = calyx(5, 0.1, DARK_GREEN, top.clone().setY(ry + 0.14), 1.0);
      add(dot, [0, ry, 0]);
      break;
    }
    case 'kiwi': {
      // Small dry nubs at both ends.
      const nubGeo = new THREE.SphereGeometry(0.07, 10, 8);
      for (const sgn of [1, -1]) {
        const nub = new THREE.Mesh(nubGeo, mat('#5E4127', 0.9));
        nub.position.set(0, sgn * (ry - 0.01), 0);
        nub.scale.set(1, 0.6, 1);
        add(nub, [0, sgn * ry, 0]);
      }
      break;
    }
    case 'watermelon': {
      // A short, curly stub of vine.
      const g = new THREE.Group();
      g.position.set(0, ry - 0.03, 0);
      g.add(new THREE.Mesh(stalkGeo(0.3, 0.05, 0.16), mat('#7C8F3E', 0.6)));
      add(g, [0, ry, 0]);
      break;
    }
    case 'peach': {
      const g = new THREE.Group();
      g.position.set(0, ry - 0.06, 0);
      g.add(new THREE.Mesh(stalkGeo(0.16, 0.04, 0.02), mat(BROWN, 0.7)));
      const leaf = new THREE.Mesh(leafGeo(0.7, 0.24), mat(GREEN, 0.5));
      leaf.position.set(0.02, 0.12, 0);
      aim(leaf, new THREE.Vector3(-0.85, 0.45, 0.2), new THREE.Vector3(0, 1, 0.3));
      g.add(leaf);
      add(g, [0, ry, 0]);
      break;
    }
    case 'cantaloupe': {
      const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 10), mat('#8C7A4A', 0.85));
      nub.position.set(0, ry, 0);
      add(nub, [0, ry, 0]);
      break;
    }
    case 'dragonfruit': {
      // Leafy scales, pink at the base and green at the tip, curling up and
      // out in staggered rows; more of them, closer together, at the crown.
      // (None across its face, so it stays easy to read.)
      const bm = (bractMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }));
      // Broad and short, lying close along the skin with only their tips lifting.
      const big = bractGeo(0.5, 0.3);
      const small = bractGeo(0.36, 0.22);
      const rows = [
        { th: 0.34, n: 5, geo: small, out: 0.2 },
        { th: 0.78, n: 7, geo: big, out: 0.22 },
        { th: 1.25, n: 7, geo: big, out: 0.24 },
        { th: 1.72, n: 7, geo: big, out: 0.24 },
        { th: 2.2, n: 6, geo: small, out: 0.22 },
      ];
      rows.forEach((row, ri) => {
        for (let k = 0; k < row.n; k++) {
          const ph = ((k + (ri % 2) * 0.5) / row.n) * Math.PI * 2 + 0.3;
          const p = onSkin(s, radii, row.th, ph);
          const q = [p[0] / radii[0], p[1] / radii[1], p[2] / radii[2]];
          if (q[2] > 0.45 && Math.abs(q[1]) < 0.55) continue;
          const n = new THREE.Vector3(...skinNormal(s, radii, p));
          // Up along the skin toward the crown, leaning out from it.
          const upAlong = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
          const m = new THREE.Mesh(row.geo, bm);
          m.position.set(p[0], p[1], p[2]).addScaledVector(n, -0.02);
          aim(m, upAlong.multiplyScalar(1 - row.out).addScaledVector(n, row.out), n);
          add(m, p);
        }
      });
      // The crown: a few tight scales closing over the top.
      const crown = new THREE.Group();
      crown.position.set(0, ry - 0.05, 0);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        const m = new THREE.Mesh(small, bm);
        const o = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        aim(m, o.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, 1, 0)), o);
        crown.add(m);
      }
      add(crown, [0, ry, 0]);
      break;
    }
  }
  return out;
}

/** A dragon fruit scale: a soft pointed leaf shaded magenta → pale pink → green at the tip. */
function bractGeo(len: number, wid: number) {
  const g = leafGeo(len, wid);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const base = new THREE.Color(F.dragonfruit.skin);
  const mid = new THREE.Color(F.dragonfruit.rim);
  const tip = new THREE.Color('#9CCB5A');
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    if (t < 0.55) tmp.copy(base).lerp(mid, t / 0.55);
    else tmp.copy(mid).lerp(tip, (t - 0.55) / 0.45);
    c.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Free an extra's geometry (materials are shared and kept). */
export function disposeExtra(e: Extra) {
  e.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}
