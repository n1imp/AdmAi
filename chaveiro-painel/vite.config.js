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
  build: {
    rollupOptions: {
      output: {
        // Separa libs pesadas em chunks próprios — derruba o bundle único de ~783KB
        // e melhora o cache (libs mudam menos que o código da app).
        // Forma de FUNÇÃO (compatível com Rollup e com o Rolldown do Vite 8+; a forma
        // de objeto quebra no Rolldown com "manualChunks is not a function").
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]react(-dom|-router-dom)?[\\/]/.test(id)) return 'react-vendor';
          if (id.includes('recharts')) return 'charts';
          if (id.includes('lucide-react')) return 'icons';
        },
      },
    },
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
