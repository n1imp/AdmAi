-- ============================================================================
-- Fase 3: registro conversacional no privado + dados do cliente atendido.
--   - Servico ganha clienteNome / clienteTelefone (para pedir avaliação depois)
--   - SessaoConversa: estado da conversa passo-a-passo no privado do técnico
-- Tudo aditivo (colunas nullable + nova tabela) — sem risco de perda de dados.
-- ============================================================================

-- Cliente atendido no serviço
ALTER TABLE "Servico" ADD COLUMN "clienteNome" TEXT;
ALTER TABLE "Servico" ADD COLUMN "clienteTelefone" TEXT;
CREATE INDEX "Servico_clienteTelefone_idx" ON "Servico"("clienteTelefone");

-- Sessão de conversa (máquina de estados do fluxo privado)
CREATE TABLE "SessaoConversa" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tecnicoId" INTEGER,
    "jid" TEXT NOT NULL,
    "fluxo" TEXT NOT NULL DEFAULT 'registro_servico',
    "estadoAtual" TEXT NOT NULL,
    "dadosParciais" JSONB NOT NULL DEFAULT '{}',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessaoConversa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessaoConversa_empresaId_jid_key" ON "SessaoConversa"("empresaId", "jid");
CREATE INDEX "SessaoConversa_atualizadoEm_idx" ON "SessaoConversa"("atualizadoEm");
