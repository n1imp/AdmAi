import { defineConfig } from 'vitest/config';
import { config as carregarEnv } from 'dotenv';

// Carrega .env.test (se existir) antes de tudo. No CI as vars vêm do ambiente.
carregarEnv({ path: '.env.test' });

// Fallbacks mínimos para o config de env não derrubar o processo.
process.env.NODE_ENV = 'test';
process.env.API_TOKEN ??= 'test-api-token';
process.env.JWT_SECRET ??= '0123456789012345678901234567890123456789';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.js'],
    globalSetup: ['./test/integration/global-setup.js'],
    // Banco compartilhado entre arquivos → evita corrida com TRUNCATE.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
