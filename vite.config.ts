/**
 * Vite build configuration.
 *
 * `base: './'` makes the built dist/ folder fully relative, so it can be
 * dropped onto itch.io, GitHub Pages subpaths, or any static host without
 * path rewrites. The dev server runs on 5173; `vite preview` (used by the
 * headless test suite) serves the production build on 4173.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1600 },
});
