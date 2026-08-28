import { defineConfig } from 'vitest/config';
import { config as carregarEnv } from 'dotenv';

// Carrega .env.test (se existir) antes de tudo. No CI as vars vêm do ambiente.
carregarEnv({ path: '.env.test' });

// Fallbacks mínimos para o config de env não derrubar o processo.
process.env.NODE_ENV = 'test';
process.env.API_TOKEN ??= 'test-api-token';
process.env.JWT_SECRET ??= '0123456789012345678901234567890123456789';
// O robô do WhatsApp é uma feature futura (inerte por padrão). Nos testes de integração
// ligamos a flag para exercitar o roteamento inbound (número único) — é código válido.
process.env.WHATSAPP_HABILITADO ??= 'true';
// F9/M3: liga o "serviço em andamento" para exercitar iniciar/concluir/servico-atual.
// Só ativa os 3 endpoints novos; nenhuma rota existente muda. O caso flag-off (404) é
// coberto isoladamente no próprio teste via re-import com a flag desligada.
process.env.SERVICO_ANDAMENTO_ENABLED ??= 'true';
// F9/M4: liga os documentos do funcionário (/me/documentos). Sem SUPABASE_URL, o upload
// cai pro disco local (./uploads-docs) — suficiente para exercitar o CRUD nos testes.
process.env.DOCUMENTOS_ENABLED ??= 'true';
// Paywall FORA do MVP (D2, Refoundation Cycle 1) — default OFF em runtime. Nos testes a
// flag liga para manter a matriz completa do gate provada (billing_access_audit,
// paywall_402_motivos); o modo OFF é coberto isoladamente em billing_free_mode.test.js
// via re-import com a flag desligada (mesmo padrão do servico_atual flag-off).
process.env.ASSINATURA_ENFORCEMENT_ENABLED ??= 'true';

// Paridade com vitest.config.js: o .env do host pode trazer ADMIN_USERNAME/ADMIN_PASSWORD
// inválidos (ex.: senha < 8 chars, ou um `#` que o dotenv corta como comentário inline),
// o que faria env.js abortar (process.exit) ao subir os workers de integração. Como o
// dotenv (dentro de env.js) NÃO sobrescreve vars já definidas, fixamos valores válidos aqui.
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
  process.env.ADMIN_PASSWORD = 'test-admin-pass';
}
if (!process.env.ADMIN_USERNAME || !/^[a-zA-Z0-9_]{3,}$/.test(process.env.ADMIN_USERNAME)) {
  process.env.ADMIN_USERNAME = 'testadmin';
}

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
