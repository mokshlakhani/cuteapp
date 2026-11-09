import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Three builds from one source:
 *
 * - default    → `dist/`: the game at the root (`index.html`, the address
 *                everyone's home-screen app opens) and the website in `site/`.
 *                This is what GitHub Pages (or any static host) serves.
 * - `--mode app`    → `dist-app/`: the game alone, for Capacitor (iOS/Android).
 * - `--mode single` → `dist-single/`: the game as one self-contained HTML file.
 */
export default defineConfig(({ mode }) => {
  const gameOnly = mode === 'app' || mode === 'single';
  const outDir = mode === 'app' ? 'dist-app' : mode === 'single' ? 'dist-single' : 'dist';
  return {
    base: './',
    root: import.meta.dirname,
    publicDir: resolve(import.meta.dirname, 'public'),
    plugins: mode === 'single' ? [viteSingleFile()] : [],
    build: {
      outDir: resolve(import.meta.dirname, outDir),
      emptyOutDir: true,
      assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
      target: 'es2020',
      // three.js and the rooms are one deliberate bundle: the game builds every room up front.
      chunkSizeWarningLimit: 1200,
      rollupOptions: gameOnly
        ? undefined
        : { input: { play: resolve(import.meta.dirname, 'index.html'), site: resolve(import.meta.dirname, 'site/index.html') } },
    },
  };
});
