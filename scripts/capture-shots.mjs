#!/usr/bin/env node
/**
 * Captures the website's screenshots from the real game.
 *
 * Opens each room in headless Chrome at a phone's size, plays it for a moment
 * with scripted touches (the same input a player gives), and saves a WebP in
 * src/site/shots/. Nothing on the website is mocked up: every picture is the
 * game, mid-play.
 *
 *   npm run dev            # in one terminal (or pass a URL: npm run shots -- http://localhost:5174)
 *   npm run shots
 *
 * Needs Google Chrome and `cwebp` (brew install webp). Uses Node's built-in WebSocket.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/site/shots');
const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const ONLY = process.argv[3]?.split(',');
const CHROME =
  process.env.CHROME ??
  (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const W = 390;
const H = 844;
const PORT = 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scripted play for each room, in CSS px of a 390×844 phone. */
const SHOTS = [
  { id: 'home', room: null, wait: 5000, play: async () => {} },
  {
    id: 'melon',
    room: 'melon',
    wait: 4000,
    play: async (p) => {
      for (let i = 0; i < 22; i++) {
        await p.tap(195, 470);
        await sleep(260);
      }
      await sleep(900);
    },
  },
  {
    id: 'jelly',
    room: 'jelly',
    wait: 4000,
    play: async (p) => {
      // Two knife strokes across the slice.
      await p.drag(line(70, 330, 330, 450, 16));
      await sleep(1400);
      await p.drag(line(260, 250, 140, 540, 16));
      await sleep(1600);
    },
  },
  // The pattern glows a moment after the sheet unrolls.
  { id: 'wrap', room: 'wrap', wait: 3200, play: async () => {} },
  {
    id: 'pour',
    room: 'pour',
    wait: 4000,
    play: async (p) => {
      await p.down(195, 500);
      await sleep(2200);
    },
  },
  {
    id: 'slice',
    room: 'slice',
    wait: 4000,
    play: async (p) => {
      await p.drag(line(70, 330, 320, 560, 14));
      await sleep(900);
      await p.drag(line(320, 330, 70, 560, 14));
      await sleep(1200);
    },
  },
  {
    id: 'peel',
    room: 'peel',
    wait: 4000,
    play: async (p) => {
      // Slow circles round the fruit, about one every three seconds.
      const pts = [];
      for (let i = 0; i <= 330; i++) {
        const a = (i / 110) * Math.PI * 2;
        pts.push([195 + Math.cos(a) * 122, 376 + Math.sin(a) * 122]);
      }
      await p.drag(pts, 27, false);
      await sleep(100);
    },
  },
  {
    id: 'soap',
    room: 'soap',
    wait: 4000,
    play: async (p) => {
      await p.down(195, 600);
      await sleep(1700);
    },
  },
  {
    id: 'stack',
    room: 'stack',
    wait: 4000,
    play: async (p) => {
      for (let i = 0; i < 4; i++) {
        await p.drag(line(195, 300, 196, 300, 2), 30);
        await sleep(2600);
      }
    },
  },
];

function line(x0, y0, x1, y1, n) {
  return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'softspot-shots-'));
  const failed = [];
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      // The real GPU where there is one (much faster, so the game plays at its own pace); software otherwise.
      process.env.SHOTS_SOFTWARE ? '--use-angle=swiftshader' : '--use-angle=metal',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  try {
    let version;
    for (let i = 0; i < 50 && !version; i++) {
      await sleep(200);
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!version) throw new Error('Chrome did not start');
    const cdp = await connect(version.webSocketDebuggerUrl);
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.id)) continue;
      try {
        await capture(cdp, shot);
        console.log(`✓ ${shot.id}`);
      } catch (e) {
        failed.push(shot.id);
        console.error(`✗ ${shot.id}: ${e.message}`);
      }
    }
    if (!ONLY || ONLY.includes('og')) {
      try {
        await card(cdp);
        console.log('✓ og-image');
      } catch (e) {
        failed.push('og');
        console.error(`✗ og-image: ${e.message}`);
      }
    }
    cdp.close();
    if (failed.length) process.exitCode = 1;
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }

  /** The social-share card: scripts/og-card.html, drawn from the shots just taken. */
  async function card(cdp) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const s = (method, params) => cdp.send(method, params, sessionId);
      await s('Page.enable');
      await s('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
      await s('Page.navigate', { url: `${BASE}/scripts/og-card.html` });
      await sleep(2000);
      const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
      writeFileSync(join(ROOT, 'public/og-image.jpg'), Buffer.from(data, 'base64'));
    } finally {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }

  async function capture(cdp, shot) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const s = (method, params) => cdp.send(method, params, sessionId);
      await s('Page.enable');
      await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
      // Quiet, and no one-time hints over the toys.
      await s('Page.addScriptToEvaluateOnNewDocument', {
        source: `try{localStorage.setItem('softspot.settings.v1',JSON.stringify({music:false,sfx:false,haptics:false,seenHints:[]}))}catch(e){}
          document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent='.hint{display:none!important}';document.head.append(st)});`,
      });
      await s('Page.navigate', { url: `${BASE}/${shot.room ? `?room=${shot.room}` : ''}` });
      await sleep(shot.wait);
      await shot.play(pointer(s));
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      const png = join(profile, `${shot.id}.png`);
      writeFileSync(png, Buffer.from(data, 'base64'));
      execFileSync('cwebp', ['-quiet', '-q', '80', '-resize', '660', '0', png, '-o', join(OUT, `${shot.id}.webp`)]);
    } finally {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    }
  }
}

/** Mouse input through CDP: the game listens to pointer events, which mice and fingers both raise. */
function pointer(s) {
  const ev = (type, x, y) => s('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  return {
    down: (x, y) => ev('mousePressed', x, y),
    async tap(x, y, hold = 60) {
      await ev('mousePressed', x, y);
      await sleep(hold);
      await ev('mouseReleased', x, y);
    },
    async drag(pts, step = 16, release = true) {
      await ev('mousePressed', ...pts[0]);
      for (const [x, y] of pts.slice(1)) {
        await sleep(step);
        await ev('mouseMoved', x, y);
      }
      if (release) await ev('mouseReleased', ...pts.at(-1));
    },
  };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    }
  };
  return {
    send(method, params = {}, sessionId) {
      const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
      ws.send(JSON.stringify(msg));
      return new Promise((res, rej) => pending.set(msg.id, { res, rej }));
    },
    close: () => ws.close(),
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
