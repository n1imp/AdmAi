-- CreateTable
CREATE TABLE "Tecnico" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tecnico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" SERIAL NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "local" TEXT NOT NULL,
    "endereco" TEXT,
    "descricao" TEXT NOT NULL,
    "material" TEXT,
    "valorCobrado" DOUBLE PRECISION NOT NULL,
    "valorMaterial" DOUBLE PRECISION NOT NULL,
    "valorLiquido" DOUBLE PRECISION NOT NULL,
    "msgOriginal" TEXT NOT NULL,
    "remetenteWpp" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tecnico_nome_key" ON "Tecnico"("nome");

-- AddForeignKey
ALTER TABLE "Servico" ADD CONSTRAINT "Servico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
