-- ============================================================================
-- Remove o WhatsApp LEGADO (conexão Evolution POR-EMPRESA). O robô passa a ser de
-- número único (singleton ConexaoBot); EmpresaWhatsapp guarda apenas SETTINGS por
-- empresa (grupoJid, review*) e as credenciais da Cloud API (Meta).
--
-- Dropa o índice único de instanceName e as 6 colunas da conexão por-empresa.
-- ============================================================================

-- DropIndex
DROP INDEX IF EXISTS "EmpresaWhatsapp_instanceName_key";

-- AlterTable
ALTER TABLE "EmpresaWhatsapp" DROP COLUMN "instanceName",
DROP COLUMN "apiKeyEnc",
DROP COLUMN "numeroDisplay",
DROP COLUMN "estadoConexao",
DROP COLUMN "qrCode",
DROP COLUMN "webhookSecret";
