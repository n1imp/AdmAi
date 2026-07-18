-- =============================================================================
-- Row Level Security (RLS) — isolamento multi-tenant no BANCO (defesa em profundidade)
-- =============================================================================
--
-- Este script NÃO está na cadeia de migrations do Prisma de propósito: aplicá-lo
-- auto­maticamente no deploy poderia BRICAR produção. RLS é FAIL-CLOSED — sem o GUC
-- `app.empresa_id` setado, as policies retornam ZERO linhas. Aplique manualmente
-- (Supabase SQL editor ou psql) SOMENTE após o checklist abaixo, validado em staging.
--
-- PRÉ-REQUISITOS (ordem importa):
--   1. App em RLS_ENABLED=true em STAGING. O client escopado (src/db/tenant.js) passa
--      a cravar `set_config('app.empresa_id', <id>, true)` por transação. Confirme que
--      o painel inteiro funciona ANTES de mexer no banco.
--   2. Role de aplicação SEM BYPASSRLS (o role atual do Supabase bypassa RLS → ela seria
--      inócua). Veja "ROLE DEDICADO" no fim. O DATABASE_URL do runtime deve usar esse role.
--   3. Jobs CROSS-TENANT (agendador/expurgo LGPD, sync de avaliações, webhook inbound que
--      resolve a empresa pelo telefone) usam o `prisma` BASE, não o escopado — eles NÃO
--      setam o GUC. Sob RLS com role restrito eles parariam. Mantenha esses jobs numa
--      conexão com o role privilegiado (BYPASSRLS) OU ajuste-os para setar o GUC por
--      empresa. NÃO habilite em produção sem cobrir esse caminho.
--
-- Aplica em staging:  psql "$DATABASE_URL" -f prisma/rls/enable_rls.sql
-- Rollback:           ver bloco "DESFAZER" no fim deste arquivo.
-- =============================================================================

BEGIN;

-- Lê o tenant atual da sessão. O 2º arg `true` (missing_ok) faz devolver NULL quando o
-- GUC não foi setado, em vez de erro — e NULL casa com nenhuma linha (fail-closed).
-- (Inline nas policies abaixo; sem função para não exigir privilégio de criação.)

-- ── Tabelas com coluna empresaId direta ─────────────────────────────────────
-- FORCE faz a policy valer até para o DONO da tabela (o Prisma cria as tabelas como
-- owner; sem FORCE o owner ignoraria a RLS).
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'Tecnico', 'Servico', 'Material', 'Pagamento',
    'EmpresaWhatsapp', 'Avaliacao', 'RegistroPonto', 'DocumentoTecnico'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("empresaId" = current_setting('app.empresa_id', true)::int)
        WITH CHECK ("empresaId" = current_setting('app.empresa_id', true)::int);
    $f$, t);
  END LOOP;
END $$;

-- ── Tabelas isoladas pela RELAÇÃO com o pai (não têm empresaId próprio) ──────
-- A policy resolve o tenant via EXISTS no pai já escopado.

-- BatidaPonto → RegistroPonto.empresaId
ALTER TABLE "BatidaPonto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BatidaPonto" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BatidaPonto";
CREATE POLICY tenant_isolation ON "BatidaPonto"
  USING (EXISTS (
    SELECT 1 FROM "RegistroPonto" r
    WHERE r.id = "BatidaPonto"."registroId"
      AND r."empresaId" = current_setting('app.empresa_id', true)::int))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "RegistroPonto" r
    WHERE r.id = "BatidaPonto"."registroId"
      AND r."empresaId" = current_setting('app.empresa_id', true)::int));

-- MovimentacaoEstoque → Material.empresaId
ALTER TABLE "MovimentacaoEstoque" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovimentacaoEstoque" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MovimentacaoEstoque";
CREATE POLICY tenant_isolation ON "MovimentacaoEstoque"
  USING (EXISTS (
    SELECT 1 FROM "Material" m
    WHERE m.id = "MovimentacaoEstoque"."materialId"
      AND m."empresaId" = current_setting('app.empresa_id', true)::int))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Material" m
    WHERE m.id = "MovimentacaoEstoque"."materialId"
      AND m."empresaId" = current_setting('app.empresa_id', true)::int));

-- ServicoMaterial → Servico.empresaId
ALTER TABLE "ServicoMaterial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServicoMaterial" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServicoMaterial";
CREATE POLICY tenant_isolation ON "ServicoMaterial"
  USING (EXISTS (
    SELECT 1 FROM "Servico" s
    WHERE s.id = "ServicoMaterial"."servicoId"
      AND s."empresaId" = current_setting('app.empresa_id', true)::int))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Servico" s
    WHERE s.id = "ServicoMaterial"."servicoId"
      AND s."empresaId" = current_setting('app.empresa_id', true)::int));

-- Notificacao → Usuario.empresaId (o pai Usuario NÃO é RLS, mas tem empresaId)
ALTER TABLE "Notificacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacao" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Notificacao";
CREATE POLICY tenant_isolation ON "Notificacao"
  USING (EXISTS (
    SELECT 1 FROM "Usuario" u
    WHERE u.id = "Notificacao"."usuarioId"
      AND u."empresaId" = current_setting('app.empresa_id', true)::int))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Usuario" u
    WHERE u.id = "Notificacao"."usuarioId"
      AND u."empresaId" = current_setting('app.empresa_id', true)::int));

COMMIT;

-- ── DELIBERADAMENTE FORA DA RLS ─────────────────────────────────────────────
--   • Empresa, Usuario        → login/onboarding/admin precisam de lookup cross-tenant
--                               (por username/email/slug) com o client base + filtro
--                               explícito. RLS aqui quebraria a autenticação.
--   • SessaoConversa          → empresaId é NULLABLE (null durante a desambiguação do
--                               número único); o inbound resolve a empresa pelo telefone.
--                               RLS com igualdade excluiria as linhas null e quebraria o bot.
--   • GoogleConta/AvaliacaoGoogle/ContaSocial → acessadas por jobs cross-tenant; tratar
--                               junto com o caminho privilegiado dos jobs antes de incluir.

-- =============================================================================
-- ROLE DEDICADO (executar UMA vez; ajuste a senha e o schema conforme o ambiente)
-- =============================================================================
-- O role de runtime NÃO pode ter BYPASSRLS nem ser superuser, senão a RLS é ignorada.
--
--   CREATE ROLE app_rw LOGIN PASSWORD '<defina>' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
--   GRANT USAGE ON SCHEMA public TO app_rw;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
--
-- Depois aponte o DATABASE_URL do RUNTIME para app_rw. As MIGRATIONS continuam usando o
-- role privilegiado (owner), que aplica DDL e não sofre RLS.

-- =============================================================================
-- DESFAZER (rollback) — remove as policies e desliga a RLS de todas as tabelas acima
-- =============================================================================
--   DO $$
--   DECLARE t text;
--     tabelas text[] := ARRAY['Tecnico','Servico','Material','Pagamento','EmpresaWhatsapp',
--       'Avaliacao','RegistroPonto','DocumentoTecnico','BatidaPonto','MovimentacaoEstoque','ServicoMaterial','Notificacao'];
--   BEGIN
--     FOREACH t IN ARRAY tabelas LOOP
--       EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
--       EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY;', t);
--       EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', t);
--     END LOOP;
--   END $$;
