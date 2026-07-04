-- ============================================================================
-- Login/cadastro social (Google, Microsoft, Apple).
--   ContaSocial = vínculo (provedor, sub) -> Usuario. 1 usuário pode ter N.
--   Usuario.senhaHash vira NULLABLE: contas só-social não têm senha (o login por
--   usuário+senha rejeita contas sem senhaHash). Mudança segura/aditiva.
-- ============================================================================

-- AlterTable: senha agora opcional (contas criadas via login social)
ALTER TABLE "Usuario" ALTER COLUMN "senhaHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ContaSocial" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "provedor" TEXT NOT NULL,
    "provedorSub" TEXT NOT NULL,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaSocial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaSocial_provedor_provedorSub_key" ON "ContaSocial"("provedor", "provedorSub");

-- CreateIndex
CREATE INDEX "ContaSocial_usuarioId_idx" ON "ContaSocial"("usuarioId");

-- AddForeignKey
ALTER TABLE "ContaSocial" ADD CONSTRAINT "ContaSocial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
