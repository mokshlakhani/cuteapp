import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ease } from '../../design/motion';

/**
 * A butter knife: a soft satin blade with a round end and nothing pointed,
 * on a chunky handle painted butter yellow — rounded like every other soft
 * spot toy, and gentle enough to hand to anyone.
 *
 * It hovers over the line you draw, lined up with it, then chops straight
 * down when you let go. If everything under it is too small to cut, it
 * bounces off with a springy wobble instead.
 *
 * Local frame: the cutting edge runs along +x at y = 0, centred on x = 0.
 */

/** Edge length, heel to tip (cm, before scaling). */
const BLADE_L = 11.4;
const SCALE = 0.82;
const HOVER = 4.6;
/** Blade leaned back (rad) while aiming, so its face shows from above. */
const AIM_TILT = -1.2;
const CHOP_T = 0.21;
const WINDUP_U = 0.32;
const BOUNCE_T = 0.62;
const LIFT_T = 0.45;

type Phase = 'hidden' | 'aiming' | 'chop' | 'hold' | 'bounce' | 'lift';
export type CutResult = 'cut' | 'bounce' | 'none';

/** Blade height at the heel: tapers to a sharp point at the tip. */
const BUTTER_H = 2.45;

/**
 * A sharp chef/slicing knife blade: a pointed drop-point tip, swept belly,
 * razor-thin V-ground cutting edge bevel, crisp grind shoulder line, satin
 * flat with diagonal specular sheen, and a polished spine ridge with distal taper.
 */
function bladeGeometry() {
  const NX = 56;
  const heelR = 0.22;
  const halfT = 0.115;
  const tipY = BUTTER_H * 0.34;

  // Cross-section profile from razor cutting edge (v=0, z=0) across the primary
  // V-bevel (v=0..0.30), satin flat (v=0.30..0.86), to the spine ridge (v=0.86..1.0).
  const prof: { v: number; z: number; ny: number; nz: number; kind: 'bevel' | 'flat' | 'spine' }[] = [
    { v: 0.0, z: 0.0, ny: -0.74, nz: 0.673, kind: 'bevel' },
    { v: 0.06, z: halfT * 0.22, ny: -0.66, nz: 0.751, kind: 'bevel' },
    { v: 0.3, z: halfT * 0.94, ny: -0.44, nz: 0.898, kind: 'bevel' },
    { v: 0.3, z: halfT * 0.94, ny: 0.02, nz: 0.999, kind: 'flat' },
    { v: 0.58, z: halfT, ny: 0.0, nz: 1.0, kind: 'flat' },
    { v: 0.86, z: halfT * 1.05, ny: -0.04, nz: 0.999, kind: 'flat' },
    { v: 0.86, z: halfT * 1.05, ny: 0.48, nz: 0.877, kind: 'spine' },
    { v: 0.95, z: halfT * 0.78, ny: 0.82, nz: 0.572, kind: 'spine' },
    { v: 1.0, z: 0.0, ny: 1.0, nz: 0.0, kind: 'spine' },
  ];
  const NV = prof.length;

  const spanAt = (x: number): [number, number, number] => {
    const u = Math.min(1, Math.max(0, x / BLADE_L));
    // Spine drops gracefully toward the sharp point at x = BLADE_L.
    const yMax = BUTTER_H - Math.pow(u, 1.85) * (BUTTER_H - tipY);
    if (x < heelR) {
      const hu = x / heelR;
      const choil = heelR * 0.45 * (1 - Math.sqrt(Math.max(0, 1 - (1 - hu) * (1 - hu))));
      return [choil, yMax - choil * 0.3, -0.45 * (1 - hu)];
    }
    // Straight razor edge from heel to 58% length, then a curved belly sweeping up to a sharp point.
    const bellyStart = 0.56;
    if (u > bellyStart) {
      const bu = (u - bellyStart) / (1 - bellyStart);
      const yMin = Math.pow(bu, 2.2) * tipY;
      const slopeX = (2.2 * Math.pow(bu, 1.2) * tipY) / ((1 - bellyStart) * BLADE_L);
      return [yMin, Math.max(yMin + 0.002, yMax), slopeX];
    }
    return [0, yMax, 0];
  };

  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const cRazorEdge = new THREE.Color('#ffffff');
  const cBevelTop = new THREE.Color('#eef2f7');
  const cGrindLine = new THREE.Color('#8c827a');
  const cFlatBase = new THREE.Color('#d8d2cb');
  const cFlatShade = new THREE.Color('#bfb6ad');
  const cReflect = new THREE.Color('#ffffff');
  const cSpine = new THREE.Color('#ffffff');
  const tmp = new THREE.Color();

  for (const side of [1, -1]) {
    const baseIdx = pos.length / 3;
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      // Cluster samples toward the heel and the sharp point.
      const x = BLADE_L * (0.5 - 0.5 * Math.cos(u * Math.PI));
      const [y0, y1, nxTip] = spanAt(x);
      // Distal taper: blade thins steadily to a needle point at x = BLADE_L.
      const distal = Math.max(0.03, 1 - 0.95 * Math.pow(x / BLADE_L, 1.45));
      for (let j = 0; j < NV; j++) {
        const p = prof[j];
        const y = y0 + p.v * (y1 - y0);
        const z = side * p.z * distal;
        pos.push(x, y, z);

        const nx = nxTip * p.nz;
        const ny = p.ny;
        const nz = side * p.nz;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nrm.push(nx / nl, ny / nl, nz / nl);

        // Diagonal specular reflection across the blade + high-contrast razor bevel.
        const diag = (x / BLADE_L) * 1.35 + p.v * 0.55;
        const d1 = (diag - 0.66) / 0.19;
        const d2 = (diag - 1.12) / 0.1;
        const sheen = Math.exp(-(d1 * d1)) * 0.65 + Math.exp(-(d2 * d2)) * 0.42;

        if (p.kind === 'bevel') {
          const bv = p.v / 0.3;
          // Gleaming white razor edge line right at v=0, shading across the ground bevel.
          tmp.copy(cRazorEdge).lerp(cBevelTop, Math.pow(bv, 0.6) * 0.65);
          tmp.lerp(cReflect, sheen * 0.6);
        } else if (p.kind === 'flat') {
          const fv = (p.v - 0.3) / (0.86 - 0.3);
          tmp.copy(cFlatBase).lerp(cFlatShade, fv * 0.72);
          // Crisp dark grind shoulder line right where the flat meets the primary bevel.
          if (fv < 0.06) tmp.lerp(cGrindLine, 0.7);
          tmp.lerp(cReflect, sheen * 0.78);
        } else {
          tmp.copy(cSpine);
        }
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }

    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NV - 1; j++) {
        // Skip degenerate triangles at the duplicated normal-split seams (j=1 and j=4).
        if (prof[j].v === prof[j + 1].v) continue;
        const a = baseIdx + i * NV + j;
        const b = baseIdx + (i + 1) * NV + j;
        const c = baseIdx + (i + 1) * NV + (j + 1);
        const d = baseIdx + i * NV + (j + 1);
        if (side > 0) idx.push(a, b, c, a, c, d);
        else idx.push(a, c, b, a, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export class Knife {
  readonly group = new THREE.Group();
  /** Pivot at the bolster, so the bounce wobbles the blade like a diving board. */
  private wob = new THREE.Group();
  private mats: THREE.Material[] = [];
  private phase: Phase = 'hidden';
  private t = 0;
  private opacity = 0;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = 0;
  private targetYaw = 0;
  private y = HOVER;
  private fromY = 0;
  private didCut = false;
  private tilt = AIM_TILT;
  /**
   * cot(camera elevation): a raised point looks further away from above, so
   * the hovering blade is drawn this much nearer per cm of height to sit
   * right over the line you're drawing.
   */
  viewCot = 0;
  /** Called once, the moment the edge reaches the jelly; says what happened. */
  onCut: (() => CutResult) | null = null;
  /** Called when the blade meets the board. */
  onLand: (() => void) | null = null;

  constructor() {
    // Polished high-carbon steel with razor bevel and spine highlights.
    const steel = new THREE.MeshPhysicalMaterial({
      color: '#fbfcfe',
      vertexColors: true,
      metalness: 0.84,
      roughness: 0.16,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      envMapIntensity: 4.2,
      transparent: true,
    });
    const fittings = new THREE.MeshPhysicalMaterial({
      color: '#f1e3cf',
      metalness: 0.7,
      roughness: 0.18,
      clearcoat: 0.6,
      envMapIntensity: 5,
      transparent: true,
    });
    const wood = new THREE.MeshPhysicalMaterial({
      color: '#f1cf86',
      metalness: 0,
      roughness: 0.5,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
      transparent: true,
    });
    this.mats = [steel, fittings, wood];

    const body = new THREE.Group();
    const blade = new THREE.Mesh(bladeGeometry(), steel);

    // Handle: rounded, a touch fuller toward the butt, sitting in line with
    // the spine so the knife reads clearly from above.
    const HL = 5.4;
    const handleGeo = new RoundedBoxGeometry(HL, 1.2, 0.98, 4, 0.42);
    const hp = handleGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const u = (HL / 2 - hp.getX(i)) / HL; // 0 at bolster → 1 at butt
      hp.setY(i, hp.getY(i) * (0.94 + 0.14 * u));
    }
    handleGeo.computeVertexNormals();
    const handleY = BUTTER_H - 0.62;
    const handle = new THREE.Mesh(handleGeo, wood);
    handle.position.set(-0.35 - HL / 2, handleY, 0);
    const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.5, 1.02, 3, 0.22), fittings);
    bolster.position.set(-0.12, handleY, 0);
    // Two small polished rivets on the handle.
    const rivetGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.01, 12);
    rivetGeo.rotateX(Math.PI / 2);
    const r1 = new THREE.Mesh(rivetGeo, fittings);
    r1.position.set(-0.35 - HL * 0.32, handleY, 0);
    const r2 = new THREE.Mesh(rivetGeo, fittings);
    r2.position.set(-0.35 - HL * 0.7, handleY, 0);
    body.add(blade, handle, bolster, r1, r2);
    // The body is built heel-at-origin (edge along 0..BLADE_L). Pivot the
    // wobble at the heel and put the heel at −BLADE_L/2, so the edge is
    // centred on x = 0, over the middle of the line you drew.
    this.wob.position.x = -BLADE_L / 2;
    this.wob.add(body);
    this.group.add(this.wob);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.group.scale.setScalar(SCALE);
    this.group.visible = false;
  }

  get busy() {
    return this.phase === 'chop' || this.phase === 'hold' || this.phase === 'bounce';
  }

  /** Hover over a line on the floor (centre + direction). */
  aim(cx: number, cz: number, dx: number, dz: number) {
    // A new stroke while the last chop is still coming down: finish that cut
    // right now, so no cut is ever lost.
    if (this.phase === 'chop' && !this.didCut) {
      this.didCut = true;
      this.onCut?.();
    }
    this.target.set(cx, 0, cz);
    this.targetYaw = Math.atan2(-dz, dx);
    if (this.phase === 'hidden' || this.phase === 'lift') {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
      this.y = HOVER + 2;
      this.t = 0;
    }
    this.phase = 'aiming';
  }

  /** Returns false if the knife wasn't ready (the caller then cuts at once). */
  chop() {
    if (this.phase !== 'aiming') return false;
    // Drop exactly onto the line you drew, not where the hover had drifted.
    this.pos.copy(this.target);
    this.yaw = this.targetYaw;
    this.phase = 'chop';
    this.t = 0;
    this.didCut = false;
    return true;
  }

  cancel() {
    if (this.phase === 'aiming') this.startLift();
  }

  private startLift() {
    this.phase = 'lift';
    this.t = 0;
    this.fromY = this.y;
  }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 18);
    let wobble = 0;
    switch (this.phase) {
      case 'hidden':
        this.opacity = Math.max(0, this.opacity - dt * 6);
        break;
      case 'aiming': {
        this.opacity = Math.min(1, this.opacity + dt * 6);
        this.pos.lerp(this.target, k);
        let dy = this.targetYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * k;
        this.y += (HOVER + Math.sin(this.t * 3) * 0.25 - this.y) * k;
        break;
      }
      case 'chop': {
        const u = Math.min(1, this.t / CHOP_T);
        const from = HOVER;
        if (u < WINDUP_U) {
          // Small anticipatory wind-up lift and cock-back before the downward chop.
          const wu = u / WINDUP_U;
          this.y = from + 1.55 * Math.sin(wu * Math.PI * 0.5);
          wobble = 0.065 * Math.sin(wu * Math.PI * 0.5);
        } else {
          const du = (u - WINDUP_U) / (1 - WINDUP_U);
          this.y = (from + 1.55) * (1 - ease.inCubic(du));
          if (!this.didCut && this.y < 3.2) {
            this.didCut = true;
            if (this.onCut?.() === 'bounce') {
              // Too small to cut: the blade springs back off it.
              this.phase = 'bounce';
              this.t = 0;
              this.fromY = this.y;
              break;
            }
          }
        }
        if (u >= 1) {
          this.y = 0;
          this.phase = 'hold';
          this.t = 0;
          this.onLand?.();
        }
        break;
      }
      case 'hold':
        if (this.t > 0.12) this.startLift();
        break;
      case 'bounce': {
        // Recoil upward with a little overshoot, while the blade twangs
        // about the bolster like a plucked ruler.
        const t = this.t;
        this.y = this.fromY + 2.4 * (1 - Math.exp(-9 * t) * Math.cos(13 * t));
        wobble = 0.2 * Math.exp(-5.5 * t) * Math.sin(34 * t);
        if (t > BOUNCE_T) this.startLift();
        break;
      }
      case 'lift': {
        const u = Math.min(1, this.t / LIFT_T);
        this.y = this.fromY + (HOVER + 1 - this.fromY) * ease.outCubic(u);
        this.opacity = 1 - ease.inCubic(u);
        if (u >= 1) this.phase = 'hidden';
        break;
      }
    }
    this.group.visible = this.opacity > 0.01;
    for (const m of this.mats) {
      m.opacity = this.opacity;
      m.depthWrite = this.opacity > 0.98;
    }
    // Seen from above, the knife hovers lying back so you see its blade,
    // then swings upright as it chops.
    let tilt = 0;
    if (this.phase === 'aiming') tilt = AIM_TILT;
    else if (this.phase === 'chop') {
      const u = Math.min(1, this.t / CHOP_T);
      if (u < WINDUP_U) {
        tilt = AIM_TILT - 0.24 * Math.sin((u / WINDUP_U) * Math.PI * 0.5);
      } else {
        const du = (u - WINDUP_U) / (1 - WINDUP_U);
        tilt = (AIM_TILT - 0.24) * Math.pow(1 - du, 2);
      }
    } else if (this.phase === 'lift') tilt = AIM_TILT * ease.inOutSine(Math.min(1, this.t / LIFT_T));
    this.tilt += (tilt - this.tilt) * (this.phase === 'aiming' ? 1 - Math.exp(-dt * 14) : 1);
    this.group.position.set(this.pos.x, this.y, this.pos.z + this.y * this.viewCot);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotateX(this.tilt);
    this.wob.rotation.z = wobble;
  }
}
