-- ============================================================================
-- WhatsApp: persiste o QR de pareamento capturado via webhook QRCODE_UPDATED.
-- O painel exibe `qrCode` enquanto estadoConexao='aguardando_qr'; é limpo quando
-- a conexão abre (CONNECTION_UPDATE open). Aditivo (coluna nullable).
-- ============================================================================

-- AlterTable
ALTER TABLE "EmpresaWhatsapp" ADD COLUMN     "qrCode" TEXT;
