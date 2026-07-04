-- ============================================================================
-- Redesign "número único" — Fase 3: roteamento por telefone + desambiguação.
--   SessaoConversa passa a ser chaveada SÓ por `jid` (uma conversa ativa por
--   telefone), e `empresaId` vira nullable (nulo durante a desambiguação).
-- Limpamos as sessões existentes porque a chave de unicidade muda — sessões em
-- andamento no modelo antigo (empresaId+jid) não têm correspondência segura aqui.
-- ============================================================================

-- Sessões em andamento perdem o sentido com a troca de chave: descartar.
DELETE FROM "SessaoConversa";

-- empresaId nullable (nulo enquanto o remetente escolhe a empresa na desambiguação).
ALTER TABLE "SessaoConversa" ALTER COLUMN "empresaId" DROP NOT NULL;

-- Troca a unicidade (empresaId, jid) → (jid): uma conversa ativa por telefone.
DROP INDEX "SessaoConversa_empresaId_jid_key";
CREATE UNIQUE INDEX "SessaoConversa_jid_key" ON "SessaoConversa"("jid");
