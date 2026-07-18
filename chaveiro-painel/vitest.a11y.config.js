import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Config dedicada da suite de acessibilidade (axe-core) — F9/M6 (fase B).
// Standalone (NAO estende o vite.config.js via mergeConfig, que CONCATENA o `include`
// e acabaria rodando a suite inteira). Roda SO os arquivos *.axe.jsx — o gate de a11y
// fica separado e pode ser NAO-bloqueante no CI sem afetar `npm test` / `test:coverage`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.axe.jsx'],
  },
});
