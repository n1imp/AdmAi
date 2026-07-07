-- B8: remove o índice UNIQUE GLOBAL em Material.nome (Material_nome_key), que quebra
-- o multi-tenant — um tenant não conseguia criar material com nome já usado por QUALQUER
-- outro tenant (P2002). O unique correto por empresa (Material_empresaId_nome_key)
-- permanece. O schema.prisma nunca declarou o global; era resíduo de migration antiga.

-- DropIndex
DROP INDEX "Material_nome_key";
