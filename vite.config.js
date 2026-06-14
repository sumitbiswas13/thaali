import { defineConfig } from 'vite';

export default defineConfig({
  // Vanilla JS — no framework plugins needed.
  root: '.',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
});
