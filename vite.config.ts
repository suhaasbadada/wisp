import { defineConfig } from 'vite';

export default defineConfig({
  base: '/wisp/',
  build: { rollupOptions: { input: { main: 'index.html', docs: 'documentation/index.html' } } },
  worker: { format: 'es' },
});
