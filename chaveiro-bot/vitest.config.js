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

// O .env do host pode trazer ADMIN_USERNAME/ADMIN_PASSWORD inválidos (ex.: senha < 8),
// o que faria env.js abortar (process.exit) nos testes unitários. Como o dotenv (carregado
// dentro de env.js) NÃO sobrescreve vars já definidas em process.env, fixamos valores
// válidos aqui ANTES — sem depender do ambiente do host.
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
  process.env.ADMIN_PASSWORD = 'test-admin-pass';
}
if (!process.env.ADMIN_USERNAME || !/^[a-zA-Z0-9_]{3,}$/.test(process.env.ADMIN_USERNAME)) {
  process.env.ADMIN_USERNAME = 'testadmin';
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.js'],
    // globals desligado: importamos describe/it/expect explicitamente.
    // Timeouts folgados: o cold-import de módulos (ex.: client Prisma sob resetModules)
    // pode ser lento em disco/OneDrive — evita falhas espúrias por timeout de hook.
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
