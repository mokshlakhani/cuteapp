import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ease } from '../../design/motion';

/**
 * A cleaver like the one in the reference: steel blade, dark wooden handle
 * with three rivets. It hovers over the line you draw, lined up with it, then
 * chops straight down when you let go and lifts away.
 *
 * Local frame: the cutting edge runs along +x at y = 0, centred on x = 0.
 */

const BLADE_L = 10.8;
const BLADE_H = 4.7;
const HOVER = 4.6;
/** Blade leaned back (rad) while aiming, so its face shows from above. */
const AIM_TILT = -1.2;

type Phase = 'hidden' | 'aiming' | 'chop' | 'hold' | 'lift';

export class Knife {
  readonly group = new THREE.Group();
  private mats: THREE.MeshStandardMaterial[] = [];
  private phase: Phase = 'hidden';
  private t = 0;
  private opacity = 0;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private yaw = 0;
  private targetYaw = 0;
  private y = HOVER;
  private didCut = false;
  private tilt = AIM_TILT;
  /** Called once, the moment the edge passes through the jelly. */
  onCut: (() => void) | null = null;
  /** Called when the blade meets the board. */
  onLand: (() => void) | null = null;

  constructor() {
    const steel = new THREE.MeshStandardMaterial({
      color: '#e3e8ec',
      metalness: 0.85,
      roughness: 0.2,
      envMapIntensity: 2.6,
      transparent: true,
    });
    const edge = new THREE.MeshStandardMaterial({ color: '#f6f8fa', metalness: 1, roughness: 0.1, envMapIntensity: 3, transparent: true });
    const wood = new THREE.MeshStandardMaterial({ color: '#3b1f15', metalness: 0, roughness: 0.55, transparent: true });
    const rivet = new THREE.MeshStandardMaterial({
      color: '#f1f1ee',
      metalness: 0.9,
      roughness: 0.25,
      envMapIntensity: 2.6,
      transparent: true,
    });
    this.mats = [steel, edge, wood, rivet];

    // Blade outline (cleaver): straight edge that lifts slightly at the tip.
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(BLADE_L - 1.6, 0);
    s.quadraticCurveTo(BLADE_L - 0.2, 0.15, BLADE_L, 1.1);
    s.lineTo(BLADE_L + 0.1, BLADE_H - 0.9);
    s.quadraticCurveTo(BLADE_L + 0.05, BLADE_H, BLADE_L - 0.9, BLADE_H);
    s.lineTo(0, BLADE_H);
    s.lineTo(0, 0);
    const blade = new THREE.ExtrudeGeometry(s, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2,
      curveSegments: 10,
    });
    blade.translate(-BLADE_L / 2, 0, -0.07);
    const bladeMesh = new THREE.Mesh(blade, steel);
    // A brighter bevel strip along the edge.
    const strip = new THREE.Mesh(new THREE.BoxGeometry(BLADE_L - 1.4, 0.5, 0.2), edge);
    strip.position.set(-0.6, 0.28, 0);

    const handle = new THREE.Mesh(new RoundedBoxGeometry(6.4, 1.25, 0.95, 4, 0.4), wood);
    handle.position.set(-BLADE_L / 2 - 3.1, BLADE_H - 0.75, 0);
    const bolster = new THREE.Mesh(new RoundedBoxGeometry(0.5, 1.4, 1.0, 3, 0.2), steel);
    bolster.position.set(-BLADE_L / 2 - 0.15, BLADE_H - 0.75, 0);
    const rivetGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.02, 16);
    rivetGeo.rotateX(Math.PI / 2);
    for (const dx of [-1.3, -3.1, -4.9]) {
      const r = new THREE.Mesh(rivetGeo, rivet);
      r.position.set(-BLADE_L / 2 + dx, BLADE_H - 0.75, 0);
      this.group.add(r);
    }
    for (const m of [bladeMesh, strip, handle, bolster]) this.group.add(m);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.group.scale.setScalar(0.82);
    this.group.visible = false;
  }

  get busy() {
    return this.phase === 'chop' || this.phase === 'hold';
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
      this.phase = 'aiming';
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
    if (this.phase === 'aiming') {
      this.phase = 'lift';
      this.t = 0;
    }
  }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 18);
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
        const T = 0.14;
        const u = Math.min(1, this.t / T);
        this.y = HOVER * (1 - ease.inCubic(u));
        if (!this.didCut && this.y < 3.2) {
          this.didCut = true;
          this.onCut?.();
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
        if (this.t > 0.12) {
          this.phase = 'lift';
          this.t = 0;
        }
        break;
      case 'lift': {
        const u = Math.min(1, this.t / 0.45);
        this.y = HOVER * ease.outCubic(u) + 1;
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
    else if (this.phase === 'chop') tilt = AIM_TILT * Math.pow(1 - Math.min(1, this.t / 0.14), 2);
    else if (this.phase === 'lift') tilt = AIM_TILT * ease.inOutSine(Math.min(1, this.t / 0.45));
    this.tilt += (tilt - this.tilt) * (this.phase === 'aiming' ? 1 - Math.exp(-dt * 14) : 1);
    this.group.position.set(this.pos.x, this.y, this.pos.z);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.rotateX(this.tilt);
  }
}
