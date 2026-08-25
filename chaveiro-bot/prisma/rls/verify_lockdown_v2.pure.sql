-- =============================================================================
-- STG-SEC-RLS-01 — Verify v2 (A-G) · PURE_SQL_EXECUTION_FORM (executor externo / Supabase API)
-- =============================================================================
-- DERIVADO de: chaveiro-bot/prisma/rls/verify_lockdown_v2.sql
--   SHA-256 (blob git LF) da fonte: 74f3e565a030cca50f222e49ea57c9f2c69189f71063573a0fab4417a2070f3f
--   fonte aprovada em c61ca07 (Codex REVISOR DELTA-2 APROVADO, thread 01a03654).
-- REGRA DE DERIVACAO (deterministica, SEM edicao manual do corpo):
--   remover SOMENTE linhas de meta-comando psql (apos trim comecam com backslash: \set \echo).
--   MANTIDOS byte-a-byte: BEGIN, ROLLBACK e todo o corpo A/A2/B/B2v2/C/D/E/F/G.
--   Prova de equivalencia: corpo-derivado == nao-meta(fonte), byte-a-byte.
--
--   MUTATES_DB: NO — tudo dentro de BEGIN...ROLLBACK; nada persiste (nem os probes/canarios).
--   APLICAR COMO UM UNICO BATCH/SESSAO. Falha em qualquer controle A-G => a transacao inteira
--   e revertida (teardown garantido pelo ROLLBACK final / erro).
--   Contrato A-G detalhado em docs/eos-v2/ADMAI_REAL_STAGING_COMPLETION_HANDOFF.md (VERIFY_V2_CONTRACT).
-- =============================================================================
-- === CORPO DERIVADO ABAIXO (nao editar; regenerar pela regra da derivacao) ===
-- =============================================================================
-- STG-SEC-RLS-01 — Verificacao v2 + negative controls (STAGING, nao-mutante)
-- =============================================================================
-- Prova as pos-condicoes do lockdown_public_access_v2.sql (D1 thread 01a035ce).
-- TUDO dentro de BEGIN...ROLLBACK. Fail-fast sob ON_ERROR_STOP.
--
--   psql "$STAGING_DIRECT_URL" --set ON_ERROR_STOP=1 -f prisma/rls/verify_lockdown_v2.sql
--
-- Grupos: A RLS flags · A2 zero policies · B privilegio efetivo zero (objetos/colunas/
-- sequences/routines) · B2v2 USAGE do schema (choke point) · C defaults c/ excecao unica
-- supabase_admin · D negative controls SET LOCAL ROLE · E RLS deny-all c/ grant ·
-- F CANARIO adversarial do choke point (prova vinculante do D1 v2) · G detector de baseline.
-- =============================================================================

BEGIN;

-- ── A) RLS: 26/26 rowsecurity=on, forcerowsecurity=off ────────────────────────
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
    IF force IS DISTINCT FROM false THEN falhas := falhas || format('%s: FORCE on', t); END IF;
  END LOOP;
  IF array_length(falhas, 1) IS NOT NULL THEN RAISE EXCEPTION 'A) RLS flags: %', falhas; END IF;
  RAISE NOTICE 'A) PASS — 26/26 RLS on, FORCE off';
END $$;

-- ── A2) zero policies nas 26 ──────────────────────────────────────────────────
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
  IF array_length(com_policy,1) IS NOT NULL THEN RAISE EXCEPTION 'A2) policies inesperadas: %', com_policy; END IF;
  RAISE NOTICE 'A2) PASS — zero policies nas 26';
END $$;

-- ── B) Privilegio EFETIVO zero em objetos atuais (tabela+COLUNA+seq+routine) ──
DO $$
DECLARE
  grantee text; grantees text[] := ARRAY['anon','authenticated','public'];
  rec record; priv text;
  privs text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  falhas text[] := '{}';
BEGIN
  FOREACH grantee IN ARRAY grantees LOOP
    FOR rec IN
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    LOOP
      FOREACH priv IN ARRAY privs LOOP
        IF has_table_privilege(grantee, rec.oid, priv) THEN
          falhas := falhas || format('%s tem %s em %s', grantee, priv, rec.relname); END IF;
      END LOOP;
      FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
        IF has_any_column_privilege(grantee, rec.oid, priv) THEN
          falhas := falhas || format('%s tem %s por COLUNA em %s', grantee, priv, rec.relname); END IF;
      END LOOP;
    END LOOP;
    FOR rec IN
      SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relkind='S'
    LOOP
      IF has_sequence_privilege(grantee, rec.oid, 'SELECT')
        OR has_sequence_privilege(grantee, rec.oid, 'USAGE')
        OR has_sequence_privilege(grantee, rec.oid, 'UPDATE') THEN
        falhas := falhas || format('%s tem priv em sequence %s', grantee, rec.relname); END IF;
    END LOOP;
    FOR rec IN
      SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'
    LOOP
      IF has_function_privilege(grantee, rec.oid, 'EXECUTE') THEN
        falhas := falhas || format('%s tem EXECUTE em %s', grantee, rec.proname); END IF;
    END LOOP;
  END LOOP;
  IF array_length(falhas, 1) IS NOT NULL THEN RAISE EXCEPTION 'B) residuais: %', falhas; END IF;
  RAISE NOTICE 'B) PASS — anon/authenticated/PUBLIC sem privilegio efetivo em public';
END $$;

-- ── B2v2) CHOKE POINT: USAGE do schema ────────────────────────────────────────
-- PUBLIC sem USAGE e sem CREATE; anon/authenticated sem USAGE EFETIVO; roles
-- criticos (postgres, service_role, supabase_admin quando existirem) COM USAGE.
DO $$
DECLARE falhas text[] := '{}';
BEGIN
  IF has_schema_privilege('public','public','USAGE')  THEN falhas := falhas || 'PUBLIC USAGE schema'::text; END IF;
  IF has_schema_privilege('public','public','CREATE') THEN falhas := falhas || 'PUBLIC CREATE schema'::text; END IF;
  IF has_schema_privilege('anon','public','USAGE')          THEN falhas := falhas || 'anon USAGE efetivo'::text; END IF;
  IF has_schema_privilege('authenticated','public','USAGE') THEN falhas := falhas || 'authenticated USAGE efetivo'::text; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres')
     AND NOT has_schema_privilege('postgres','public','USAGE') THEN falhas := falhas || 'postgres SEM USAGE'::text; END IF;
  IF NOT has_schema_privilege(current_user,'public','USAGE') THEN falhas := falhas || 'executor SEM USAGE'::text; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
     AND NOT has_schema_privilege('service_role','public','USAGE') THEN
    falhas := falhas || 'service_role SEM USAGE'::text; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin')
     AND NOT has_schema_privilege('supabase_admin','public','USAGE') THEN
    falhas := falhas || 'supabase_admin SEM USAGE'::text; END IF;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'B2v2) choke point: %', falhas; END IF;
  RAISE NOTICE 'B2v2) PASS — PUBLIC/anon/authenticated sem USAGE; postgres/service_role/supabase_admin com USAGE';
END $$;

-- ── C) DEFAULTS: novos objetos do executor limpos + catalogo com excecao UNICA ─
DO $$
DECLARE
  grantee text; grantees text[] := ARRAY['anon','authenticated','public'];
  falhas text[] := '{}';
  rec record;
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

  -- Catalogo de defaults global(0)/public que ainda concedam a anon/authenticated
  -- ou ao pseudo-grantee PUBLIC [REVISOR v2 achado 2: OID 0 = PUBLIC nao aparecia
  -- no cast ::regrole — normalizado explicitamente; PUBLIC e herdado por TODOS os
  -- roles, entao default p/ PUBLIC e tao perigoso quanto p/ anon]. A UNICA origem
  -- tolerada e supabase_admin (WARNING detalhado, nunca silencioso).
  FOR rec IN
    SELECT pg_get_userbyid(d.defaclrole) AS rol,
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS g,
           d.defaclobjtype AS t,
           a.privilege_type AS priv
    FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace = 0 OR d.defaclnamespace = 'public'::regnamespace
  LOOP
    IF rec.g IN ('anon','authenticated','PUBLIC') THEN
      IF rec.rol = 'supabase_admin' THEN
        RAISE WARNING 'C) EXCECAO tolerada (choke point neutraliza): default de supabase_admin tipo=% grantee=% priv=%', rec.t, rec.g, rec.priv;
      ELSE
        falhas := falhas || format('default de %s concede %s a %s (tipo %s) — NAO tolerado', rec.rol, rec.priv, rec.g, rec.t);
      END IF;
    END IF;
  END LOOP;

  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'C) defaults: %', falhas; END IF;
  RAISE NOTICE 'C) PASS — novos objetos do executor limpos; unica excecao de catalogo = supabase_admin (neutralizada pelo choke point)';
END $$;

-- ── D) Negative controls comportamentais (SET LOCAL ROLE) ─────────────────────
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
  FOREACH rl IN ARRAY roles LOOP
    FOREACH t IN ARRAY modelos LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rl);
        EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', t);
        falhas := falhas || format('%s SELECT %s PERMITIDO', rl, t);
        RESET ROLE;
      EXCEPTION
        WHEN insufficient_privilege THEN NULL;
        WHEN OTHERS THEN falhas := falhas || format('%s SELECT %s erro nao-privilegio: %s', rl, t, SQLERRM);
      END;
    END LOOP;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'INSERT INTO public."Usuario" DEFAULT VALUES';
      falhas := falhas || format('%s INSERT PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s INSERT erro: %s', rl, SQLERRM); END;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'UPDATE public."Usuario" SET id = id WHERE id = -999999';
      falhas := falhas || format('%s UPDATE PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s UPDATE erro: %s', rl, SQLERRM); END;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); EXECUTE 'DELETE FROM public."Usuario" WHERE id = -999999';
      falhas := falhas || format('%s DELETE PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s DELETE erro: %s', rl, SQLERRM); END;
    BEGIN EXECUTE format('SET LOCAL ROLE %I', rl); PERFORM public._stg_sec_probe_fn();
      falhas := falhas || format('%s EXECUTE PERMITIDO', rl); RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN OTHERS THEN falhas := falhas || format('%s EXECUTE erro: %s', rl, SQLERRM); END;
  END LOOP;
  RESET ROLE;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'D) negative control: %', falhas; END IF;
  RAISE NOTICE 'D) PASS — anon/authenticated negados em SELECT(26)/INSERT/UPDATE/DELETE/EXECUTE';
END $$;

-- ── E) RLS deny-all independente do grant (canario proprio, NAO-VACUO) ────────
-- [REVISOR v2 achado 5] Provar com "Usuario" era vacuo se a tabela estivesse vazia
-- (0 == 0 com ou sem RLS). Canario proprio com 1 linha CONHECIDA: dono ve 1; anon,
-- MESMO com grant de objeto + USAGE de schema, ve 0 (RLS sem policy = deny-all).
DO $$
DECLARE n int;
BEGIN
  CREATE TABLE public._stg_rls_canario_tbl (id int);
  INSERT INTO public._stg_rls_canario_tbl VALUES (1);
  ALTER TABLE public._stg_rls_canario_tbl ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public._stg_rls_canario_tbl NO FORCE ROW LEVEL SECURITY;
  -- Controle positivo do dado: o dono (bypassa RLS por ownership/NO FORCE) ve a linha.
  SELECT count(*) INTO n FROM public._stg_rls_canario_tbl;
  IF n <> 1 THEN RAISE EXCEPTION 'E) setup invalido: dono deveria ver 1 linha, viu %', n; END IF;

  GRANT USAGE ON SCHEMA public TO anon;                       -- efemero (revogado abaixo)
  GRANT SELECT ON public._stg_rls_canario_tbl TO anon;        -- efemero (revogado abaixo)
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public._stg_rls_canario_tbl' INTO n;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'E) RLS nao barrou com grant+usage presentes: anon viu % linha(s) de 1', n; END IF;

  /* LIMPEZA EXPLICITA: os grants "efemeros" desta parte so seriam desfeitos no ROLLBACK
     FINAL — e a parte F roda DEPOIS, na MESMA transacao. Sem revogar aqui, o USAGE
     concedido para o teste E vazava para F e o canario de F "passava" a ser acessivel
     (defeito real pego pela validacao local do harness). */
  REVOKE SELECT ON public._stg_rls_canario_tbl FROM anon;
  REVOKE USAGE ON SCHEMA public FROM anon;
  IF has_schema_privilege('anon','public','USAGE') THEN
    RAISE EXCEPTION 'E) limpeza falhou: anon ainda com USAGE — abortado';
  END IF;
  RAISE NOTICE 'E) PASS — dono ve 1; anon com grant+usage ve 0 (RLS deny-all NAO-VACUO); grants efemeros revogados';
END $$;

-- ── F) CANARIO ADVERSARIAL do choke point (prova vinculante do D1 v2) ─────────
-- Reproduz a PIOR condicao que os defaults de supabase_admin criariam: objeto novo
-- em public com grants MAXIMOS deliberados a anon/authenticated/PUBLIC e RLS OFF.
-- A prova: os grants EXISTEM (has_*_privilege = true) e MESMO ASSIM o acesso e
-- negado (42501) exclusivamente pela falta de USAGE no schema.
DO $$
DECLARE
  rl text; roles text[] := ARRAY['anon','authenticated'];
  falhas text[] := '{}';
  ok boolean;
BEGIN
  CREATE TABLE public._stg_canario_tbl (id int);
  INSERT INTO public._stg_canario_tbl VALUES (1);
  CREATE SEQUENCE public._stg_canario_seq;
  CREATE FUNCTION public._stg_canario_fn() RETURNS int LANGUAGE sql AS 'SELECT 42';
  GRANT ALL PRIVILEGES ON public._stg_canario_tbl TO anon, authenticated, PUBLIC;
  GRANT ALL PRIVILEGES ON SEQUENCE public._stg_canario_seq TO anon, authenticated, PUBLIC;
  GRANT EXECUTE ON FUNCTION public._stg_canario_fn() TO anon, authenticated, PUBLIC;

  -- Grants de OBJETO existem de fato:
  IF NOT has_table_privilege('anon','public._stg_canario_tbl','SELECT') THEN
    RAISE EXCEPTION 'F) setup invalido: grant de objeto nao registrou'; END IF;

  -- ...e mesmo assim o acesso e negado (sem USAGE de schema):
  FOREACH rl IN ARRAY roles LOOP
    ok := false;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', rl);
      EXECUTE 'SELECT * FROM public._stg_canario_tbl';
      RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN ok := true;
              WHEN OTHERS THEN falhas := falhas || format('F) %s tabela erro inesperado: %s', rl, SQLERRM);
    END;
    IF NOT ok THEN falhas := falhas || format('F) %s ACESSOU canario-tabela apesar do choke point', rl); END IF;

    ok := false;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', rl);
      EXECUTE 'SELECT nextval(''public._stg_canario_seq'')';
      RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN ok := true;
              WHEN OTHERS THEN falhas := falhas || format('F) %s sequence erro inesperado: %s', rl, SQLERRM);
    END;
    IF NOT ok THEN falhas := falhas || format('F) %s ACESSOU canario-sequence', rl); END IF;

    ok := false;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', rl);
      PERFORM public._stg_canario_fn();
      RESET ROLE;
    EXCEPTION WHEN insufficient_privilege THEN ok := true;
              WHEN OTHERS THEN falhas := falhas || format('F) %s function erro inesperado: %s', rl, SQLERRM);
    END;
    IF NOT ok THEN falhas := falhas || format('F) %s EXECUTOU canario-function', rl); END IF;
  END LOOP;
  RESET ROLE;
  IF array_length(falhas,1) IS NOT NULL THEN RAISE EXCEPTION 'F) canario: %', falhas; END IF;
  RAISE NOTICE 'F) PASS — canario com grants MAXIMOS deliberados permanece inacessivel (42501 por falta de USAGE): exposicao futura via defaults de supabase_admin NEUTRALIZADA';
END $$;

-- ── G) Detector de baseline: inventario COMPLETO de public == baseline ────────
-- [REVISOR v2 achado 1] Prova nos DOIS sentidos e para TODAS as relkinds visiveis
-- (r/p/v/m/f): (a) toda relacao da baseline PRESENTE; (b) NENHUMA relacao fora da
-- baseline — a isencao e EXATA (so as probes nomeadas desta transacao + temp),
-- nunca um prefixo aberto. Rodar apos migration/extension/feature e antes de release.
DO $$
DECLARE
  rec record; t text;
  inesperadas text[] := '{}'; ausentes text[] := '{}';
  baseline text[] := ARRAY[
    'Empresa','EmpresaWhatsapp','Tecnico','DocumentoTecnico','Servico','Material',
    'MovimentacaoEstoque','ServicoMaterial','Usuario','ContaSocial','Notificacao','Pagamento',
    'SessaoConversa','Avaliacao','ConexaoBot','RegistroPonto','BatidaPonto','GoogleConta',
    'AvaliacaoGoogle','AnaliseAvaliacoes','CodigoRecuperacaoTotp','Assinatura','ConviteUsuario',
    'SessaoUsuario','RefreshToken','AuditLog','_prisma_migrations'
  ];
  probes text[] := ARRAY['_stg_sec_probe_tbl','_stg_sec_probe_seq','_stg_canario_tbl',
                         '_stg_canario_seq','_stg_rls_canario_tbl'];
BEGIN
  -- (a) presenca: toda a baseline precisa existir COMO TABELA (relkind r/p) —
  -- [REVISOR DELTA] to_regclass sozinho aceitaria view/indice homonimo, que depois
  -- escaparia dos excedentes por constar da baseline.
  FOREACH t IN ARRAY baseline LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind IN ('r','p')
    ) THEN ausentes := ausentes || t; END IF;
  END LOOP;
  IF array_length(ausentes,1) IS NOT NULL THEN
    RAISE EXCEPTION 'G) baseline INCOMPLETA em public (ausentes): %', ausentes;
  END IF;
  -- (b) excedentes: qualquer relacao visivel fora da baseline (exceto as probes
  -- EXATAS desta transacao e objetos temporarios) => FAIL.
  FOR rec IN
    SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      AND c.relname <> ALL (baseline)
      AND c.relname <> ALL (probes)
      AND c.relpersistence <> 't'
  LOOP
    inesperadas := inesperadas || format('%s(%s)', rec.relname, rec.relkind);
  END LOOP;
  IF array_length(inesperadas,1) IS NOT NULL THEN
    RAISE EXCEPTION 'G) relacoes FORA da baseline em public (revisar antes de aceitar): %', inesperadas;
  END IF;
  RAISE NOTICE 'G) PASS — inventario completo de public (r/p/v/m/f) == baseline (26 + _prisma_migrations), presenca e excedentes provados';
END $$;

ROLLBACK;
