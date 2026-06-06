import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ADMIN_PASSWORD: z.string().min(4).optional(),
  // CORS do painel
  ALLOWED_ORIGIN: z.string().optional(),
  // Grupo legado (fluxo antigo Baileys) — agora opcional; multi-tenant usa EmpresaWhatsapp.grupoJid
  GROUP_JID: z.string().optional(),
  // ── Gateway WhatsApp (Evolution API multi-instância) ──────────────────────
  EVOLUTION_HOST: z.string().optional(),       // ex.: http://localhost:8080
  EVOLUTION_API_KEY: z.string().optional(),    // API key GLOBAL do servidor Evolution
  EVOLUTION_INSTANCE: z.string().optional(),   // legado (não usado no multi-instância)
  // URL pública do backend, usada para montar o webhook que a Evolution chama de volta
  PUBLIC_URL: z.string().optional(),
  // Chave mestra para cifrar segredos por-empresa (apikey de instância, webhookSecret)
  ENCRYPTION_KEY: z.string().min(16).optional(),
  // ── Observabilidade ───────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),     // ausente = Sentry desligado (dev/test)
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().optional(),          // ex.: tag de release, usada no Sentry/logs
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
