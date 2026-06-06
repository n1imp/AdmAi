import { defineConfig } from 'vitest/config';

/**
 * Config de teste do backend.
 *
 * Os testes UNITÁRIOS (src/**) não tocam o banco — mas importam módulos que,
 * em cadeia, carregam config/env.js (validação Zod que faz process.exit em var
 * faltando). Por isso injetamos um env mínimo de teste aqui, tornando `npm test`
 * autossuficiente (sem precisar exportar variáveis na linha de comando).
 *
 * Os testes de INTEGRAÇÃO (test/integration/**) usam o DATABASE_URL real definido
 * no ambiente/CI (.env.test), que tem precedência sobre o default abaixo.
 */
const envPadrao = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://chaveiro:chaveiro123@localhost:5432/chaveirobot_test',
  API_TOKEN: 'test-api-token',
  JWT_SECRET: '0123456789012345678901234567890123456789',
};
for (const [k, v] of Object.entries(envPadrao)) {
  if (!process.env[k]) process.env[k] = v;
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.js'],
    // globals desligado: importamos describe/it/expect explicitamente.
  },
});
