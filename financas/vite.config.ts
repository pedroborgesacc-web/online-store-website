import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para funcionar em qualquer caminho (GitHub Pages, Netlify, subpasta…)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
