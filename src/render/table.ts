import * as THREE from 'three';
import { buildingAtOnce, type Build } from '../core/stages';
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

/**
 * The room's reflections, as a texture for this renderer. Making them is the
 * heaviest single step in building a room (it compiles its own shaders), and
 * every room's the same, so the first renderer makes them once and reads the
 * result back; every other one gets a copy as plain data to upload.
 */
let baked: { data: Uint16Array; width: number; height: number } | null | undefined;

export function roomReflections(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (baked === undefined) baked = bake(renderer);
  if (baked) {
    const t = new THREE.DataTexture(baked.data, baked.width, baked.height, THREE.RGBAFormat, THREE.HalfFloatType);
    t.mapping = THREE.CubeUVReflectionMapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

function bake(renderer: THREE.WebGLRenderer) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    const { width, height } = target;
    const data = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
    target.dispose();
    pmrem.dispose();
    // A read that failed leaves it blank: then each room makes its own.
    for (let i = 0; i < data.length; i += 997) if (data[i] !== 0) return { data, width, height };
  } catch {
    /* fall back below */
  }
  return null;
}

/** The room's reflections and the one lamp, from the upper left. */
export function lightTable(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  scene.environment = roomReflections(renderer);
  scene.environmentIntensity = 0.42;
  scene.add(new THREE.HemisphereLight('#ffeedb', '#d9b49a', 0.95));
  const key = new THREE.DirectionalLight('#ffe2bf', 2.3);
  key.position.set(-9, 16, 8);
  scene.add(key, key.target);
  return key;
}

/**
 * Get a room's picture ready on the GPU a piece at a time: its reflections
 * uploaded, its shaders compiled (off the main thread where the browser
 * allows), then it's drawn bit by bit, a material at a time, the lights
 * alone first, so each buffer uploads in a slice of its own. A first frame of everything at once would compile every
 * shader, upload every buffer and allocate the shadow maps in one go.
 */
export function* gpuReady(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Build {
  if (scene.environment) {
    renderer.initTexture(scene.environment);
    yield;
  }
  // Shaders compile on other threads where the browser allows it.
  if (buildingAtOnce()) renderer.compile(scene, camera);
  else {
    let done = false;
    const end = () => (done = true);
    renderer.compileAsync(scene, camera).then(end, end);
    while (!done) yield;
  }
  // What's drawn, grouped by what it's drawn with (a shader is the costly part).
  const byMaterial = new Map<THREE.Material, THREE.Object3D[]>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) || !o.visible) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const list = byMaterial.get(mat);
    if (list) list.push(o);
    else byMaterial.set(mat, [o]);
  });
  const all = [...byMaterial.values()].flat();
  for (const o of all) o.visible = false;
  const draw = () => {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  };
  draw();
  yield;
  for (const group of byMaterial.values()) {
    for (const o of group) o.visible = true;
    draw();
    for (const o of group) o.visible = false;
    yield;
  }
  for (const o of all) o.visible = true;
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

/** Warm butcher-block cutting board: plank staves, rich grain, end-grain edges, juice groove and soft knife score marks. */
export function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 344;
  const ctx = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = '#D9A673';
  ctx.fillRect(0, 0, W, H);

  // Four horizontal butcher-block staves with subtle warm tonal variation.
  const staves = 4;
  const staveH = H / staves;
  const staveTones = ['#DDA975', '#D39E6A', '#DFAD7B', '#D5A06D'];
  for (let s = 0; s < staves; s++) {
    ctx.fillStyle = staveTones[s];
    ctx.fillRect(0, s * staveH, W, staveH);
    if (s > 0) {
      ctx.strokeStyle = 'rgba(122, 74, 38, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, s * staveH);
      ctx.lineTo(W, s * staveH);
      ctx.stroke();
    }
  }

  // Long wavy grain lines and warm cathedral arches within each stave.
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * H;
    const dark = Math.random() < 0.58;
    ctx.strokeStyle = `rgba(${dark ? '138,80,40' : '250,214,170'},${rand(0.1, 0.28)})`;
    ctx.lineWidth = rand(0.7, 2.8);
    const freq = rand(0.008, 0.02);
    const phase = rand(0, Math.PI * 2);
    const amp = rand(1.5, 5.5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= W; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * freq + phase) * amp);
    }
    ctx.stroke();
  }

  // Darker end-grain bands along the left and right edges of the board.
  const endW = 26;
  for (const side of [0, W - endW]) {
    const eg = ctx.createLinearGradient(side, 0, side + endW, 0);
    if (side === 0) {
      eg.addColorStop(0, 'rgba(120, 68, 34, 0.34)');
      eg.addColorStop(0.75, 'rgba(120, 68, 34, 0.16)');
      eg.addColorStop(1, 'rgba(120, 68, 34, 0)');
    } else {
      eg.addColorStop(0, 'rgba(120, 68, 34, 0)');
      eg.addColorStop(0.25, 'rgba(120, 68, 34, 0.16)');
      eg.addColorStop(1, 'rgba(120, 68, 34, 0.34)');
    }
    ctx.fillStyle = eg;
    ctx.fillRect(side, 0, endW, H);
    // Tight curved annual growth rings in the end-grain bands.
    for (let s = 0; s < staves; s++) {
      const cy = (s + 0.5) * staveH;
      for (let r = 6; r < staveH * 0.9; r += 5) {
        ctx.strokeStyle = 'rgba(110, 62, 30, 0.22)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(side === 0 ? 4 : W - 4, cy, r, -Math.PI * 0.45, Math.PI * 0.45, side !== 0);
        ctx.stroke();
      }
    }
  }

  // Recessed perimeter juice groove inset from the board's rim.
  const gx = 32;
  const gy = 24;
  const gw = W - gx * 2;
  const gh = H - gy * 2;
  ctx.strokeStyle = 'rgba(124, 72, 36, 0.28)';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.roundRect(gx, gy, gw, gh, 18);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 228, 192, 0.35)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(gx + 1.5, gy + 1.5, gw - 3, gh - 3, 17);
  ctx.stroke();

  // Soft diagonal knife score marks across the centre working area of the board.
  ctx.lineCap = 'round';
  for (let i = 0; i < 28; i++) {
    const sx = W * rand(0.22, 0.78);
    const sy = H * rand(0.22, 0.78);
    const len = rand(28, 86);
    const ang = rand(-0.45, 0.45) + (Math.random() < 0.3 ? Math.PI * 0.5 : 0);
    const dx = Math.cos(ang) * len * 0.5;
    const dy = Math.sin(ang) * len * 0.5;
    ctx.strokeStyle = `rgba(118, 68, 34, ${rand(0.12, 0.24)})`;
    ctx.lineWidth = rand(0.8, 1.5);
    ctx.beginPath();
    ctx.moveTo(sx - dx, sy - dy);
    ctx.lineTo(sx + dx, sy + dy);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 230, 196, ${rand(0.1, 0.2)})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx - dx, sy - dy + 1);
    ctx.lineTo(sx + dx, sy + dy + 1);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}


export type ClothKind = 'gingham' | 'knit' | 'linen';

/**
 * Something soft for a toy to sit on, so nothing floats in the void: a round
 * gingham cloth, a knitted rug or a linen doily, its edge a running stitch
 * that fades into the room. Lies flat at `y`, under everything, and takes the
 * room's shadows from the shadow floor above it.
 */
export function clothMesh(kind: ClothKind, radius: number, y = -0.02) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const mid = S / 2;
  if (kind === 'gingham') {
    g.fillStyle = '#F7E7D3';
    g.fillRect(0, 0, S, S);
    const n = 14;
    const step = S / n;
    g.fillStyle = 'rgba(196, 96, 72, 0.32)';
    for (let i = 0; i < n; i += 2) {
      g.fillRect(i * step, 0, step, S);
      g.fillRect(0, i * step, S, step);
    }
    // A faint weave over the checks.
    g.strokeStyle = 'rgba(120, 60, 40, 0.05)';
    for (let i = 0; i < S; i += 3) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, S);
      g.stroke();
    }
  } else if (kind === 'knit') {
    g.fillStyle = '#E9CDB2';
    g.fillRect(0, 0, S, S);
    // Rows of little V stitches, every few rows a band of rose.
    const sw = 16;
    const sh = 14;
    for (let row = 0; row * sh < S + sh; row++) {
      const band = row % 8 === 3 || row % 8 === 4;
      g.strokeStyle = band ? 'rgba(186, 104, 104, 0.55)' : 'rgba(150, 100, 70, 0.22)';
      g.lineWidth = 3.2;
      g.lineCap = 'round';
      for (let col = 0; col * sw < S + sw; col++) {
        const x = col * sw;
        const yy = row * sh;
        g.beginPath();
        g.moveTo(x + 2, yy + 2);
        g.lineTo(x + sw / 2, yy + sh - 2);
        g.lineTo(x + sw - 2, yy + 2);
        g.stroke();
      }
    }
  } else {
    g.fillStyle = '#F1E2CF';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const v = Math.random() < 0.5;
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '160,120,90' : '255,248,236'},${rand(0.05, 0.14)})`;
      g.lineWidth = rand(0.6, 1.4);
      const p = Math.random() * S;
      const q = Math.random() * S;
      g.beginPath();
      if (v) {
        g.moveTo(p, q);
        g.lineTo(p, q + rand(20, 80));
      } else {
        g.moveTo(q, p);
        g.lineTo(q + rand(20, 80), p);
      }
      g.stroke();
    }
  }
  // A running stitch just inside the edge.
  g.strokeStyle = kind === 'knit' ? 'rgba(255, 240, 222, 0.7)' : 'rgba(176, 84, 66, 0.55)';
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  g.beginPath();
  g.arc(mid, mid, mid * 0.86, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  // Round, with an edge that melts softly into the room.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createRadialGradient(mid, mid, mid * 0.9, mid, mid, mid);
  edge.addColorStop(0, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), clothMaterial(c));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = -1;
  return mesh;
}

/** Toned down a little, so the cloth sits in the lamplight rather than glowing. */
function clothMaterial(c: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: tex, color: '#D8C2AE', transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });
}

/**
 * A gingham picnic cloth cut to a table that isn't round: `halfW` by `halfD`
 * (scene units) with rounded corners, the same checks, stitch and soft edge
 * as the round one. For a table that's taller than it's wide (jelly on a
 * phone), so nothing set down on it lies off the cloth.
 */
export function ginghamSheet(halfW: number, halfD: number, check: number, y = -0.02) {
  const W = 512;
  const H = Math.max(64, Math.min(2048, Math.round((W * halfD) / halfW)));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#F7E7D3';
  g.fillRect(0, 0, W, H);
  // Checks of the same size as the round cloth's, centred on the middle.
  const step = (check / (halfW * 2)) * W;
  g.fillStyle = 'rgba(196, 96, 72, 0.32)';
  for (let x = W / 2 - Math.ceil(W / step) * step; x < W; x += step * 2) g.fillRect(x, 0, step, H);
  for (let z = H / 2 - Math.ceil(H / step) * step; z < H; z += step * 2) g.fillRect(0, z, W, step);
  g.strokeStyle = 'rgba(120, 60, 40, 0.05)';
  for (let i = 0; i < W; i += 3) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, H);
    g.stroke();
  }
  const corner = W * 0.22;
  const rounded = (inset: number) => {
    g.beginPath();
    g.roundRect(inset, inset, W - inset * 2, H - inset * 2, Math.max(1, corner - inset));
  };
  // A running stitch just inside the edge.
  g.strokeStyle = 'rgba(176, 84, 66, 0.55)';
  g.lineWidth = 4;
  g.setLineDash([14, 10]);
  rounded(W * 0.07);
  g.stroke();
  g.setLineDash([]);
  // An edge that melts softly into the room: the cloth's own picture, kept in
  // steps from nothing at the rim to all of it a little way in.
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  full.getContext('2d')!.drawImage(c, 0, 0);
  g.clearRect(0, 0, W, H);
  const STEPS = 14;
  const soft = W * 0.05;
  for (let k = 1; k <= STEPS; k++) {
    g.save();
    rounded((k / STEPS) * soft);
    g.clip();
    g.clearRect(0, 0, W, H);
    g.globalAlpha = k / STEPS;
    g.drawImage(full, 0, 0);
    g.restore();
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), clothMaterial(c));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = -1;
  return mesh;
}
