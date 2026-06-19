import 'dotenv/config';
import { z } from 'zod';

// Exportado para testes unitários (valida o cross-field sem disparar process.exit).
export const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Conexão DIRETA p/ migrations (Supabase pooler). Opcional: só exigida quando o
  // schema Postgres é usado (prod/CI); o dev local em SQLite não precisa.
  DIRECT_URL: z.string().optional(),
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
}).superRefine((cfg, ctx) => {
  // Cross-field: se o gateway Evolution está habilitado (EVOLUTION_HOST setado),
  // exigimos as vars sem as quais ele não funciona — falha rápida no boot com
  // mensagem clara. PUBLIC_URL é apenas RECOMENDADA (webhook inbound), então NÃO
  // falha aqui — é reportada via diagnóstico em tempo de execução.
  if (cfg.EVOLUTION_HOST) {
    if (!cfg.EVOLUTION_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EVOLUTION_API_KEY'],
        message: 'EVOLUTION_API_KEY é obrigatória quando EVOLUTION_HOST está definido.',
      });
    }
    if (!cfg.ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_KEY'],
        message: 'ENCRYPTION_KEY é obrigatória quando EVOLUTION_HOST está definido (cifra segredos do WhatsApp).',
      });
    }
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
