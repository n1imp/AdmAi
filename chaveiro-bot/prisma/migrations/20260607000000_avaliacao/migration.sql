-- ============================================================================
-- Fase 4: avaliação do cliente após conclusão do serviço.
-- Fila por due-time (agendadoPara) varrida pelo cron; aditivo (nova tabela).
-- ============================================================================

CREATE TABLE "Avaliacao" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "clienteTelefone" TEXT NOT NULL,
    "clienteNome" TEXT,
    "nota" INTEGER,
    "comentario" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "agendadoPara" TIMESTAMP(3) NOT NULL,
    "enviadoEm" TIMESTAMP(3),
    "respondidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Avaliacao_servicoId_key" ON "Avaliacao"("servicoId");
CREATE INDEX "Avaliacao_status_agendadoPara_idx" ON "Avaliacao"("status", "agendadoPara");
CREATE INDEX "Avaliacao_empresaId_idx" ON "Avaliacao"("empresaId");
CREATE INDEX "Avaliacao_clienteTelefone_status_idx" ON "Avaliacao"("clienteTelefone", "status");
