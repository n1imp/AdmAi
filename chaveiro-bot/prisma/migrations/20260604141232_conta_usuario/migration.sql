/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Usuario` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "fotoEvidencia" TEXT;

-- AlterTable
ALTER TABLE "Tecnico" ADD COLUMN     "metaMensal" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailVerificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senhaAlteradaEm" TIMESTAMP(3),
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "telefoneVerificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tokenValidoApos" TIMESTAMP(3),
ADD COLUMN     "twoFactorAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateIndex
CREATE INDEX "Servico_tecnicoId_idx" ON "Servico"("tecnicoId");

-- CreateIndex
CREATE INDEX "Servico_criadoEm_idx" ON "Servico"("criadoEm");

-- CreateIndex
CREATE INDEX "Servico_local_idx" ON "Servico"("local");

-- CreateIndex
CREATE INDEX "Servico_endereco_idx" ON "Servico"("endereco");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
