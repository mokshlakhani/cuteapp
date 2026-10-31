import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { rand } from '../core/math';

/**
 * What the 3D rooms share so they sit on one shelf: the renderer's settings,
 * the soft room reflections, the one key light from the upper left, and the
 * warm blob shadow and pale wood.
 */

/** A renderer for a room's own transparent canvas, over the shared backdrop. */
export function tableRenderer(canvas: HTMLCanvasElement) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.05;
  return r;
}

/** The room's reflections and the one lamp, from the upper left. */
export function lightTable(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.42;
  scene.add(new THREE.HemisphereLight('#fff8ef', '#d9cfc3', 0.95));
  const key = new THREE.DirectionalLight('#fff4e6', 2.3);
  key.position.set(-9, 16, 8);
  scene.add(key, key.target);
  return key;
}

/** A soft round shadow, warm like every shadow in the app. */
export function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(110, 66, 40, 0.55)');
  grad.addColorStop(0.45, 'rgba(110, 66, 40, 0.3)');
  grad.addColorStop(1, 'rgba(110, 66, 40, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Pale, soft wood: long grain and a few darker streaks. */
export function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 344;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#E2B886';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * c.height;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '170,112,62' : '250,214,168'},${rand(0.08, 0.22)})`;
    ctx.lineWidth = rand(0.6, 2.6);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * rand(1, 4));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

