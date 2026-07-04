-- ============================================================================
-- 2FA TOTP real (app autenticador + códigos de 6 dígitos).
--   totpSecret   = segredo confirmado (cifrado em repouso), usado na verificação.
--   totpPendente = segredo gerado no setup, antes da confirmação (cifrado).
-- Mantém twoFactorAtivo (boolean) e twoFactorSecret (legado). Aditivo (nullable).
-- ============================================================================

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpPendente" TEXT;
