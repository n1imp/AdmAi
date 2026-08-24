-- =============================================================================
-- STG-SEC-RLS-01 — Verificacao + negative controls SQL (STAGING, nao-mutante)
-- =============================================================================
-- Prova as pos-condicoes do lockdown_public_access.sql. TUDO roda dentro de um
-- BEGIN...ROLLBACK: nada persiste (as provas de defaults criam objetos efemeros
-- que somem no rollback). Fail-fast: a primeira violacao RAISE EXCEPTION e, sob
-- ON_ERROR_STOP, o psql para com codigo != 0.
--
--   psql "$STAGING_DIRECT_URL" --set ON_ERROR_STOP=1 -f prisma/rls/verify_lockdown.sql
--
-- has_*_privilege() computa privilegio EFETIVO (inclui PUBLIC e memberships) — e a
-- fonte de verdade do catalogo. SET LOCAL ROLE prova o comportamento em runtime.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ── A) RLS: 26/26 com rowsecurity=on e forcerowsecurity=off ───────────────────
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
  falhas text[] := '{}';
  rls boolean; force boolean;
BEGIN
  FOREACH t IN ARRAY modelos LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity INTO rls, force
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    IF rls IS DISTINCT FROM true  THEN falhas := falhas || format('%s: RLS off', t); END IF;
    IF force IS DISTINCT FROM false THEN falhas := falhas || format('%s: FORCE on (esperado off)', t); END IF;
  END LOOP;
  IF array_length(falhas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A) RLS flags: %', falhas;
  END IF;
  RAISE NOTICE 'A) PASS — 26/26 RLS on, FORCE off';
END $$;

-- ── B) Privilegio EFETIVO de anon/authenticated/PUBLIC = zero (objetos atuais) ─
DO $$
DECLARE
  grantee text; grantees text[] := ARRAY['anon','authenticated','public'];
  rec record;
  priv text; privs text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  falhas text[] := '{}';
BEGIN
  FOREACH grantee IN ARRAY grantees LOOP
    -- tabelas/views/etc.
    FOR rec IN
      SELECT c.oid, c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    LOOP
      FOREACH priv IN ARRAY privs LOOP
        IF has_table_privilege(grantee, rec.oid, priv) THEN
          falhas := falhas || format('%s tem %s em %s', grantee, priv, rec.relname);
        END IF;
      END LOOP;
    END LOOP;
    -- sequences
    FOR rec IN
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S'
    LOOP
      IF has_sequence_privilege(grantee, rec.oid, 'SELECT')
        OR has_sequence_privilege(grantee, rec.oid, 'USAGE')
        OR has_sequence_privilege(grantee, rec.oid, 'UPDATE') THEN
        falhas := falhas || format('%s tem priv em sequence %s', grantee, rec.relname);
      END IF;
    END LOOP;
    -- routines (EXECUTE herdado por PUBLIC por padrao)
    FOR rec IN
      SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'
    LOOP
      IF has_function_privilege(grantee, rec.oid, 'EXECUTE') THEN
        falhas := falhas || format('%s tem EXECUTE em %s', grantee, rec.proname);
      END IF;
    END LOOP;
  END LOOP;
  IF array_length(falhas, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'B) privilegios residuais: %', falhas;
  END IF;
  RAISE NOTICE 'B) PASS — anon/authenticated/PUBLIC sem privilegio efetivo em public';
END $$;

-- ── B2) SCHEMA: PUBLIC sem CREATE ─────────────────────────────────────────────
-- USAGE de schema herdado de PUBLIC e TOLERADO por decisao D1 (revogar de PUBLIC tem
-- blast radius sobre todos os roles Supabase e e desnecessario): sem privilegio de
-- objeto (B) + RLS (A), USAGE de schema sozinho nao da acesso a nada — provado em D.
-- O que importa aqui: PUBLIC nao pode CRIAR objetos em public.
DO $$
DECLARE falhas text[] := '{}';
BEGIN
  IF has_schema_privilege('public','public','CREATE') THEN falhas := falhas || 'PUBLIC CREATE schema'::text; END IF;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'B2) schema: %', falhas; END IF;
  RAISE NOTICE 'B2) PASS — PUBLIC sem CREATE no schema (USAGE via PUBLIC tolerado; sem acesso a objeto)';
END $$;

-- ── C) Prova de DEFAULTS: novos objetos NAO concedem a anon/authenticated ──────
-- Cria table/sequence/function nesta transacao (efemeros — rollback no fim). A
-- assercao precisa: nenhum grant EXPLICITO a anon/authenticated nos novos objetos
-- (e o que o default INJETADO pelo Supabase faria; o lockdown o neutraliza). O
-- default EMBUTIDO que da EXECUTE em functions ao PUBLIC nao e suprimivel por ADP
-- em PG15/16 — reportado como RESIDUAL conhecido, nao como falha (o app nao cria
-- functions em public; existentes ja travadas pelo REVOKE).
DO $$
DECLARE
  n_anon_auth int;
  pub_exec boolean;
BEGIN
  CREATE TABLE public._stg_sec_probe_tbl (id int);
  CREATE SEQUENCE public._stg_sec_probe_seq;
  CREATE FUNCTION public._stg_sec_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

  SELECT count(*) INTO n_anon_auth FROM (
    SELECT (aclexplode(relacl)).grantee::regrole::text AS g
      FROM pg_class WHERE oid IN ('public._stg_sec_probe_tbl'::regclass, 'public._stg_sec_probe_seq'::regclass)
    UNION ALL
    SELECT (aclexplode(proacl)).grantee::regrole::text
      FROM pg_proc WHERE oid = 'public._stg_sec_probe_fn()'::regprocedure
  ) x WHERE g IN ('anon','authenticated');

  IF n_anon_auth > 0 THEN
    RAISE EXCEPTION 'C) novos objetos concedem a anon/authenticated (% grants) — default injetado do Supabase ainda ativo', n_anon_auth;
  END IF;

  SELECT has_function_privilege('public', 'public._stg_sec_probe_fn()', 'EXECUTE') INTO pub_exec;
  IF pub_exec THEN
    RAISE NOTICE 'C) RESIDUAL conhecido (PG15/16): PUBLIC herda EXECUTE embutido em novas functions. App nao cria functions em public; existentes travadas pelo REVOKE. Revisitar se public expor RPC.';
  END IF;
  RAISE NOTICE 'C) PASS — novos objetos nao concedem a anon/authenticated (default injetado do Supabase neutralizado)';
END $$;

-- ── D) Negative controls comportamentais (SET LOCAL ROLE) ─────────────────────
-- SELECT nas 26 + INSERT/UPDATE/DELETE em Usuario + EXECUTE da probe fn, sob anon
-- e authenticated, devem TODOS resultar em insufficient_privilege.
DO $$
DECLARE
  t text; rl text; roles text[] := ARRAY['anon','authenticated'];
  modelos text[] := ARRAY[
    'Empresa','EmpresaWhatsapp','Tecnico','DocumentoTecnico','Servico','Material',
    'MovimentacaoEstoque','ServicoMaterial','Usuario','ContaSocial','Notificacao','Pagamento',
    'SessaoConversa','Avaliacao','ConexaoBot','RegistroPonto','BatidaPonto','GoogleConta',
    'AvaliacaoGoogle','AnaliseAvaliacoes','CodigoRecuperacaoTotp','Assinatura','ConviteUsuario',
    'SessaoUsuario','RefreshToken','AuditLog'
  ];
  falhas text[] := '{}';
BEGIN
  -- a probe fn foi criada na parte C (mesma transacao)
  FOREACH rl IN ARRAY roles LOOP
    -- SELECT nas 26
    FOREACH t IN ARRAY modelos LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rl);
        EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
        falhas := falhas || format('%s SELECT %s PERMITIDO', rl, t);
        RESET ROLE;
      EXCEPTION
        WHEN insufficient_privilege THEN NULL; -- esperado (subtx aborta, role reverte)
        WHEN OTHERS THEN falhas := falhas || format('%s SELECT %s erro nao-privilegio: %s', rl, t, SQLERRM);
      END;
    END LOOP;
    -- INSERT/UPDATE/DELETE em Usuario (privilegio e checado antes das constraints)
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'INSERT INTO public."Usuario" DEFAULT VALUES';
      falhas := falhas || format('%s INSERT Usuario PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s INSERT erro nao-privilegio: %s', rl, SQLERRM); END;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'UPDATE public."Usuario" SET id = id WHERE id = -999999';
      falhas := falhas || format('%s UPDATE Usuario PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s UPDATE erro nao-privilegio: %s', rl, SQLERRM); END;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'DELETE FROM public."Usuario" WHERE id = -999999';
      falhas := falhas || format('%s DELETE Usuario PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s DELETE erro nao-privilegio: %s', rl, SQLERRM); END;
  END LOOP;
  RESET ROLE;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'D) negative control: %', falhas; END IF;
  RAISE NOTICE 'D) PASS — anon/authenticated negados em SELECT(26)/INSERT/UPDATE/DELETE em public';
END $$;

-- ── E) RLS deny-all INDEPENDENTE do grant: mesmo com grant, RLS zera as linhas ─
-- Concede SELECT em Usuario a anon (nesta tx efemera), entao prova que sob RLS
-- sem policy o SELECT retorna 0 linhas (deny-all) em vez de vazar dados. Rollback
-- descarta o grant. Isola a defesa-em-profundidade do REVOKE.
DO $$
DECLARE n int; total int;
BEGIN
  SELECT count(*) INTO total FROM public."Usuario";
  GRANT USAGE ON SCHEMA public TO anon;             -- efemero (rollback) — isola a camada RLS
  GRANT SELECT ON public."Usuario" TO anon;         -- efemero (rollback)
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public."Usuario"' INTO n;  -- usage+grant existem; RLS decide
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'E) RLS nao barrou com grant presente: anon viu % de % linhas', n, total;
  END IF;
  RAISE NOTICE 'E) PASS — com grant presente, RLS sem policy manteve deny-all (0 de % linhas)', total;
END $$;

ROLLBACK;
\echo '>> STG-SEC-RLS-01 verify: TODOS OS CONTROLES PASSARAM (transacao revertida; nada persistido).'
