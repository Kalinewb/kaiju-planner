import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwind()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3210' } },
});
