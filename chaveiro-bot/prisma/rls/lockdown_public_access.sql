-- =============================================================================
-- STG-SEC-RLS-01 — Lockdown do acesso externo ao schema `public` (STAGING)
-- =============================================================================
-- Fecha o finding BLOQUEANTE descoberto no admai-staging: 26 tabelas com RLS
-- DISABLED e grants full de anon/authenticated (Advisor: rls_disabled_in_public,
-- ERROR/EXTERNAL). Como a aplicacao e PRISMA_ONLY (backend) e NUNCA usa anon/
-- authenticated (frontend sem @supabase/*, backend so usa service-role p/ Storage),
-- revogar esses grants tem risco de compatibilidade ZERO.
--
-- Decisao D1 (Codex DECISOR, thread 01a03164, CONCORDO — opcao C ancorada em B):
--   PRIMARIO   : REVOKE integral de anon, authenticated e PUBLIC sobre TODOS os
--                objetos de `public` (tabelas/views, colunas, sequences, routines)
--                + defaults + privilegios de schema.
--   DEFESA/ADV : ENABLE ROW LEVEL SECURITY nas 26 tabelas do Prisma, SEM FORCE e
--                SEM policies — zera os 26 erros do Advisor e vira deny-all p/ roles
--                normais; o runtime (role postgres, BYPASSRLS) segue funcionando.
--
-- NAO e uma migration do Prisma (nao entra em _prisma_migrations). NAO toca
-- enable_rls.sql (isolamento inter-tenant e outra missao). Idempotente.
--
-- ⚠️ SOMENTE STAGING. Producao NAO deve ser alvo (PRODUCTION_RLS_STATE=UNKNOWN).
--
-- COMO RODAR (staging-only, aborta se o ref nao for confirmado):
--   psql "$STAGING_DIRECT_URL" \
--     --set ON_ERROR_STOP=1 \
--     -v staging_ref=qsuufuulxfkkeasgxhcv \
--     -f prisma/rls/lockdown_public_access.sql
--
-- Verificacao e negative controls: prisma/rls/verify_lockdown.sql +
-- scripts/staging-rls-negative-control.mjs. Runbook: prisma/rls/RUNBOOK_lockdown.md.
-- =============================================================================

\set ON_ERROR_STOP on

-- ── Guard de ambiente: exige -v staging_ref e confirma o ref do admai-staging ──
\if :{?staging_ref}
\else
\echo '*** ABORTADO: rode com  -v staging_ref=qsuufuulxfkkeasgxhcv  (staging-only) ***'
\quit 1
\endif
SELECT :'staging_ref' = 'qsuufuulxfkkeasgxhcv' AS ref_ok \gset
\if :ref_ok
\echo '>> staging ref confirmado (qsuufuulxfkkeasgxhcv)'
\else
\echo '*** ABORTADO: staging_ref divergente do admai-staging esperado ***'
\quit 1
\endif

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Preflight in-SQL: 26 tabelas presentes e SEM policies preexistentes ────────
-- (D1: se houver qualquer policy nas 26, PARE e decida — nao apagar automaticamente.)
DO $$
DECLARE
  t text;
  modelos text[] := ARRAY[
    'Empresa','EmpresaWhatsapp','Tecnico','DocumentoTecnico','Servico','Material',
    'MovimentacaoEstoque','ServicoMaterial','Usuario','ContaSocial','Notificacao','Pagamento',
    'SessaoConversa','Avaliacao','ConexaoBot','RegistroPonto','BatidaPonto','GoogleConta',
    'AvaliacaoGoogle','AnaliseAvaliacoes','CodigoRecuperacaoTotp','Assinatura','ConviteUsuario',
    'SessaoUsuario','RefreshToken','AuditLog'
  ];
  faltando text[] := '{}';
  com_policy text[] := '{}';
  n int;
BEGIN
  FOREACH t IN ARRAY modelos LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      faltando := faltando || t;
    END IF;
  END LOOP;
  IF array_length(faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01: tabelas esperadas ausentes em public: %', faltando;
  END IF;

  FOREACH t IN ARRAY modelos LOOP
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n > 0 THEN
      com_policy := com_policy || t;
    END IF;
  END LOOP;
  IF array_length(com_policy, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'STG-SEC-RLS-01: policies preexistentes em % — PARE e decida (este script nao apaga policy)',
      com_policy;
  END IF;
END $$;

-- ── PRIMARIO: REVOKE integral sobre objetos EXISTENTES de `public` ─────────────
-- ALL TABLES cobre tabelas, views, materialized views e foreign tables (inclui
-- _prisma_migrations); REVOKE ALL cobre tambem grants por coluna. ALL ROUTINES
-- cobre functions e procedures (remove o EXECUTE herdado por PUBLIC por padrao).
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- ── Privilegios de SCHEMA ─────────────────────────────────────────────────────
-- Tira USAGE+CREATE de anon/authenticated (nao usam o schema). NAO tocamos
-- USAGE de PUBLIC (blast radius sobre todos os roles Supabase — D1); so o CREATE.
REVOKE ALL    ON SCHEMA public FROM anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ── DEFAULT PRIVILEGES: neutraliza grants FUTUROS a anon/authenticated/PUBLIC ──
-- Qualificado FOR ROLE pelos CRIADORES DE DDL DE `public` — owners de relacoes (todas as
-- relkinds, inclui sequences) + owners de routines de public. Escopo DELIBERADAMENTE
-- limitado a esses roles [REVISOR DELTA]: NAO incluimos todo defaclrole (isso pegaria
-- roles internos de Auth/Storage e o ADP global tocaria functions futuras deles em
-- outros schemas — fora do boundary). Sem FOR ROLE nao seria prova suficiente (D1).
-- insufficient_privilege e FATAL (fail-closed): se o executor nao puder alterar os
-- defaults de um criador, o lockdown ABORTA — melhor abortar que deixar buraco silencioso.
--
-- Duas camadas:
--   (a) IN SCHEMA public REVOKE ... FROM anon, authenticated, PUBLIC — neutraliza os
--       defaults INJETADOS (ex.: Supabase concede a anon/authenticated em public).
--   (b) GLOBAL (sem IN SCHEMA) REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated,
--       PUBLIC — SUPRIME o default EMBUTIDO de EXECUTE-a-PUBLIC em novas functions, que
--       o IN SCHEMA nao materializa em PG15/16 [REVISOR F2, verificado empiricamente].
--       Fecha o residual. Como o conjunto e so os criadores de `public`, o alcance
--       cross-schema fica restrito a esses roles (nunca owner/service_role/internos).
DO $$
DECLARE
  r text;
  criadores text[];
BEGIN
  SELECT array_agg(DISTINCT rol) INTO criadores FROM (
    SELECT pg_get_userbyid(c.relowner) AS rol
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')
    UNION
    SELECT pg_get_userbyid(p.proowner)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
  ) x WHERE rol IS NOT NULL;

  FOREACH r IN ARRAY COALESCE(criadores, ARRAY[]::text[]) LOOP
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated, PUBLIC;', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, PUBLIC;', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON ROUTINES  FROM anon, authenticated, PUBLIC;', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;', r);
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'STG-SEC-RLS-01: sem permissao p/ ALTER DEFAULT PRIVILEGES FOR ROLE % — rode como um role membro/owner desse criador (ex.: postgres). Abortado (fail-closed).', r;
    END;
  END LOOP;
END $$;

-- ── DEFESA EM PROFUNDIDADE + Advisor: ENABLE RLS (NO FORCE, sem policy) nas 26 ─
-- Deny-all para roles normais; runtime postgres (BYPASSRLS) intacto. NO FORCE de
-- proposito: FORCE nao protege contra BYPASSRLS e acoplaria com o isolamento
-- inter-tenant (enable_rls.sql), que e missao separada.
DO $$
DECLARE
  t text;
  modelos text[] := ARRAY[
    'Empresa','EmpresaWhatsapp','Tecnico','DocumentoTecnico','Servico','Material',
    'MovimentacaoEstoque','ServicoMaterial','Usuario','ContaSocial','Notificacao','Pagamento',
    'SessaoConversa','Avaliacao','ConexaoBot','RegistroPonto','BatidaPonto','GoogleConta',
    'AvaliacaoGoogle','AnaliseAvaliacoes','CodigoRecuperacaoTotp','Assinatura','ConviteUsuario',
    'SessaoUsuario','RefreshToken','AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY modelos LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

COMMIT;

-- Recarrega o cache de schema do PostgREST (determinismo; nao substitui os testes).
NOTIFY pgrst, 'reload schema';

\echo '>> STG-SEC-RLS-01 lockdown aplicado. Rode verify_lockdown.sql + staging-rls-negative-control.mjs.'
