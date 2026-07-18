-- F9/M3: serviço em andamento ("serviço atual" do funcionário).
-- Aditiva e reversível: duas colunas de timestamp NULL + índice de busca por técnico.
-- Nenhum registro existente é alterado; o novo status "em_andamento" só é usado quando a
-- flag SERVICO_ANDAMENTO_ENABLED está ligada (default off).

-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "finalizadoEm" TIMESTAMP(3),
ADD COLUMN     "iniciadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Servico_tecnicoId_status_idx" ON "Servico"("tecnicoId", "status");
