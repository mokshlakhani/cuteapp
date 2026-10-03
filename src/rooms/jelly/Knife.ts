import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ease } from '../../design/motion';

/**
 * A chef's knife: a slim, pointed steel blade with a curved belly, a ground
 * edge that catches the light, and a warm wooden handle with two rivets —
 * rounded and chunky like every other soft spot toy, but properly sharp.
 *
 * It hovers over the line you draw, lined up with it, then chops straight
 * down when you let go. If everything under it is too small to cut, it
 * bounces off with a springy wobble instead.
 *
 * Local frame: the cutting edge runs along +x at y = 0, centred on x = 0.
 */

/** Edge length, heel to tip (cm, before scaling). */
const BLADE_L = 11.4;
/** Blade height at the heel. */
const BLADE_H = 3.0;
/** Height of the point above the edge line. */
const TIP_Y = 1.25;
/** Where the flat of the edge starts curving up into the belly (0..1). */
const BELLY = 0.6;
const SCALE = 0.82;
const HOVER = 4.6;
/** Blade leaned back (rad) while aiming, so its face shows from above. */
const AIM_TILT = -1.2;
const CHOP_T = 0.14;
const BOUNCE_T = 0.62;
const LIFT_T = 0.45;

/** Half the cutting edge in world units: the blade cuts at least this far either side of the stroke's middle. */
export const KNIFE_EDGE_HALF = (BLADE_L * SCALE) / 2;

type Phase = 'hidden' | 'aiming' | 'chop' | 'hold' | 'bounce' | 'lift';
export type CutResult = 'cut' | 'bounce' | 'none';

/** Edge profile: flat, then a belly rising to the point. */
function edgeY(x: number) {
  const x0 = BLADE_L * BELLY;
  if (x <= x0) return 0;
  const u = (x - x0) / (BLADE_L - x0);
  return TIP_Y * u * u;
}

/** Spine profile: straight, then a gentle drop to the point. */
function spineY(x: number) {
  const x0 = BLADE_L * 0.48;
  if (x <= x0) return BLADE_H;
  const u = (x - x0) / (BLADE_L - x0);
  return BLADE_H - (BLADE_H - TIP_Y) * Math.pow(u, 1.7);
}

function bladeGeometry() {
  const s = new THREE.Shape();
  const N = 28;
  const r = 0.28; // soft heel corners
  s.moveTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  for (let i = 1; i <= N; i++) {
    const x = r + ((BLADE_L - r) * i) / N;
    s.lineTo(x, edgeY(x));
  }
  for (let i = N - 1; i >= 0; i--) {
    const x = r + ((BLADE_L - r) * i) / N;
    s.lineTo(x, spineY(x));
  }
  s.quadraticCurveTo(0, BLADE_H, 0, BLADE_H - r);
  s.lineTo(0, r);
  const depth = 0.16;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  // Grind the edge: the blade thins to almost nothing toward the edge, so
  // the bevel catches a bright line of light like real steel.
  // The ground edge is polished brighter than the brushed flat, so a clean
  // line of light runs along it even seen straight from above.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const flat = new THREE.Color('#cfd4d9');
  const polished = new THREE.Color('#ffffff');
  const spine = new THREE.Color('#b9bfc6');
  const c = new THREE.Color();
  const GRIND = 0.95;
  for (let i = 0; i < pos.count; i++) {
    const x = Math.max(0, Math.min(BLADE_L, pos.getX(i)));
    const y = pos.getY(i);
    const d = y - edgeY(x);
    const u = Math.max(0, Math.min(1, d / GRIND));
    const s = u * u * (3 - 2 * u);
    pos.setZ(i, pos.getZ(i) * (0.1 + 0.9 * s));
    c.copy(polished).lerp(flat, s);
    // A faint darker band toward the spine gives the flat some depth.
    const toSpine = Math.max(0, Math.min(1, (y - (spineY(x) - 0.8)) / 0.8));
    c.lerp(spine, toSpine * 0.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
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
    // Polished steel: mostly mirror, so it picks up the warm room it's in.
    const steel = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      vertexColors: true,
      metalness: 0.88,
      roughness: 0.14,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
      envMapIntensity: 5.5,
      transparent: true,
    });
    const fittings = new THREE.MeshPhysicalMaterial({
      color: '#dfe3e7',
      metalness: 0.9,
      roughness: 0.18,
      clearcoat: 0.6,
      envMapIntensity: 5,
      transparent: true,
    });
    const wood = new THREE.MeshPhysicalMaterial({
      color: '#7a4a33',
      metalness: 0,
      roughness: 0.42,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
      transparent: true,
    });
    const rivet = new THREE.MeshStandardMaterial({
      color: '#f2efe9',
      metalness: 0.9,
      roughness: 0.22,
      envMapIntensity: 5,
      transparent: true,
    });
    this.mats = [steel, fittings, wood, rivet];

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
    const handleY = BLADE_H - 0.72;
    const handle = new THREE.Mesh(handleGeo, wood);
    handle.position.set(-0.35 - HL / 2, handleY, 0);
    const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.5, 1.02, 3, 0.22), fittings);
    bolster.position.set(-0.12, handleY, 0);
    const rivetGeo = new THREE.CylinderGeometry(0.19, 0.19, 1.04, 16);
    rivetGeo.rotateX(Math.PI / 2);
    for (const dx of [-1.6, -4.0]) {
      const m = new THREE.Mesh(rivetGeo, rivet);
      m.position.set(dx, handleY, 0);
      body.add(m);
    }
    body.add(blade, handle, bolster);
    // The body is built heel-at-origin (edge along 0..BLADE_L). Pivot the
    // wobble at the heel and put the heel at −BLADE_L/2, so the edge is
    // centred on x = 0 — exactly the span the cut uses (KNIFE_EDGE_HALF).
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
        this.y = from * (1 - ease.inCubic(u));
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
    else if (this.phase === 'chop') tilt = AIM_TILT * Math.pow(1 - Math.min(1, this.t / CHOP_T), 2);
    else if (this.phase === 'lift') tilt = AIM_TILT * ease.inOutSine(Math.min(1, this.t / LIFT_T));
    this.tilt += (tilt - this.tilt) * (this.phase === 'aiming' ? 1 - Math.exp(-dt * 14) : 1);
    this.group.position.set(this.pos.x, this.y, this.pos.z + this.y * this.viewCot);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotateX(this.tilt);
    this.wob.rotation.z = wobble;
  }
}
