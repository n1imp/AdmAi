import 'dotenv/config';
import { z } from 'zod';

// Exportado para testes unitários (valida o cross-field sem disparar process.exit).
export const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_TOKEN: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // ── Bootstrap de admin (conveniência de dev) ──────────────────────────────
  // Se ADMIN_USERNAME + ADMIN_PASSWORD estiverem definidos E o banco não tiver
  // nenhum usuário, o backend cria esse admin (+ empresa) automaticamente na
  // subida. Idempotente e seguro: só roda em banco vazio.
  ADMIN_USERNAME: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/).optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  ADMIN_NOME: z.string().min(2).optional(),     // nome exibido (default 'Admin')
  ADMIN_EMPRESA: z.string().min(2).optional(),  // nome da empresa (default 'Empresa Dev')
  // CORS do painel
  ALLOWED_ORIGIN: z.string().optional(),
  // ── Login social (OIDC) ───────────────────────────────────────────────────
  // Cada provedor só é HABILITADO se a sua client id estiver definida. Apenas IDs
  // públicas (audience dos ID tokens) — nenhum segredo é necessário p/ entrar.
  GOOGLE_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_TENANT: z.string().default('common'), // common | organizations | consumers | <tenantId>
  APPLE_CLIENT_ID: z.string().optional(),         // Services ID (ex.: com.empresa.app.web)
  // ── Gateway WhatsApp (Evolution API) ──────────────────────────────────────
  EVOLUTION_HOST: z.string().optional(),       // ex.: http://localhost:8080 (dev: instância local)
  EVOLUTION_API_KEY: z.string().optional(),    // API key GLOBAL do servidor Evolution
  EVOLUTION_INSTANCE: z.string().optional(),   // legado (não usado no número único)
  // URL pública do backend, usada para montar o webhook que a Evolution chama de volta
  PUBLIC_URL: z.string().optional(),
  // Chave mestra para cifrar segredos em repouso (tokens Cloud/Google, OTP, webhookSecret).
  ENCRYPTION_KEY: z.string().min(16).optional(),
  // ── Liga/desliga o robô do WhatsApp (feature futura) ──────────────────────
  // "true" processa eventos inbound; ausente/qualquer outro = INERTE (webhook ainda
  // responde 200, mas nada é processado). A estrutura fica pronta para religar depois.
  WHATSAPP_HABILITADO: z.string().optional(),
  // ── Seleção do provider de WhatsApp ───────────────────────────────────────
  // 'evolution' (padrão): número único via Evolution API. 'cloud': API oficial da Meta.
  WHATSAPP_PROVIDER: z.enum(['evolution', 'cloud']).default('evolution'),
  // ── WhatsApp Cloud API (Meta) — usados quando WHATSAPP_PROVIDER='cloud' ────
  META_APP_SECRET: z.string().optional(),        // valida a assinatura X-Hub-Signature-256 do webhook
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),  // token do handshake GET do webhook (hub.verify_token)
  WHATSAPP_API_VERSION: z.string().default('v21.0'), // versão da Graph API (graph.facebook.com)
  // ── Robô de NÚMERO ÚNICO (Evolution) ──────────────────────────────────────
  // Uma instância global atende todas as empresas; o remetente é identificado pelo telefone.
  BOT_INSTANCE_NAME: z.string().default('admai-bot'), // nome da instância única do robô
  SUPER_ADMIN_USERNAME: z.string().optional(),        // username que gerencia a conexão do robô
  // ── Integração Google Business Profile (avaliações) — atrás de flag ────────
  // Tudo opcional: com a flag off, as rotas usam mocks/validateOnly e não publicam.
  GOOGLE_REVIEWS_ENABLED: z.string().optional(),          // "true" liga a integração real
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),       // ex.: https://api.dominio/api/google/oauth/callback
  GOOGLE_BUSINESS_VALIDATE_ONLY: z.string().optional(),   // "false" para publicar de verdade (default: valida só)
  // ── IA (análise de avaliações) ─────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().optional(),               // ausente = análise por IA desligada
  AI_REVIEWS_MODEL: z.string().default('claude-haiku-4-5'),
  // ── Observabilidade ───────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),     // ausente = Sentry desligado (dev/test)
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().optional(),          // ex.: tag de release, usada no Sentry/logs
}).superRefine((cfg, ctx) => {
  // Em produção, CORS NUNCA pode cair no wildcard '*': exige uma origem explícita
  // (o painel). Sem isso, qualquer site poderia chamar a API com credenciais do usuário.
  if (cfg.NODE_ENV === 'production' && (!cfg.ALLOWED_ORIGIN || cfg.ALLOWED_ORIGIN === '*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOWED_ORIGIN'],
      message: 'ALLOWED_ORIGIN é obrigatória em produção (ex.: https://app.SEUDOMINIO) — sem wildcard.',
    });
  }
  // Cross-field: se o gateway Evolution está habilitado (EVOLUTION_HOST setado),
  // exigimos as vars sem as quais ele não funciona — falha rápida no boot.
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
  // Cross-field: com a Cloud API (WHATSAPP_PROVIDER='cloud'), exigimos o segredo do
  // app (assinatura do webhook), o verify token (handshake GET) e a ENCRYPTION_KEY.
  if (cfg.WHATSAPP_PROVIDER === 'cloud') {
    if (!cfg.META_APP_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['META_APP_SECRET'],
        message: 'META_APP_SECRET é obrigatória quando WHATSAPP_PROVIDER=cloud (valida a assinatura do webhook).',
      });
    }
    if (!cfg.WHATSAPP_VERIFY_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WHATSAPP_VERIFY_TOKEN'],
        message: 'WHATSAPP_VERIFY_TOKEN é obrigatória quando WHATSAPP_PROVIDER=cloud (handshake GET do webhook).',
      });
    }
    if (!cfg.ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_KEY'],
        message: 'ENCRYPTION_KEY é obrigatória quando WHATSAPP_PROVIDER=cloud (cifra o access token da Meta).',
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
