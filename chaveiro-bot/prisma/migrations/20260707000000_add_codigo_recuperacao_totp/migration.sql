-- B7: cria a tabela CodigoRecuperacaoTotp, que o schema.prisma declara e o código usa
-- (services/codigosRecuperacao.js — códigos de recuperação do 2FA), mas que nenhuma
-- migration criava. Sem isto, `migrate deploy` (prod/CI) sobe SEM a tabela e ativar 2FA
-- quebra (P2021). DDL idêntico ao gerado pelo Prisma a partir do schema.

-- CreateTable
CREATE TABLE "CodigoRecuperacaoTotp" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoRecuperacaoTotp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodigoRecuperacaoTotp_usuarioId_idx" ON "CodigoRecuperacaoTotp"("usuarioId");

-- AddForeignKey
ALTER TABLE "CodigoRecuperacaoTotp" ADD CONSTRAINT "CodigoRecuperacaoTotp_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
