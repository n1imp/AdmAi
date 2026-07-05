-- CreateTable
CREATE TABLE "Assinatura" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "stripePriceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'trialing',
    "trialFimEm" TIMESTAMP(3),
    "periodoFimEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteUsuario" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'funcionario',
    "tokenHash" TEXT NOT NULL,
    "nomeConvidadoPor" TEXT,
    "aceitoEm" TIMESTAMP(3),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConviteUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoUsuario" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "jwtIat" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" VARCHAR(300),
    "ultimaAtividadeEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" INTEGER,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_empresaId_key" ON "Assinatura"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_stripeCustomerId_key" ON "Assinatura"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_stripeSubId_key" ON "Assinatura"("stripeSubId");

-- CreateIndex
CREATE INDEX "ConviteUsuario_empresaId_idx" ON "ConviteUsuario"("empresaId");

-- CreateIndex
CREATE INDEX "ConviteUsuario_email_empresaId_idx" ON "ConviteUsuario"("email", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoUsuario_usuarioId_jwtIat_key" ON "SessaoUsuario"("usuarioId", "jwtIat");

-- CreateIndex
CREATE INDEX "SessaoUsuario_usuarioId_idx" ON "SessaoUsuario"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_usuarioId_idx" ON "RefreshToken"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditLog_empresaId_criadoEm_idx" ON "AuditLog"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "AuditLog_usuarioId_idx" ON "AuditLog"("usuarioId");

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoUsuario" ADD CONSTRAINT "SessaoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
