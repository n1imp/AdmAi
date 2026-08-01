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
    // O wizard de NovoServico gasta ~4,1s isolado no default de 5s, e passa de
    // 5,2s sob carga (instrumentação de cobertura + suítes em paralelo) —
    // falhava por timeout, não por regressão. O backend usa 30s pelo mesmo
    // motivo. Não é máscara de bug: o teste percorre etapas reais com userEvent.
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      // Sem `include` explícito, o provider v8 só reporta arquivos que algum
      // teste carregou. Aqui isso era grave: a cobertura aparentava ~77% porque
      // media apenas 35 dos 86 arquivos-fonte — 63% do frontend, incluindo
      // AuthContext, App e as telas principais, ficava fora do denominador.
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
      reporter: ['text', 'json-summary', 'html'],
      // Limiares fixados no valor medido; sobem a cada PR que adiciona teste.
      // Queda reprova o CI.
      thresholds: {
        statements: 30,
        branches: 31,
        functions: 29,
        lines: 29,
      },
    },
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
