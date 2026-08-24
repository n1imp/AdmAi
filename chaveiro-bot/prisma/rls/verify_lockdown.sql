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
      -- [REVISOR F1] Grants por COLUNA sao separados do nivel-tabela — has_table_privilege
      -- nao os pega. Prova que nenhuma coluna sobrou concedida a anon/authenticated/PUBLIC.
      FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        IF has_any_column_privilege(grantee, rec.oid, priv) THEN
          falhas := falhas || format('%s tem %s por COLUNA em %s', grantee, priv, rec.relname);
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
DECLARE falhas text[] := '{}'; n_direto int;
BEGIN
  IF has_schema_privilege('public','public','CREATE') THEN falhas := falhas || 'PUBLIC CREATE schema'::text; END IF;
  -- [REVISOR F6] anon/authenticated nao podem ter grant DIRETO no schema (o lockdown os revoga).
  SELECT count(*) INTO n_direto FROM (
    SELECT (aclexplode(nspacl)).grantee::regrole::text g FROM pg_namespace WHERE nspname = 'public'
  ) x WHERE g IN ('anon','authenticated');
  IF n_direto > 0 THEN falhas := falhas || format('%s grant(s) DIRETO(s) de schema a anon/authenticated', n_direto); END IF;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'B2) schema: %', falhas; END IF;
  RAISE NOTICE 'B2) PASS — PUBLIC sem CREATE; anon/authenticated sem grant DIRETO de schema (USAGE via PUBLIC tolerado; sem acesso a objeto)';
END $$;

-- ── A2) POS-CONDICAO: zero policies nas 26 apos a aplicacao [REVISOR F6] ────────
-- O lockdown nao cria policies; confirma que segue zero (senao alguem as adicionou).
DO $$
DECLARE
  t text; com_policy text[] := '{}'; n int;
  modelos text[] := ARRAY[
    'Empresa','EmpresaWhatsapp','Tecnico','DocumentoTecnico','Servico','Material',
    'MovimentacaoEstoque','ServicoMaterial','Usuario','ContaSocial','Notificacao','Pagamento',
    'SessaoConversa','Avaliacao','ConexaoBot','RegistroPonto','BatidaPonto','GoogleConta',
    'AvaliacaoGoogle','AnaliseAvaliacoes','CodigoRecuperacaoTotp','Assinatura','ConviteUsuario',
    'SessaoUsuario','RefreshToken','AuditLog'
  ];
BEGIN
  FOREACH t IN ARRAY modelos LOOP
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    IF n > 0 THEN com_policy := com_policy || t; END IF;
  END LOOP;
  IF array_length(com_policy,1) IS NOT NULL THEN RAISE EXCEPTION 'A2) policies inesperadas nas 26: %', com_policy; END IF;
  RAISE NOTICE 'A2) PASS — zero policies nas 26 (RLS deny-all puro, como projetado)';
END $$;

-- ── C) Prova de DEFAULTS: novos objetos sem privilegio p/ anon/auth/PUBLIC ─────
-- Cria table/sequence/function nesta transacao (efemeros — rollback no fim) e prova,
-- por privilegio EFETIVO, que anon/authenticated/PUBLIC nao ganham NADA — inclusive
-- EXECUTE em function (residual FECHADO via ADP global [REVISOR F2]). Mais um check de
-- CATALOGO [REVISOR F3], escopado aos roles CRIADORES de DDL de public (evita falso
-- positivo de defaults internos do Supabase em outros contextos): nenhum default deles
-- concede a anon/authenticated, nem EXECUTE a PUBLIC em functions.
DO $$
DECLARE
  grantee text; grantees text[] := ARRAY['anon','authenticated','public'];
  falhas text[] := '{}';
  n_cat int;
BEGIN
  CREATE TABLE public._stg_sec_probe_tbl (id int);
  CREATE SEQUENCE public._stg_sec_probe_seq;
  CREATE FUNCTION public._stg_sec_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1';

  FOREACH grantee IN ARRAY grantees LOOP
    IF has_table_privilege(grantee, 'public._stg_sec_probe_tbl', 'SELECT') THEN
      falhas := falhas || format('%s SELECT na nova table', grantee); END IF;
    IF has_any_column_privilege(grantee, 'public._stg_sec_probe_tbl', 'SELECT') THEN
      falhas := falhas || format('%s SELECT por coluna na nova table', grantee); END IF;
    IF has_sequence_privilege(grantee, 'public._stg_sec_probe_seq', 'USAGE') THEN
      falhas := falhas || format('%s USAGE na nova sequence', grantee); END IF;
    IF has_function_privilege(grantee, 'public._stg_sec_probe_fn()', 'EXECUTE') THEN
      falhas := falhas || format('%s EXECUTE na nova function', grantee); END IF;
  END LOOP;

  -- Mesmo conjunto de criadores do lockdown (owners de public) e defaults SO globais(0)
  -- ou do schema public [REVISOR DELTA] — nao inspeciona defaults de outros schemas.
  SELECT count(*) INTO n_cat FROM (
    SELECT pg_get_userbyid(d.defaclrole) AS rol, (aclexplode(d.defaclacl)).grantee::regrole::text AS g, d.defaclobjtype AS t
    FROM pg_default_acl d
    WHERE d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace
  ) defs
  JOIN (
    -- MESMO conjunto de criadores do lockdown [REVISOR DELTA2]: owners de public +
    -- current_user + roles com default global(0)/public (governam DDL futura em public).
    SELECT pg_get_userbyid(c.relowner) AS rol FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
    UNION
    SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION
    SELECT current_user
    UNION
    SELECT pg_get_userbyid(defaclrole) FROM pg_default_acl WHERE defaclnamespace = 0 OR defaclnamespace = 'public'::regnamespace
  ) cr ON cr.rol = defs.rol
  WHERE defs.g IN ('anon','authenticated') OR (defs.g = 'public' AND defs.t = 'f');
  IF n_cat > 0 THEN
    falhas := falhas || format('%s default(s) de criadores de DDL concedendo a anon/authenticated ou PUBLIC-execute', n_cat);
  END IF;

  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'C) defaults nao neutralizados: %', falhas; END IF;
  RAISE NOTICE 'C) PASS — novos objetos sem privilegio efetivo p/ anon/authenticated/PUBLIC (inclui EXECUTE; residual FECHADO via ADP global)';
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
    -- EXECUTE da probe function (criada na parte C) — residual FECHADO via ADP global [REVISOR F2]
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); PERFORM public._stg_sec_probe_fn();
      falhas := falhas || format('%s EXECUTE probe_fn PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s EXECUTE erro nao-privilegio: %s', rl, SQLERRM); END;
  END LOOP;
  RESET ROLE;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'D) negative control: %', falhas; END IF;
  RAISE NOTICE 'D) PASS — anon/authenticated negados em SELECT(26)/INSERT/UPDATE/DELETE/EXECUTE em public';
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
