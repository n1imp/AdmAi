/**
 * Entry point do backend: inicializa observabilidade, monta o app, abre a porta,
 * sobe a camada WhatsApp + agendadores e gerencia o graceful shutdown.
 *
 * A construção do app vive em app.js (importável em testes sem abrir porta).
 */
import { env } from './config/env.js';
import { iniciarSentry } from './config/sentry.js';
import { criarApp } from './app.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';
import { iniciarAgendamentos } from './services/agendador.js';
import { bootstrapAdmin } from './services/bootstrap.js';

// Sentry deve inicializar antes de tudo para capturar erros de boot.
iniciarSentry();

const { app, estado } = criarApp();
const PORT = parseInt(env.PORT);

const server = app.listen(PORT, async () => {
  logger.info(`🔑 ChaveiroBot iniciado na porta ${PORT}`, {
    ambiente: env.NODE_ENV,
    whatsapp: env.EVOLUTION_HOST ? 'evolution' : 'nenhum',
  });

  try {
    await prisma.$connect();
    logger.info('✅ Banco de dados conectado');
  } catch (erro) {
    logger.error('❌ Falha ao conectar ao banco', { erro: erro.message });
    process.exit(1);
  }

  // Cria o admin de dev a partir do .env se o banco estiver vazio (idempotente).
  await bootstrapAdmin();

  // Camada WhatsApp: o robô de número único usa a Evolution API global (EVOLUTION_HOST)
  // ou a Cloud API (Meta) atrás da flag WHATSAPP_PROVIDER. O webhook global roteia o
  // inbound pelo telefone do remetente — não há boot de socket aqui.
  if (env.EVOLUTION_HOST) {
    logger.info('🌐 Gateway WhatsApp via Evolution API ativo', { host: env.EVOLUTION_HOST });
  } else {
    logger.warn('Nenhuma camada WhatsApp configurada (defina EVOLUTION_HOST).');
  }

  iniciarAgendamentos();
});

// ── Graceful shutdown (guia §5.2) ──────────────────────────────────────────
// Para de aceitar novas conexões, drena as em andamento, fecha o banco e sai.
async function desligar(sinal) {
  if (estado.isShuttingDown) return;
  estado.isShuttingDown = true;
  logger.info(`${sinal} recebido — iniciando graceful shutdown`);

  const forcar = setTimeout(() => {
    logger.error('Shutdown forçado após timeout de 30s');
    process.exit(1);
  }, 30_000);
  forcar.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (erro) {
      logger.error('Erro ao desconectar o banco no shutdown', { erro: erro.message });
    }
    clearTimeout(forcar);
    logger.info('Shutdown concluído');
    process.exit(0);
  });
}

process.on('SIGTERM', () => desligar('SIGTERM')); // docker stop / orquestrador
process.on('SIGINT', () => desligar('SIGINT'));   // Ctrl+C
