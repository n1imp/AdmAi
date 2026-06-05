/*
  Warnings:

  - A unique constraint covering the columns `[telefone]` on the table `Tecnico` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tecnico_nome_key";

-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "comissaoGerada" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "valorMaterial" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Tecnico" ADD COLUMN     "comissao" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "fotoPerfil" TEXT,
ADD COLUMN     "telefone" TEXT;

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "precoUnit" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicoMaterial" (
    "id" SERIAL NOT NULL,
    "servicoId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "descricao" TEXT,

    CONSTRAINT "ServicoMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" SERIAL NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_nome_key" ON "Material"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ServicoMaterial_servicoId_materialId_key" ON "ServicoMaterial"("servicoId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_telefone_key" ON "Tecnico"("telefone");

-- AddForeignKey
ALTER TABLE "ServicoMaterial" ADD CONSTRAINT "ServicoMaterial_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicoMaterial" ADD CONSTRAINT "ServicoMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
