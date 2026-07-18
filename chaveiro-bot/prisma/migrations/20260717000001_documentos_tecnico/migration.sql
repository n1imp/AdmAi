-- F9/M4: documentos do técnico (contrato, RG, CNH…) em bucket privado.
-- Tabela nova, escopada por empresaId (tenant) — ver src/db/tenant.js e enable_rls.sql.
-- Aditiva: não altera tabelas existentes. FK do técnico com ON DELETE CASCADE (documento
-- sem técnico não faz sentido). Só usada quando a flag DOCUMENTOS_ENABLED está ligada.

-- CreateTable
CREATE TABLE "DocumentoTecnico" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoTecnico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoTecnico_empresaId_tecnicoId_idx" ON "DocumentoTecnico"("empresaId", "tecnicoId");

-- AddForeignKey
ALTER TABLE "DocumentoTecnico" ADD CONSTRAINT "DocumentoTecnico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoTecnico" ADD CONSTRAINT "DocumentoTecnico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
