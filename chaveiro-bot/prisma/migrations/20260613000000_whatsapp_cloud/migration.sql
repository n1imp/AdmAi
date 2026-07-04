-- ============================================================================
-- WhatsApp Cloud API (Meta): suporte ao provider oficial por empresa.
-- Aditivo (colunas nullable / com default) — não afeta o fluxo Evolution atual.
--   provider        seleciona a camada ('evolution' padrão | 'cloud')
--   phoneNumberId   ID do número na Cloud API (destino do POST /messages)
--   wabaId          WhatsApp Business Account ID
--   accessTokenEnc  token de acesso (System User), cifrado em repouso (AES-256-GCM)
-- ============================================================================

-- AlterTable
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'evolution';
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN     "phoneNumberId" TEXT;
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN     "wabaId" TEXT;
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN     "accessTokenEnc" TEXT;
