-- =============================================================================
-- STG-SEC-RLS-01 — Lockdown v2 do acesso externo ao schema `public` (STAGING)
-- =============================================================================
-- REVISAO v2 do artefato aprovado (v1 = lockdown_public_access.sql, CONGELADO e
-- preservado). Motivo (evidencia real do apply externo): o postgres do Supabase
-- hosted NAO tem authority sobre ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
-- (role de plataforma com defaults reais em public concedendo a anon/authenticated)
-- — o v1 abortou fail-closed com rollback total, como projetado.
--
-- Decisao D1 v2 (Codex DECISOR thread 01a035ce, CONCORDO — B + D-detectivo +
-- D-forte ajustado; D1 original 01a03164; revisoes v1 thread 01a03185):
--   1) Mesmo fechamento v1 de objetos ATUAIS (REVOKEs + schema CREATE + RLS 26).
--   2) ADP dos criadores administraveis; UNICA excecao tolerada (hard-assert):
--      supabase_admin — WARNING detalhado, nunca PASS silencioso; qualquer OUTRO
--      role nao-administravel => ROLLBACK.
--   3) CHOKE POINT preventivo: REVOKE USAGE ON SCHEMA public FROM PUBLIC +
--      snapshot/regrant atomico do USAGE efetivo (re-concede a todos os roles
--      atuais que perderam, EXCETO anon/authenticated; before/after comparado;
--      aborta se anon/authenticated retiverem USAGE efetivo por membership).
--      Sem USAGE de schema, objetos FUTUROS criados pela plataforma como
--      supabase_admin nascem com grants mas ficam INACESSIVEIS a anon/authenticated.
--   4) Correcao dos defaults do supabase_admin na ORIGEM: fora deste artefato
--      (BLOCKED_CAPABILITY_NON_BLOCKING — exige provider/Supabase Support).
--
-- service_role: NADA e revogado dele; USAGE re-grantado e ASSERT=true (Storage).
-- NAO e migration do Prisma. Idempotente no caminho feliz. ⚠️ SOMENTE STAGING.
--
-- COMO RODAR (staging-only):
--   node scripts/apply-rls-lockdown-v2.mjs           (wrapper com guard de conexao)
--   ou: psql "$STAGING_DIRECT_URL" --set ON_ERROR_STOP=1 \
--         -v staging_ref=qsuufuulxfkkeasgxhcv -f prisma/rls/lockdown_public_access_v2.sql
-- =============================================================================

\set ON_ERROR_STOP on

-- ── Guard de ambiente (identico ao v1) ────────────────────────────────────────
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
SET LOCAL statement_timeout = '120s';

-- ── Preflight: 26 tabelas presentes e SEM policies (identico ao v1) ───────────
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
    IF to_regclass(format('public.%I', t)) IS NULL THEN faltando := faltando || t; END IF;
  END LOOP;
  IF array_length(faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: tabelas esperadas ausentes em public: %', faltando;
  END IF;
  FOREACH t IN ARRAY modelos LOOP
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n > 0 THEN com_policy := com_policy || t; END IF;
  END LOOP;
  IF array_length(com_policy, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: policies preexistentes em % — PARE e decida', com_policy;
  END IF;
END $$;

-- ── SNAPSHOT do USAGE efetivo ANTES de qualquer mutacao (base do regrant) ─────
CREATE TEMP TABLE _v2_usage_antes ON COMMIT DROP AS
SELECT rolname,
       has_schema_privilege(rolname, 'public', 'USAGE') AS tinha_usage
FROM pg_roles;

-- ── PRIMARIO: REVOKE integral sobre objetos EXISTENTES (identico ao v1) ───────
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL ROUTINES  IN SCHEMA public FROM anon, authenticated, PUBLIC;

-- ── Privilegios de SCHEMA ─────────────────────────────────────────────────────
REVOKE ALL    ON SCHEMA public FROM anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ── DEFAULT PRIVILEGES dos criadores ADMINISTRAVEIS ───────────────────────────
-- Identico ao v1, EXCETO o tratamento de insufficient_privilege: a UNICA excecao
-- tolerada e supabase_admin (role de plataforma; authority inexistente no hosted).
-- Ela e REGISTRADA em detalhe (WARNING por default ACL perigosa) e o choke point
-- abaixo a torna inocua. QUALQUER OUTRO role nao-administravel => ROLLBACK.
DO $$
DECLARE
  r text;
  criadores text[];
  det record;
BEGIN
  SELECT array_agg(DISTINCT rol) INTO criadores FROM (
    SELECT pg_get_userbyid(c.relowner) AS rol
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')
    UNION
    SELECT pg_get_userbyid(p.proowner)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    UNION
    SELECT current_user
    UNION
    SELECT pg_get_userbyid(defaclrole)
      FROM pg_default_acl
      WHERE defaclnamespace = 0 OR defaclnamespace = 'public'::regnamespace
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
        IF r = 'supabase_admin' THEN
          -- Excecao UNICA tolerada (hard-assert). Registra cada default perigoso.
          RAISE WARNING 'STG-SEC-RLS-01 v2: EXCECAO tolerada — sem authority p/ ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin (role de plataforma). Defaults residuais abaixo ficam INOCUOS pelo choke point de USAGE; correcao na origem = provider (BLOCKED_CAPABILITY_NON_BLOCKING).';
          FOR det IN
            SELECT n.nspname AS ns, d.defaclobjtype AS tipo,
                   (aclexplode(d.defaclacl)).grantee::regrole::text AS grantee,
                   (aclexplode(d.defaclacl)).privilege_type AS priv
            FROM pg_default_acl d
            LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
            WHERE d.defaclrole = 'supabase_admin'::regrole
              AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace)
          LOOP
            IF det.grantee IN ('anon','authenticated') THEN
              RAISE WARNING 'STG-SEC-RLS-01 v2: default residual supabase_admin ns=% tipo=% grantee=% priv=%',
                COALESCE(det.ns, '(global)'), det.tipo, det.grantee, det.priv;
            END IF;
          END LOOP;
        ELSE
          RAISE EXCEPTION 'STG-SEC-RLS-01 v2: role NAO-administravel INESPERADO no ADP: % — abortado (so supabase_admin e excecao tolerada)', r;
        END IF;
    END;
  END LOOP;
END $$;

-- ── CHOKE POINT: USAGE do schema public deixa de ser herdavel por PUBLIC ──────
-- Sem USAGE, grant de objeto (atual OU futuro, inclusive nascido dos defaults de
-- supabase_admin) NAO da acesso: anon/authenticated nao resolvem nomes em public.
REVOKE USAGE ON SCHEMA public FROM PUBLIC;

-- Regrant ATOMICO: devolve o USAGE a todos os roles atuais que o perderam —
-- exceto anon/authenticated (alvos do boundary). Roles que retem por
-- ownership/superuser nao precisam de ACL redundante (has_schema_privilege cobre).
DO $$
DECLARE
  rec record;
  n int := 0;
BEGIN
  FOR rec IN
    SELECT a.rolname
    FROM _v2_usage_antes a
    WHERE a.tinha_usage
      AND a.rolname NOT IN ('anon','authenticated')
      AND NOT has_schema_privilege(a.rolname, 'public', 'USAGE')
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I;', rec.rolname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'STG-SEC-RLS-01 v2: USAGE re-grantado a % role(s) (todos os que perderam, exceto anon/authenticated).', n;

  -- ASSERT before/after: NENHUM role nao-alvo pode ter regredido.
  SELECT count(*) INTO n
  FROM _v2_usage_antes a
  WHERE a.tinha_usage
    AND a.rolname NOT IN ('anon','authenticated')
    AND NOT has_schema_privilege(a.rolname, 'public', 'USAGE');
  IF n <> 0 THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: % role(s) nao-alvo perderam USAGE apos regrant — abortado', n;
  END IF;

  -- ASSERTs explicitos dos roles criticos (guardados por existencia p/ portabilidade
  -- do harness local; no staging todos existem).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
     AND NOT has_schema_privilege('postgres', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: postgres sem USAGE — abortado';
  END IF;
  IF NOT has_schema_privilege(current_user, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: executor (%) sem USAGE — abortado', current_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
     AND NOT has_schema_privilege('service_role', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: service_role sem USAGE — abortado (Storage depende)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND NOT has_schema_privilege('supabase_admin', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: supabase_admin sem USAGE — abortado';
  END IF;

  -- ASSERT do alvo: anon/authenticated NAO podem reter USAGE efetivo (nem por
  -- membership). Se retiverem, ha membership inesperada => decisao nova (NAO
  -- alteramos memberships aqui).
  IF has_schema_privilege('anon', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: anon RETEM USAGE efetivo (membership?) — abortado, exige nova decisao';
  END IF;
  IF has_schema_privilege('authenticated', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'STG-SEC-RLS-01 v2: authenticated RETEM USAGE efetivo (membership?) — abortado, exige nova decisao';
  END IF;
END $$;

-- ── DEFESA EM PROFUNDIDADE + Advisor: ENABLE RLS (NO FORCE) nas 26 (id. v1) ───
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

NOTIFY pgrst, 'reload schema';

\echo '>> STG-SEC-RLS-01 v2 aplicado. Rode verify_lockdown_v2.sql + staging-rls-negative-control.mjs.'
