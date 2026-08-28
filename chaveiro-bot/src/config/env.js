import dotenv from 'dotenv';
import { z } from 'zod';

// Em teste carregamos `.env.test` (hermético). Sem isso, `import 'dotenv/config'`
// puxava o `.env` de prod local e vazava vars (ex.: RLS_ENABLED) para a suíte,
// quebrando tenant.test. Prod/dev seguem no `.env` de sempre.
dotenv.config({
  path: process.env.VITEST || process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
});

/* ── STG-APP-STAGING-01: identidade dos projetos Supabase (D1 thread 01a038e5) ──
   O guard de staging é fail-closed e usa VÍNCULO POSITIVO ao ref de staging além da
   denylist de produção: denylist sozinha não prova que a conexão é do projeto certo.
   Constantes exportadas para os testes de sabotagem não duplicarem strings mágicas. */
export const REF_STAGING = 'qsuufuulxfkkeasgxhcv'; // admai-staging (ÚNICO alvo autorizado)
export const REF_PRODUCAO = 'disljhkypaxpyzvbooge'; // AdmAi produção (PROIBIDO em staging)
export const ORIGEM_FRONTEND_STAGING = 'https://staging.admai-painel.pages.dev';

/** Extrai o project-ref de uma connection string do Supabase por parsing ESTRUTURAL —
 *  nunca logamos a URL (credencial). [REVISOR 01a038fc achado 1] O ref SÓ é aceito quando
 *  o HOSTNAME também é estruturalmente do Supabase: `postgres.<ref>@evil.example` extraía
 *  o ref do username em qualquer host e falsificava o vínculo positivo. Formas aceitas:
 *    pooler:  user `postgres.<ref>` @ `*.pooler.supabase.com`
 *    direta:  host `db.<ref>.supabase.co`
 *  Qualquer outra combinação ⇒ null (fail-closed). */
export function refDaConexaoSupabase(urlBruta) {
  try {
    const u = new URL(urlBruta);
    if (u.username.startsWith('postgres.') && /(^|\.)pooler\.supabase\.com$/.test(u.hostname)) {
      return u.username.slice('postgres.'.length);
    }
    const m = u.hostname.match(/^db\.([a-z0-9]{16,})\.supabase\.co$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Exportado para testes unitários (valida o cross-field sem disparar process.exit).
export const schema = z
  .object({
    // ── Ambiente de APLICAÇÃO, ortogonal a NODE_ENV (D1 01a038e5) ────────────
    // NODE_ENV=production controla comportamento seguro/perf do runtime; APP_ENV
    // distingue o AMBIENTE (staging roda NODE_ENV=production + APP_ENV=staging,
    // sem relaxar nenhum guard de produção). Ausente = comportamento atual intacto.
    APP_ENV: z.enum(['production', 'staging', 'development', 'test']).optional(),
    // Allowlist positiva do staging (obrigatória quando APP_ENV=staging).
    STAGING_REF: z.string().optional(),
    // Denylist extra (refs proibidos, separados por vírgula) — defesa em profundidade;
    // o ref de produção conhecido é SEMPRE negado em staging, com ou sem esta var.
    PROD_REF_BLOCKLIST: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    // F4-RLS: conexão do RUNTIME de REQUEST via role app_rw (SEM BYPASSRLS) → ativa a RLS
    // nas queries escopadas (prismaParaEmpresa). Ausente = reusa DATABASE_URL (role atual,
    // RLS inócua) → comportamento idêntico. Jobs/auth cross-tenant seguem no DATABASE_URL.
    DATABASE_URL_APP: z.string().optional(),
    // Conexão DIRETA p/ migrations (Supabase pooler). Opcional: só exigida quando o
    // schema Postgres é usado (prod/CI); o dev local em SQLite não precisa.
    DIRECT_URL: z.string().optional(),
    // [D-STG-K-SUITE-VS-STAGING-01 · Codex 01a040e7] maxWait das transações interativas do
    // Prisma, afinável SÓ por este knob validado: ausente ⇒ transactionOptions nem é passada
    // e o default do Prisma (2s) fica intacto. Existe porque contra o pooler REMOTO de
    // staging o RTT faz "Unable to start a transaction in the given time" sob carga
    // sequencial da suíte; produção (mesma região) não precisa e não muda.
    PRISMA_TX_MAX_WAIT_MS: z.coerce.number().int().positive().max(60_000).optional(),
    PORT: z.string().default('3000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_TOKEN: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    // ── Bootstrap de admin (conveniência de dev) ──────────────────────────────
    // Se ADMIN_USERNAME + ADMIN_PASSWORD estiverem definidos E o banco não tiver
    // nenhum usuário, o backend cria esse admin (+ empresa) automaticamente na
    // subida. Idempotente e seguro: só roda em banco vazio.
    ADMIN_USERNAME: z
      .string()
      .min(3)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    ADMIN_NOME: z.string().min(2).optional(), // nome exibido (default 'Admin')
    ADMIN_EMPRESA: z.string().min(2).optional(), // nome da empresa (default 'Empresa Dev')
    // CORS do painel
    ALLOWED_ORIGIN: z.string().optional(),
    // ── Login social (OIDC) ───────────────────────────────────────────────────
    // Cada provedor só é HABILITADO se a sua client id estiver definida. Apenas IDs
    // públicas (audience dos ID tokens) — nenhum segredo é necessário p/ entrar.
    GOOGLE_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_TENANT: z.string().default('common'), // common | organizations | consumers | <tenantId>
    APPLE_CLIENT_ID: z.string().optional(), // Services ID (ex.: com.empresa.app.web)
    // ── Gateway WhatsApp (Evolution API) ──────────────────────────────────────
    EVOLUTION_HOST: z.string().optional(), // ex.: http://localhost:8080 (dev: instância local)
    EVOLUTION_API_KEY: z.string().optional(), // API key GLOBAL do servidor Evolution
    EVOLUTION_INSTANCE: z.string().optional(), // legado (não usado no número único)
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
    META_APP_SECRET: z.string().optional(), // valida a assinatura X-Hub-Signature-256 do webhook
    WHATSAPP_VERIFY_TOKEN: z.string().optional(), // token do handshake GET do webhook (hub.verify_token)
    WHATSAPP_API_VERSION: z.string().default('v21.0'), // versão da Graph API (graph.facebook.com)
    // ── Robô de NÚMERO ÚNICO (Evolution) ──────────────────────────────────────
    // Uma instância global atende todas as empresas; o remetente é identificado pelo telefone.
    BOT_INSTANCE_NAME: z.string().default('admai-bot'), // nome da instância única do robô
    SUPER_ADMIN_USERNAME: z.string().optional(), // username que gerencia a conexão do robô
    // ── Integração Google Business Profile (avaliações) — atrás de flag ────────
    // Tudo opcional: com a flag off, as rotas usam mocks/validateOnly e não publicam.
    GOOGLE_REVIEWS_ENABLED: z.string().optional(), // "true" liga a integração real
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(), // ex.: https://api.dominio/api/google/oauth/callback
    GOOGLE_BUSINESS_VALIDATE_ONLY: z.string().optional(), // "false" para publicar de verdade (default: valida só)
    // ── IA (análise de avaliações) ─────────────────────────────────────────────
    ANTHROPIC_API_KEY: z.string().optional(), // ausente = análise por IA desligada
    AI_REVIEWS_MODEL: z.string().default('claude-haiku-4-5'),
    // ── Isolamento multi-tenant no banco (RLS) — defesa em profundidade ────────
    // "true" faz o client escopado por empresa (prismaParaEmpresa) setar o GUC
    // app.empresa_id por transação, ativando as policies de Row Level Security
    // (ver prisma/rls/enable_rls.sql). Default OFF: comportamento idêntico ao atual
    // (só o filtro app-level). LIGUE apenas após criar o role sem BYPASSRLS e validar
    // em staging — RLS é fail-closed (sem o GUC, a policy retorna zero linhas).
    RLS_ENABLED: z.string().optional(),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    // ── Object storage (Supabase Storage) — F1b ───────────────────────────────
    // Ambos presentes = uploads vão pro bucket; ausentes = fallback pro disco local
    // (Expand/Contract: seguro deployar antes de configurar as credenciais).
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    // "true" torna o storage OBRIGATÓRIO no caminho de upload: em falha (ou ausência) do
    // storage, NÃO cai para o disco local — lança. Necessário ANTES de escalar para N
    // réplicas (F2): um arquivo gravado no disco de UMA réplica não é servido pelas outras
    // (404 intermitente). Default OFF: mantém o fallback resiliente do monolito single-replica.
    STORAGE_STRICT: z.string().optional(),
    // F1c — papel do processo: 'web' serve só HTTP; ausente/'all'/'worker' roda os jobs
    // (workers BullMQ + agendador). Default (ausente) = monolito atual.
    ROLE: z.enum(['web', 'worker', 'all']).optional(),
    // ── Serviço em andamento ("serviço atual" do funcionário) — F9/M3, atrás de flag ──
    // "true" habilita as transições POST /servicos/:id/iniciar|concluir e GET /me/servico-atual.
    // Ausente/qualquer outro valor = INERTE: esses endpoints respondem 404 e o schema fica
    // dormante (colunas nulas). Contrato aditivo; ligar em staging antes de produção.
    SERVICO_ANDAMENTO_ENABLED: z.string().optional(),
    // ── Documentos do funcionário (bucket privado) — F9/M4, atrás de flag ─────────
    // "true" habilita GET/POST/DELETE /me/documentos. Ausente = endpoints respondem 404.
    // Documentos vão a um bucket PRIVADO (URL assinada); requer SUPABASE_URL/KEY em prod
    // (STORAGE_STRICT decide se cai pro disco). Ligar em staging antes de produção.
    DOCUMENTOS_ENABLED: z.string().optional(),
    // ── Enforcement comercial (paywall) — FUTURO ciclo comercial, fora do MVP ─────
    // Decisão soberana (FRONTEND REFOUNDATION Cycle 1, D2): assinaturas pagas saíram do
    // MVP. Somente a string literal "true" liga o paywall (requireAssinaturaAtiva);
    // ausente/qualquer outro valor = produto livre. O middleware, o Stripe e o webhook
    // ficam preservados intactos para quando o modelo comercial voltar.
    ASSINATURA_ENFORCEMENT_ENABLED: z.string().optional(),
    // ── Observabilidade ───────────────────────────────────────────────────────
    SENTRY_DSN: z.string().url().optional(), // ausente = Sentry desligado (dev/test)
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APP_VERSION: z.string().optional(), // ex.: tag de release, usada no Sentry/logs
    // ── Email transacional (Resend) ───────────────────────────────────────────
    RESEND_API_KEY: z.string().optional(),
    FROM_EMAIL: z.string().email().default('noreply@barbers-flow.com'),
    SUPPORT_EMAIL: z.string().email().default('suporte@barbers-flow.com'),
    FRONTEND_URL: z.string().url().optional(),
    // Quando true, bloqueia acesso de usuários com e-mail não verificado
    REQUIRE_EMAIL_VERIFICATION: z.string().optional(),
    // ── Billing (Stripe) ─────────────────────────────────────────────────────
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID_PRO: z.string().optional(),
  })
  .superRefine((cfg, ctx) => {
    /* ── ANTI-PRODUCTION GUARD (APP_ENV=staging) — fail-closed no BOOT ──────────
       [STG-APP-STAGING-01 · D1 thread 01a038e5] Staging DEVE ser incapaz de tocar
       produção: o parse falha (safeParse + process.exit(1) abaixo) antes de abrir
       qualquer conexão. Regras: vínculo POSITIVO de toda conexão ao REF_STAGING
       (denylist sozinha não prova identidade), origens comparadas por IGUALDADE
       EXATA (nunca substring) e NENHUMA mensagem contém a URL (credenciais).
       APP_ENV ausente/≠staging ⇒ este bloco é inerte (comportamento atual). */
    if (cfg.APP_ENV === 'staging') {
      const falha = (path, message) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      // 1) Allowlist positiva do alvo.
      if (cfg.STAGING_REF !== REF_STAGING) {
        falha(
          'STAGING_REF',
          `APP_ENV=staging exige STAGING_REF=${REF_STAGING} (admai-staging). Valor ausente ou divergente — abortado.`
        );
      }

      // 2) Toda conexão a banco/Supabase: ref de produção NEGADO (defesa em
      //    profundidade, string bruta) E ref extraído estruturalmente DEVE ser o
      //    de staging (fail-closed: forma desconhecida/localhost também reprova).
      const refsNegados = [
        REF_PRODUCAO,
        ...(cfg.PROD_REF_BLOCKLIST ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ];
      const conexoes = [
        ['DATABASE_URL', cfg.DATABASE_URL, true],
        ['DATABASE_URL_APP', cfg.DATABASE_URL_APP, false], // opcional; vinculada quando presente
        ['DIRECT_URL', cfg.DIRECT_URL, true], // migrations no boot dependem dela
      ];
      for (const [nome, valor, obrigatoria] of conexoes) {
        if (!valor) {
          if (obrigatoria)
            falha(nome, `${nome} é obrigatória em staging (conexão do admai-staging).`);
          continue;
        }
        if (refsNegados.some((ref) => valor.includes(ref))) {
          falha(nome, `${nome} contém um ref de PRODUÇÃO/bloqueado — staging abortado.`);
          continue;
        }
        if (refDaConexaoSupabase(valor) !== REF_STAGING) {
          falha(
            nome,
            `${nome} não está vinculada ao projeto admai-staging (${REF_STAGING}) — vínculo positivo obrigatório, abortado.`
          );
        }
      }

      // 3) SUPABASE_URL (Storage/Auth): obrigatória em staging (sem ela o upload cai
      //    para o disco local — quebra atrás do CDN) e vinculada ao host do staging.
      if (!cfg.SUPABASE_URL) {
        falha(
          'SUPABASE_URL',
          'SUPABASE_URL é obrigatória em staging (Storage/Auth do admai-staging).'
        );
      } else {
        // [REVISOR 01a038fc achado 1] URL COMPLETA exata: https obrigatório (host certo
        // com http:// passava — downgrade de transporte no caminho do Storage/Auth).
        let u = null;
        try {
          u = new URL(cfg.SUPABASE_URL);
        } catch {
          /* u=null ⇒ reprova abaixo */
        }
        if (!u || u.protocol !== 'https:' || u.hostname !== `${REF_STAGING}.supabase.co`) {
          falha(
            'SUPABASE_URL',
            `SUPABASE_URL deve ser exatamente https://${REF_STAGING}.supabase.co (https obrigatório) — abortado.`
          );
        }
      }

      // 3b) Storage é OBRIGATÓRIO em staging [REVISOR 01a038fc achado 3]: sem service-role
      //     ou sem STORAGE_STRICT=true o upload degrada para o disco local do container —
      //     atrás do CDN isso é 404 intermitente e um staging que MENTE sobre a produção.
      if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
        falha(
          'SUPABASE_SERVICE_ROLE_KEY',
          'SUPABASE_SERVICE_ROLE_KEY (do admai-staging) é obrigatória em staging — Storage server-side.'
        );
      }
      if (cfg.STORAGE_STRICT !== 'true') {
        falha(
          'STORAGE_STRICT',
          'APP_ENV=staging exige STORAGE_STRICT=true (upload nunca cai no disco atrás do CDN).'
        );
      }

      // 4) CORS: origem EXATA do frontend staging (credenciais atravessam; '*',
      //    localhost, placeholder ou produção reprovam TODOS pela igualdade exata).
      if (cfg.ALLOWED_ORIGIN !== ORIGEM_FRONTEND_STAGING) {
        falha(
          'ALLOWED_ORIGIN',
          `APP_ENV=staging exige ALLOWED_ORIGIN=${ORIGEM_FRONTEND_STAGING} (igualdade exata; ausente/'*'/localhost/produção reprovam).`
        );
      }

      // 5) FRONTEND_URL (links de email): mesma origem do frontend staging.
      let origemFrontend = null;
      try {
        origemFrontend = cfg.FRONTEND_URL ? new URL(cfg.FRONTEND_URL).origin : null;
      } catch {
        /* origem=null ⇒ reprova */
      }
      if (origemFrontend !== ORIGEM_FRONTEND_STAGING) {
        falha(
          'FRONTEND_URL',
          `APP_ENV=staging exige FRONTEND_URL com origem ${ORIGEM_FRONTEND_STAGING} — abortado.`
        );
      }

      // 6) PUBLIC_URL (URL pública do PRÓPRIO backend staging), quando presente:
      //    https e sem qualquer ref/host de produção.
      if (cfg.PUBLIC_URL) {
        const publicaOk = (() => {
          try {
            const u = new URL(cfg.PUBLIC_URL);
            if (u.protocol !== 'https:') return false;
            if (refsNegados.some((ref) => cfg.PUBLIC_URL.includes(ref))) return false;
            if (u.hostname === 'admai-production.up.railway.app') return false;
            if (u.hostname === 'api.chaveirobot.com.br') return false;
            return true;
          } catch {
            return false;
          }
        })();
        if (!publicaOk) {
          falha(
            'PUBLIC_URL',
            'PUBLIC_URL de staging deve ser https e não pode apontar para produção.'
          );
        }
      }
    }

    // Em produção, CORS NUNCA pode cair no wildcard '*': exige uma origem explícita
    // (o painel). Sem isso, qualquer site poderia chamar a API com credenciais do usuário.
    if (cfg.NODE_ENV === 'production' && !cfg.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY é obrigatória em produção (email transacional).',
      });
    }
    if (cfg.NODE_ENV === 'production' && !cfg.FRONTEND_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_URL'],
        message: 'FRONTEND_URL é obrigatória em produção (links nos emails).',
      });
    }
    if (cfg.NODE_ENV === 'production' && (!cfg.ALLOWED_ORIGIN || cfg.ALLOWED_ORIGIN === '*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ALLOWED_ORIGIN'],
        message:
          'ALLOWED_ORIGIN é obrigatória em produção (ex.: https://app.SEUDOMINIO) — sem wildcard.',
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
          message:
            'ENCRYPTION_KEY é obrigatória quando EVOLUTION_HOST está definido (cifra segredos do WhatsApp).',
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
          message:
            'META_APP_SECRET é obrigatória quando WHATSAPP_PROVIDER=cloud (valida a assinatura do webhook).',
        });
      }
      if (!cfg.WHATSAPP_VERIFY_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WHATSAPP_VERIFY_TOKEN'],
          message:
            'WHATSAPP_VERIFY_TOKEN é obrigatória quando WHATSAPP_PROVIDER=cloud (handshake GET do webhook).',
        });
      }
      if (!cfg.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message:
            'ENCRYPTION_KEY é obrigatória quando WHATSAPP_PROVIDER=cloud (cifra o access token da Meta).',
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
