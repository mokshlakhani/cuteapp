import * as THREE from 'three';
import { TAU } from '../../core/math';
import { MELON_A, type Band, type MelonShape } from './shape';

/**
 * Rubber bands on the melon: flat ribbons that follow the melon's surface
 * all the way round, wherever it's pinched. A new band floats loose and
 * oversized, then snaps tight and digs in a little.
 */

const SEG = 72;
const CROSS = 8;

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
    // Real rubber bands are wide flat ribbons that thin out when stretched tight.
    const stretch = Math.max(0, Math.min(1.2, 1 - loose));
    const w = 0.082 * b.thick * (1 - 0.32 * stretch + Math.max(0, loose) * 0.25);
    const t = 0.013 * b.thick * (1 - 0.2 * stretch);
    const tilt = Math.tan(b.tilt * (1 + Math.max(0, loose) * 2.2));
    const xc = b.x.value;
    const r0 = surfaceAt(xc);
    // Visible twang ripple when a band snaps onto the fruit.
    const twangOsc = b.twang > 0 ? b.twang * Math.sin(b.twangAge * 44) : 0;
    let k = 0;
    for (let i = 0; i < SEG; i++) {
      const th = (i / SEG) * TAU;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const harmonic = Math.sin(th * 5 + b.lean) + 0.45 * Math.cos(th * 3 - b.lean * 0.7);
      const twangX = twangOsc * harmonic * 0.042;
      const twangR = Math.abs(twangOsc * harmonic) * 0.028;
      // A tilted ring wanders a little along the melon as it goes round.
      const xn = xc + (tilt * r0 * Math.cos(th - b.lean) + twangX) / L;
      // Loose: floats out; snapping: digs in a touch past the surface, with a twang ripple.
      const r = surfaceAt(xn) + t * 0.65 + loose * 0.55 + twangR;
      const cx = xn * L;
      const cy = ct * r;
      const cz = st * r;
      for (let j = 0; j < CROSS; j++) {
        const ps = (j / CROSS) * TAU;
        const crRaw = Math.cos(ps);
        const srRaw = Math.sin(ps);
        // Boxy-rounded ribbon cross-section (flat top/bottom, crisp band edges).
        const cr = Math.sign(crRaw) * Math.pow(Math.abs(crRaw), 0.55);
        const sr = Math.sign(srRaw) * Math.pow(Math.abs(srRaw), 0.65);
        this.pos[k] = cx + sr * w;
        this.pos[k + 1] = cy + ct * cr * t;
        this.pos[k + 2] = cz + st * cr * t;
        const nx = srRaw / (w * 1.4);
        const nr = crRaw / t;
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
