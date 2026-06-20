-- ============================================================================
-- Redesign "número único" — Fase 1 (ADITIVO): identidade por telefone.
--   - Tecnico: vínculo opcional ao Usuario dono (usuarioId) + índice global por telefone
--   - Usuario: OTP/2FA por telefone + índice por telefone
--   - ConexaoBot: singleton da conexão única do robô
-- Não altera nada existente de forma destrutiva.
-- ============================================================================

-- Tecnico
ALTER TABLE "Tecnico" ADD COLUMN     "usuarioId" INTEGER;
CREATE UNIQUE INDEX "Tecnico_usuarioId_key" ON "Tecnico"("usuarioId");
CREATE INDEX "Tecnico_telefone_idx" ON "Tecnico"("telefone");
ALTER TABLE "Tecnico" ADD CONSTRAINT "Tecnico_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Usuario
ALTER TABLE "Usuario" ADD COLUMN     "phone2faAtivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN     "telefoneOtpHash" TEXT;
ALTER TABLE "Usuario" ADD COLUMN     "telefoneOtpExpira" TIMESTAMP(3);
CREATE INDEX "Usuario_telefone_idx" ON "Usuario"("telefone");

-- ConexaoBot (singleton: id sempre = 1)
CREATE TABLE "ConexaoBot" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "instanceName" TEXT,
    "estadoConexao" TEXT NOT NULL DEFAULT 'desconectado',
    "qrCode" TEXT,
    "webhookSecret" TEXT,
    "numeroDisplay" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConexaoBot_pkey" PRIMARY KEY ("id")
);
