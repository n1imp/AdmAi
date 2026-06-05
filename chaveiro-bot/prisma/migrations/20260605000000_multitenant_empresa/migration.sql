-- ============================================================================
-- Migração Multi-Tenant: introduz Empresa e escopa todos os dados por empresaId.
-- Ordem segura (sem perda de dados, sem NOT NULL com valor nulo no meio):
--   1) cria Empresa + EmpresaWhatsapp
--   2) cria uma Empresa padrão e move os dados existentes para ela
--   3) adiciona empresaId (nullable) → backfill → NOT NULL
--   4) ajusta uniques globais para uniques por-empresa
--   5) adiciona FKs e índices
-- ============================================================================

-- 1) ── Tabelas de tenant ────────────────────────────────────────────────────
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

CREATE TABLE "EmpresaWhatsapp" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "instanceName" TEXT,
    "apiKeyEnc" TEXT,
    "numeroDisplay" TEXT,
    "estadoConexao" TEXT NOT NULL DEFAULT 'desconectado',
    "grupoJid" TEXT,
    "reviewDelayHoras" INTEGER NOT NULL DEFAULT 2,
    "reviewLink" TEXT,
    "webhookSecret" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmpresaWhatsapp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmpresaWhatsapp_empresaId_key" ON "EmpresaWhatsapp"("empresaId");
CREATE UNIQUE INDEX "EmpresaWhatsapp_instanceName_key" ON "EmpresaWhatsapp"("instanceName");

-- 2) ── Empresa padrão para abrigar os dados já existentes ───────────────────
INSERT INTO "Empresa" ("nome", "slug", "ativo")
VALUES ('Empresa Principal', 'empresa-principal', true);

-- 3) ── empresaId nullable → backfill → NOT NULL, por tabela ─────────────────

-- Usuario
ALTER TABLE "Usuario" ADD COLUMN "empresaId" INTEGER;
UPDATE "Usuario" SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "slug" = 'empresa-principal');
ALTER TABLE "Usuario" ALTER COLUMN "empresaId" SET NOT NULL;
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- Tecnico
ALTER TABLE "Tecnico" ADD COLUMN "empresaId" INTEGER;
UPDATE "Tecnico" SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "slug" = 'empresa-principal');
ALTER TABLE "Tecnico" ALTER COLUMN "empresaId" SET NOT NULL;
CREATE INDEX "Tecnico_empresaId_idx" ON "Tecnico"("empresaId");

-- Servico
ALTER TABLE "Servico" ADD COLUMN "empresaId" INTEGER;
UPDATE "Servico" SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "slug" = 'empresa-principal');
ALTER TABLE "Servico" ALTER COLUMN "empresaId" SET NOT NULL;
CREATE INDEX "Servico_empresaId_idx" ON "Servico"("empresaId");
CREATE INDEX "Servico_empresaId_criadoEm_idx" ON "Servico"("empresaId", "criadoEm");

-- Material
ALTER TABLE "Material" ADD COLUMN "empresaId" INTEGER;
UPDATE "Material" SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "slug" = 'empresa-principal');
ALTER TABLE "Material" ALTER COLUMN "empresaId" SET NOT NULL;
CREATE INDEX "Material_empresaId_idx" ON "Material"("empresaId");

-- Pagamento
ALTER TABLE "Pagamento" ADD COLUMN "empresaId" INTEGER;
UPDATE "Pagamento" SET "empresaId" = (SELECT "id" FROM "Empresa" WHERE "slug" = 'empresa-principal');
ALTER TABLE "Pagamento" ALTER COLUMN "empresaId" SET NOT NULL;
CREATE INDEX "Pagamento_empresaId_idx" ON "Pagamento"("empresaId");

-- 4) ── Uniques globais → uniques por-empresa ────────────────────────────────
-- Tecnico.telefone era @unique global; passa a ser único por empresa.
ALTER TABLE "Tecnico" DROP CONSTRAINT IF EXISTS "Tecnico_telefone_key";
CREATE UNIQUE INDEX "Tecnico_empresaId_telefone_key" ON "Tecnico"("empresaId", "telefone");

-- Material.nome era @unique global; passa a ser único por empresa.
ALTER TABLE "Material" DROP CONSTRAINT IF EXISTS "Material_nome_key";
CREATE UNIQUE INDEX "Material_empresaId_nome_key" ON "Material"("empresaId", "nome");

-- 5) ── Foreign keys ─────────────────────────────────────────────────────────
ALTER TABLE "EmpresaWhatsapp" ADD CONSTRAINT "EmpresaWhatsapp_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tecnico" ADD CONSTRAINT "Tecnico_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Servico" ADD CONSTRAINT "Servico_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Material" ADD CONSTRAINT "Material_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_empresaId_fkey"
    FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
