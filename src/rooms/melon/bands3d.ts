import * as THREE from 'three';
import { TAU } from '../../core/math';
import { MELON_A, type Band, type MelonShape } from './shape';

/**
 * Rubber bands on the melon: flat ribbons that follow the melon's surface
 * all the way round, wherever it's pinched. A new band floats loose and
 * oversized, then snaps tight and digs in a little.
 */

const SEG = 72;
const CROSS = 6;

export class BandMesh {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private nrm: Float32Array;

  constructor(
    readonly band: Band,
    material: THREE.Material,
  ) {
    const n = SEG * CROSS;
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    const index: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const i1 = (i + 1) % SEG;
      for (let j = 0; j < CROSS; j++) {
        const j1 = (j + 1) % CROSS;
        const a = i * CROSS + j;
        const b = i1 * CROSS + j;
        const c = i1 * CROSS + j1;
        const d = i * CROSS + j1;
        index.push(a, b, d, b, c, d);
      }
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
  }

  /** Refit the ribbon to the melon's current shape. */
  update(shape: MelonShape, surfaceAt: (xn: number) => number) {
    const b = this.band;
    const Ls = shape.lengthScale;
    const L = MELON_A * Ls;
    const loose = b.loose.value;
    const w = 0.055 * b.thick * (1 - Math.min(0.3, Math.max(0, loose) * 0.3));
    const t = 0.03 * b.thick;
    const tilt = Math.tan(b.tilt * (1 + Math.max(0, loose) * 2.2));
    const xc = b.x.value;
    const r0 = surfaceAt(xc);
    let k = 0;
    for (let i = 0; i < SEG; i++) {
      const th = (i / SEG) * TAU;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      // A tilted ring wanders a little along the melon as it goes round.
      const xn = xc + (tilt * r0 * Math.cos(th - b.lean)) / L;
      // Loose: floats out; snapping: digs in a touch past the surface.
      const r = surfaceAt(xn) + t * 0.6 + loose * 0.55;
      const cx = xn * L;
      const cy = ct * r;
      const cz = st * r;
      for (let j = 0; j < CROSS; j++) {
        const ps = (j / CROSS) * TAU;
        const cr = Math.cos(ps);
        const sr = Math.sin(ps);
        this.pos[k] = cx + sr * w;
        this.pos[k + 1] = cy + ct * cr * t;
        this.pos[k + 2] = cz + st * cr * t;
        const nx = sr / w;
        const nr = cr / t;
        const l = Math.hypot(nx, nr) || 1;
        this.nrm[k] = nx / l;
        this.nrm[k + 1] = (ct * nr) / l;
        this.nrm[k + 2] = (st * nr) / l;
        k += 3;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
  }
}
