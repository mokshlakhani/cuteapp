import * as THREE from 'three';

/**
 * The little things a bubble catches a reflection of: ten tiny drawings in one
 * sheet, five across and two down, each in its own colours. Indexes match
 * game.ts `THINGS`. Bubbles read them straight from this sheet.
 */

const CELL = 128;
const COLS = 5;
const INK = '#5A3F63';

type Draw = (c: CanvasRenderingContext2D) => void;

const dot = (c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) => {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};

/** Each draws around (0, 0), about 46 across. */
const DRAWINGS: Draw[] = [
  // Heart
  (c) => {
    c.fillStyle = '#FF8FB1';
    c.beginPath();
    c.moveTo(0, 38);
    c.bezierCurveTo(-58, 2, -46, -40, -18, -38);
    c.bezierCurveTo(-8, -38, -2, -30, 0, -22);
    c.bezierCurveTo(2, -30, 8, -38, 18, -38);
    c.bezierCurveTo(46, -40, 58, 2, 0, 38);
    c.fill();
    dot(c, -20, -18, 7, '#FFD3E0');
  },
  // Star
  (c) => {
    c.fillStyle = '#FFD66B';
    c.strokeStyle = '#FFD66B';
    c.lineWidth = 12;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 17 : 38;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.stroke();
  },
  // Moon
  (c) => {
    c.fillStyle = '#FFE9A8';
    c.beginPath();
    c.arc(0, 0, 40, Math.PI * 0.32, Math.PI * 1.68);
    c.bezierCurveTo(-16, -30, -16, 30, 25, 31);
    c.fill();
    dot(c, 30, -30, 5, '#FFF4CF');
    dot(c, 40, -6, 3, '#FFF4CF');
  },
  // Flower
  (c) => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      dot(c, Math.cos(a) * 24, Math.sin(a) * 24, 18, '#FFB3D1');
    }
    dot(c, 0, 0, 14, '#FFD66B');
  },
  // Cloud
  (c) => {
    for (const [x, y, r] of [
      [-24, 8, 20],
      [24, 8, 20],
      [-6, -10, 25],
      [14, -4, 20],
    ])
      dot(c, x, y, r, '#FBFAFF');
    c.fillRect(-24, 8, 48, 20);
    dot(c, -11, 8, 3.5, INK);
    dot(c, 11, 8, 3.5, INK);
  },
  // Cat
  (c) => {
    c.fillStyle = '#FFC48A';
    c.beginPath();
    c.moveTo(-38, -36);
    c.lineTo(-30, 2);
    c.lineTo(-6, -20);
    c.moveTo(38, -36);
    c.lineTo(30, 2);
    c.lineTo(6, -20);
    c.fill();
    dot(c, 0, 8, 32, '#FFC48A');
    dot(c, -13, 3, 4, INK);
    dot(c, 13, 3, 4, INK);
    c.fillStyle = '#FF8FB1';
    c.beginPath();
    c.moveTo(-5, 12);
    c.lineTo(5, 12);
    c.lineTo(0, 18);
    c.fill();
  },
  // Mushroom
  (c) => {
    c.fillStyle = '#FBF3E4';
    c.beginPath();
    c.roundRect(-14, -2, 28, 38, 12);
    c.fill();
    c.fillStyle = '#FF7A7A';
    c.beginPath();
    c.moveTo(-42, 6);
    c.bezierCurveTo(-44, -48, 44, -48, 42, 6);
    c.closePath();
    c.fill();
    dot(c, -16, -14, 7, '#FFF4EC');
    dot(c, 12, -20, 8, '#FFF4EC');
    dot(c, 24, -3, 4.5, '#FFF4EC');
  },
  // Fish
  (c) => {
    c.fillStyle = '#7FD6E8';
    c.beginPath();
    c.moveTo(20, 0);
    c.lineTo(44, -22);
    c.lineTo(44, 22);
    c.fill();
    c.beginPath();
    c.ellipse(-8, 0, 34, 24, 0, 0, Math.PI * 2);
    c.fill();
    dot(c, -22, -6, 4.5, INK);
    c.strokeStyle = '#D5F4FA';
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(-2, 0, 13, -1, 1);
    c.stroke();
  },
  // Butterfly
  (c) => {
    for (const s of [-1, 1]) {
      c.fillStyle = '#C6A6FF';
      c.beginPath();
      c.ellipse(s * 22, -13, 20, 25, s * 0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#FFB3D1';
      c.beginPath();
      c.ellipse(s * 17, 19, 14, 17, s * -0.4, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = INK;
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -18);
    c.lineTo(0, 26);
    c.stroke();
  },
  // Cherries
  (c) => {
    c.strokeStyle = '#7CC67C';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-20, 12);
    c.quadraticCurveTo(-12, -24, 12, -38);
    c.moveTo(22, 8);
    c.quadraticCurveTo(22, -20, 12, -38);
    c.stroke();
    dot(c, -20, 20, 19, '#FF6B81');
    dot(c, 22, 18, 19, '#FF6B81');
    dot(c, -26, 14, 5, '#FFC2CC');
    dot(c, 16, 12, 5, '#FFC2CC');
  },
];

/** The sheet, for the bubbles' shader. */
export function thingsSheet() {
  const canvas = document.createElement('canvas');
  const rows = Math.ceil(DRAWINGS.length / COLS);
  canvas.width = CELL * COLS;
  canvas.height = CELL * rows;
  const c = canvas.getContext('2d')!;
  DRAWINGS.forEach((draw, i) => {
    c.save();
    c.translate(CELL * (i % COLS + 0.5), CELL * (Math.floor(i / COLS) + 0.5));
    draw(c);
    c.restore();
  });
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
