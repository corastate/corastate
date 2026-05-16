import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // The dev server proxies /v1/* and /internal/* to the backend so the
      // web app can talk to it without CORS in dev. Both namespaces, per
      // architecture-v3.md §"API architecture".
      '/v1': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/internal': {
        target: process.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
