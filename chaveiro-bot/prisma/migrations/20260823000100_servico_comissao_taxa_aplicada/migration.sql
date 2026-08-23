-- Snapshot imutavel da TAXA de comissao aplicada no momento da escrita. [FIX-COMISSAO-SNAPSHOT]
-- A divisao comissaoGerada/valorLiquido NAO reconstitui a taxa: toFixed(2) devolve 4.95% onde a
-- taxa era 5% (liquido 1.01), e liquido zero torna a divisao impossivel. Nullable de proposito:
-- servicos historicos ficam NULL — lacuna honesta, nunca taxa inventada retroativamente.
ALTER TABLE "Servico" ADD COLUMN "comissaoTaxaAplicada" DOUBLE PRECISION;
