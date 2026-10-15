import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Worker-only GIF imports must be optimized before editing begins.
  // Discovering them mid-export would make Vite reload and discard the timeline.
  optimizeDeps: { include: ['mediabunny', 'gifenc'] },
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
