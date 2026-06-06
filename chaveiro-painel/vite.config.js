/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
  server: {
    port: 5173,
    // Proxy para a API durante desenvolvimento — evita CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {}); // silencia erros de conexão no console do Vite
        },
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
      // Fotos de evidência servidas estaticamente pelo backend
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', () => {});
        },
      },
    },
  },
});
