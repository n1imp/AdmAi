-- ============================================================================
-- RBAC + Painel do funcionário + Ponto (geo/selfie) + Aprovação de serviço (ADITIVO).
--   - Usuario: papel, permissoes (overrides), senhaProvisoria (PIN inicial).
--   - Empresa: aprovacaoServico (toggle da fila de aprovação).
--   - Servico: status, aprovadoPor, aprovadoEm (fila + auditoria de aprovação).
--   - BatidaPonto: prova por batida (hora do servidor + geolocalização + selfie).
-- Nada destrutivo: colunas nullable/defaultadas, tabela nova e backfill de papel.
-- ============================================================================

-- Usuario: RBAC (papel + overrides) + senha provisória (PIN inicial)
ALTER TABLE "Usuario" ADD COLUMN "papel" TEXT NOT NULL DEFAULT 'funcionario';
ALTER TABLE "Usuario" ADD COLUMN "permissoes" JSONB;
ALTER TABLE "Usuario" ADD COLUMN "senhaProvisoria" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: admins viram "dono"; usuários de painel pré-existentes viram "gestor"
-- (mantêm o acesso amplo que já tinham). Funcionário é o papel novo (contas de técnico).
UPDATE "Usuario" SET "papel" = 'dono' WHERE "admin" = true;
UPDATE "Usuario" SET "papel" = 'gestor' WHERE "admin" = false;

-- Empresa: toggle do fluxo de aprovação de serviço do funcionário
ALTER TABLE "Empresa" ADD COLUMN "aprovacaoServico" BOOLEAN NOT NULL DEFAULT false;

-- Servico: status + auditoria de aprovação
ALTER TABLE "Servico" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ativo';
ALTER TABLE "Servico" ADD COLUMN "aprovadoPor" INTEGER;
ALTER TABLE "Servico" ADD COLUMN "aprovadoEm" TIMESTAMP(3);
CREATE INDEX "Servico_empresaId_status_idx" ON "Servico"("empresaId", "status");

-- BatidaPonto: prova por batida (hora do servidor + geolocalização + selfie)
CREATE TABLE "BatidaPonto" (
    "id" SERIAL NOT NULL,
    "registroId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "precisao" DOUBLE PRECISION,
    "selfieUrl" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'painel',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BatidaPonto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BatidaPonto_registroId_idx" ON "BatidaPonto"("registroId");
ALTER TABLE "BatidaPonto" ADD CONSTRAINT "BatidaPonto_registroId_fkey"
  FOREIGN KEY ("registroId") REFERENCES "RegistroPonto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
