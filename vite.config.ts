import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorker } from './scripts/sw-plugin.ts';

export default defineConfig({
  // נתיבים יחסיים כדי שהבנייה תעבוד גם בתת-תיקייה (GitHub Pages וכו').
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
