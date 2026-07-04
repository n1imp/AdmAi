-- ============================================================================
-- Corrige drift de migration que QUEBRA o modelo de número único.
--
-- A migration 20260531124110_evolucao_v2 criou `Tecnico_telefone_key` como UNIQUE
-- INDEX (telefone sozinho). A 20260605000000_multitenant_empresa tentou removê-la com
-- `ALTER TABLE ... DROP CONSTRAINT IF EXISTS "Tecnico_telefone_key"` — mas isso é um
-- NO-OP para um índice (não é uma constraint de tabela), então o índice sobreviveu.
--
-- Resultado: o mesmo telefone NÃO pode existir em duas empresas, contrariando o schema
-- atual (`@@unique([empresaId, telefone])` + `@@index([telefone])` NÃO-único) e o modelo
-- de número único. Aqui dropamos o índice de fato (idempotente).
-- Não-destrutivo: remove só um índice indevido; nenhuma linha é apagada.
-- ============================================================================

DROP INDEX IF EXISTS "Tecnico_telefone_key";
