-- ============================================================================
-- RH + Ponto eletrônico + Avaliações Google (ADITIVO).
--   - Tecnico: campos de RH (modalidade/salário/jornada/hora extra/...).
--   - RegistroPonto: banco de horas (timestamps do servidor).
--   - EmpresaWhatsapp: reviewAtivo + reviewTemplate (solicitação de avaliação).
--   - GoogleConta / AvaliacaoGoogle / AnaliseAvaliacoes: integração Google.
-- Nada destrutivo: só colunas nullable/defaultadas e tabelas novas.
-- ============================================================================

-- EmpresaWhatsapp
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN "reviewAtivo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN "reviewTemplate" TEXT;

-- Tecnico (RH)
ALTER TABLE "Tecnico" ADD COLUMN "cpf" TEXT;
ALTER TABLE "Tecnico" ADD COLUMN "dataNascimento" TIMESTAMP(3);
ALTER TABLE "Tecnico" ADD COLUMN "endereco" TEXT;
ALTER TABLE "Tecnico" ADD COLUMN "nivelAcesso" TEXT;
ALTER TABLE "Tecnico" ADD COLUMN "modalidade" TEXT;
ALTER TABLE "Tecnico" ADD COLUMN "salarioBase" DOUBLE PRECISION;
ALTER TABLE "Tecnico" ADD COLUMN "dataAdmissao" TIMESTAMP(3);
ALTER TABLE "Tecnico" ADD COLUMN "horaExtraAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tecnico" ADD COLUMN "horaExtraPercentual" DOUBLE PRECISION;
ALTER TABLE "Tecnico" ADD COLUMN "adicionalNoturno" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tecnico" ADD COLUMN "valorHora" DOUBLE PRECISION;
ALTER TABLE "Tecnico" ADD COLUMN "jornadaDiariaMin" INTEGER;
ALTER TABLE "Tecnico" ADD COLUMN "jornadaSemanalMin" INTEGER;

-- RegistroPonto
CREATE TABLE "RegistroPonto" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tecnicoId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "entradaEm" TIMESTAMP(3),
    "almocoSaidaEm" TIMESTAMP(3),
    "almocoVoltaEm" TIMESTAMP(3),
    "saidaEm" TIMESTAMP(3),
    "totalMinutos" INTEGER,
    "horaExtraMinutos" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistroPonto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegistroPonto_tecnicoId_data_key" ON "RegistroPonto"("tecnicoId", "data");
CREATE INDEX "RegistroPonto_empresaId_data_idx" ON "RegistroPonto"("empresaId", "data");
ALTER TABLE "RegistroPonto" ADD CONSTRAINT "RegistroPonto_tecnicoId_fkey"
  FOREIGN KEY ("tecnicoId") REFERENCES "Tecnico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GoogleConta (tokens cifrados)
CREATE TABLE "GoogleConta" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "placeId" TEXT,
    "accountId" TEXT,
    "locationId" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpira" TIMESTAMP(3),
    "escopo" TEXT,
    "conectadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleConta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleConta_empresaId_key" ON "GoogleConta"("empresaId");

-- AvaliacaoGoogle
CREATE TABLE "AvaliacaoGoogle" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "reviewId" TEXT NOT NULL,
    "autorNome" TEXT,
    "nota" INTEGER,
    "comentario" TEXT,
    "criadoEmGoogle" TIMESTAMP(3),
    "respondida" BOOLEAN NOT NULL DEFAULT false,
    "respostaTexto" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "analiseJson" JSONB,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvaliacaoGoogle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvaliacaoGoogle_reviewId_key" ON "AvaliacaoGoogle"("reviewId");
CREATE INDEX "AvaliacaoGoogle_empresaId_respondida_idx" ON "AvaliacaoGoogle"("empresaId", "respondida");
CREATE INDEX "AvaliacaoGoogle_empresaId_nota_idx" ON "AvaliacaoGoogle"("empresaId", "nota");

-- AnaliseAvaliacoes
CREATE TABLE "AnaliseAvaliacoes" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "resumoElogios" TEXT,
    "resumoCriticas" TEXT,
    "ultimoReviewAnalisado" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnaliseAvaliacoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnaliseAvaliacoes_empresaId_key" ON "AnaliseAvaliacoes"("empresaId");
