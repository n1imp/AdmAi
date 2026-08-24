# STG_MIG_RECON_EXTERNAL_APPLY_PACKAGE

**Data:** 2026-08-24 · **HEAD:** `46c113e37542f848886409f70011622745a077c6` · **Branch:** `fix/seguranca-criticos`
**Finding:** `STG-MIG-SCHEMA-LAG-01` · **Decisão D1:** Codex DECISOR thread `01a034d7` (**A-prime**, vinculante)
**AUTHORIZED_TARGET:** `admai-staging` / `qsuufuulxfkkeasgxhcv` · **PROHIBITED:** qualquer outro ref (produção incluída)

## Estado verificado

- Repo: **28** migrations. Staging (evidência externa real): **23 aplicadas**, nomes/ordem idênticos
  aos primeiros 23 diretórios do repo (última `20260707000001_drop_material_nome_unique_global`).
- Classificação: **STAGING_SCHEMA_BEHIND_REPOSITORY** — **5 pendentes**, zero UNKNOWN.
- `DocumentoTecnico` origina em `20260717000001_documentos_tecnico`; **nenhuma migration posterior
  depende dela** (verificado nos SQLs). Dependentes de runtime: rotas de documentos, tenant scoping
  e o preflight do lockdown RLS (lista das 26 — **congelado**, não fazer variante 25).

## ⚠️ Checksums CANÔNICOS = bytes LF do blob git

O checkout Windows desta worktree normaliza 4 dos 5 arquivos para CRLF — o hash on-disk NÃO é o
canônico. O `checksum` da `_prisma_migrations` do Prisma 7.9.1 é SHA-256 dos bytes do script
(forma portável: LF). **Use os hashes abaixo e os arquivos anexados (exportados do blob git, LF).**

### 23 APLICADAS — verificação de checksum (comparar com a coluna `checksum`)

| # | migration_name | SHA-256 canônico (LF) |
| --- | --- | --- |
| 1 | 20260524204642_ | `15abf4f3b67a9f3e3bab82faab7f662d8a2a04602097ce37d29b4acb0d6e45a0` |
| 2 | 20260531124110_evolucao_v2 | `89cb9b83292103a83ca693472f5deb73f6747755f01ff75fb6e389c664899fdc` |
| 3 | 20260531144326_add_telefone_display | `6b520a481b0304b7166e638659d64b288cd26489aa16d9d03e5df3b34a80e5cd` |
| 4 | 20260604021146_new | `f0a09aa9bba0ad1932998ba9a147c8f0d7aee47f443332047a3d25c01ef0f407` |
| 5 | 20260604132207_estoque_saldo_real | `33ea194e4ef90b554f32ca12e3107b656083a9714ae05665299e8a5c75831cc2` |
| 6 | 20260604141232_conta_usuario | `1b1458e01cc47a8fef8a730be4c087342e76196aaf03d3df98b8356a9fd43f34` |
| 7 | 20260604142936_notificacoes_inbox | `45016c427ae278ea8d6df7038d606b7cc9565ccdc2ce90c18cef02e2f872a6ab` |
| 8 | 20260605000000_multitenant_empresa | `c4c2f122fcb03bfcaddc40560dd96e6885610733cc64f4117563e34085c1dbd4` |
| 9 | 20260606000000_conversa_cliente | `c75757b88823f537060f9c99f2e9ac5a70dc4dfa212e3c51d6b22afcfef3c688` |
| 10 | 20260607000000_avaliacao | `b5bde159209a21fd13c3a53d12afbd9c45bc108153ea8f6d702b88123e86e1fa` |
| 11 | 20260611000000_whatsapp_qr | `3bf7b56001c2a67d229f03bb82ca7e58e191662161c4efc8b63e06d526704f53` |
| 12 | 20260611000100_totp_2fa | `69b409dbb1daeffc56dac9b7eaf6fd76371314e3385a091d0086513ef50eb924` |
| 13 | 20260612000000_login_social | `9c943a9561090961d4f5a0f79915ea467305ea3d9348389abd51e8b90a9a4edc` |
| 14 | 20260613000000_whatsapp_cloud | `a26a45e7a4c9a27e43b17b138ea021d47f9fc8314c3ad0a91f0c7a4948063222` |
| 15 | 20260613100000_numero_unico_fase1 | `295e140453ecf94e56a99c249adbb84a920bebb70b644b3ea37d733289e77c2c` |
| 16 | 20260614000000_numero_unico_fase3 | `69900eae9aefbc14aeb4bccf00da5004db1718dcbafc68d82fabce4476610fbc` |
| 17 | 20260615000000_rh_ponto_google_reviews | `d9ade4b9f8ab45e3e69c30f2cde7d43ab406b8c945f24f2395e29bcdca6c645d` |
| 18 | 20260616000000_remove_whatsapp_legado | `e30b8a44538bf0499d9f26418bc5c379e226390659397c0db60f700096ea0d3f` |
| 19 | 20260620000000_rbac_ponto_painel | `2220ebf10a07e4f624387ad3585441d4247b597a2216c67ff7cad1f28a21297c` |
| 20 | 20260621000000_fix_tecnico_telefone_unique | `2a87ca4311e76da3c85787856d90228bd4419833ae7d5cc676690b7d2ef3fde3` |
| 21 | 20260705000000_session_auth_tables | `3e7a0738f21668fe0fdac60796a4fcc78b846accc5bbff893dd1f9da617e4025` |
| 22 | 20260707000000_add_codigo_recuperacao_totp | `9a84f395df3d546c3d635317ef48b6af239370ff5b2dfdda8a1d0f82fae36bc8` |
| 23 | 20260707000001_drop_material_nome_unique_global | `03702f814c5dbfb6b6c9dbccc1a657c7f1d49fe75b9ff0e3012a01eccd5af558` |

Qualquer mismatch = **MIGRATION_HISTORY_DIVERGENCE (BLOCKING)** — parar antes de qualquer apply.
`MIGRATION_NAME_MATCH != MIGRATION_CONTENT_MATCH`.

### ✅ DIAGNÓSTICO DA DIVERGÊNCIA (2026-08-24 — fechado, zero UNKNOWN)

O preflight externo achou **22/23 divergentes** (só `20260705000000_session_auth_tables` batia).
Diagnóstico determinístico: para **todas as 22**, `sha256(blob LF → CRLF)` == checksum do staging,
**exato (22/22)**; o controle positivo é `LF_MATCH`. Blobs git são LF puros (sem BOM);
`core.autocrlf=true` no checkout Windows explica o mecanismo; **classe B excluída** (zero commits
tocando as 23 aplicadas após 2026-07-10, data do apply). **Causa: `A. LINE_ENDING_DRIFT` nas 22**
— conteúdo SQL byte-idêntico modulo newline. As 22 linhas históricas foram hasheadas de um
checkout CRLF em julho; a `session_auth_tables` foi hasheada como LF.

**DELTA D1 (thread `01a034d7`, CONCORDO):** (1) preflight de checksum **SATISFEITO** por
"equivalência canônica comprovada" — pendentes **destravadas**; (2) as 5 novas linhas usam o
SHA-256 **LF canônico** (tabela acima, inalterada); (3) **REPARAR as 22 linhas para LF ANTES das
pendentes** — o matcher do Prisma 7.9.1 normaliza o script local para LF na comparação, então
checksum LF armazenado funciona de checkout LF **e** CRLF (o CRLF armazenado, não). Artefato de
reparo (staging-only, fail-closed): `chaveiro-bot/prisma/repair/2026-08-24_checksums_lf_staging.sql`
— transação única com `pg_try_advisory_xact_lock(72707369)`, preflight (23 concluídas, sem
falhas/rollback/duplicatas), 22 UPDATEs com `WHERE migration_name = <nome> AND checksum =
<CRLF exato> AND finished_at IS NOT NULL AND rolled_back_at IS NULL` (ROW_COUNT=1 cada, senão
abort), total==22 asseverado, só a coluna `checksum` muda. **Snapshot completo das 23 linhas antes
de rodar é pré-requisito operacional.** Registro da correção: mapa nome→(CRLF antigo, LF novo)
está no próprio artefato. Fatia de repo complementar aplicada: `.gitattributes` com
`chaveiro-bot/prisma/migrations/**/*.sql text eol=lf` (mata a classe na origem).

**ORDEM REVISADA:** snapshot → **reparo dos 22 checksums** → conferir 23/23 == LF canônico →
aplicar as **5 pendentes** (A-prime, inalterado) → 28/28 LF-consistentes → re-preflight lockdown →
lockdown → verify → negative control → Advisor.

### 5 PENDENTES — ordem obrigatória de aplicação

| Ordem | migration_name | SHA-256 canônico (LF) | Risco |
| --- | --- | --- | --- |
| 1 | 20260717000000_servico_em_andamento | `a1747ee481f215d42a23c17be54499eebd3f005779a75b6eeef83707b18d786c` | SAFE_STAGING |
| 2 | 20260717000001_documentos_tecnico | `937670927c7e080059e3e30de510663b647043aec06137dd7baab1fc3aadc9a0` | SAFE_STAGING |
| 3 | 20260718000000_usuario_preferencias | `15777a816c9205302b770a4ee99e27102de2d8d76a85e897e3b72aed21037155` | SAFE_STAGING |
| 4 | 20260803000000_usuario_telefone_unique | `c9aca088d1e4592eea3b8bb34b40de3ecc05de2095ead0a3128206f605918919` | SAFE_STAGING **com pré-condição de dados** |
| 5 | 20260823000100_servico_comissao_taxa_aplicada | `38f58ab3026d1e10aac04cbe8e540153a0daca9c8a6e251d7e61f81a836229df` | SAFE_STAGING |

Análise por migration (todas **aditivas**, zero DML/backfill, zero drop, DDL transacional; nenhum
`CREATE INDEX CONCURRENTLY`):

1. **servico_em_andamento** — `ALTER TABLE "Servico" ADD COLUMN finalizadoEm/iniciadoEm TIMESTAMP NULL`
   + `CREATE INDEX Servico_tecnicoId_status_idx`. Pré: `Servico` existe; colunas/índice ausentes.
   Pós: 2 colunas NULL + índice. Lock: ACCESS EXCLUSIVE breve (metadata-only) + SHARE no index.
   Não idempotente (re-ADD erra) — protegido pelo protocolo (nunca replay cego).
2. **documentos_tecnico** — `CREATE TABLE "DocumentoTecnico"` (9 colunas, PK serial) + índice
   `(empresaId, tecnicoId)` + FK `Empresa` (RESTRICT/CASCADE) + FK `Tecnico` (CASCADE/CASCADE).
   Pré: `Empresa`/`Tecnico` existem; tabela ausente. Pós: tabela+índice+2 FKs.
3. **usuario_preferencias** — `ALTER TABLE "Usuario" ADD COLUMN preferencias JSONB` (NULL).
4. **usuario_telefone_unique** — `CREATE UNIQUE INDEX "Usuario_telefone_key" ON "Usuario"("telefone")`.
   **Pré-condição de DADOS (obrigatória antes da cadeia inteira):**
   `SELECT telefone, COUNT(*) FROM "Usuario" WHERE telefone IS NOT NULL GROUP BY telefone HAVING COUNT(*) > 1;`
   → deve retornar **0 linhas**; qualquer linha **bloqueia a cadeia**.
5. **servico_comissao_taxa_aplicada** — `ALTER TABLE "Servico" ADD COLUMN comissaoTaxaAplicada DOUBLE PRECISION` (NULL).

## Protocolo de aplicação externa (D1 A-prime — vinculante, thread `01a034d7`)

Racional: para PostgreSQL o Prisma **não** garante transação envolvendo o script inteiro; este
protocolo externo é **mais** atômico que o deploy nativo, e a linha final equivale ao estado de uma
migration concluída — reconhecível pelo Prisma 7.9.1 (`migrate status` limpo depois).

**Preflight global (antes de qualquer escrita):**
1. Alvo provado = `qsuufuulxfkkeasgxhcv` (nunca produção).
2. `_prisma_migrations`: exatamente 23 linhas concluídas, nomes = prefixo do repo, **nenhuma** com
   `finished_at IS NULL AND rolled_back_at IS NULL`, **nenhuma** com `rolled_back_at IS NOT NULL`,
   checksums = tabela das 23 acima.
3. Query de telefones duplicados → 0 linhas.
4. Ausência inicial das 5 mudanças no catálogo (colunas/tabela/índices inexistentes).
5. Congelar deploys/migrations concorrentes durante a operação.

**Por migration, NA ORDEM, um único batch na MESMA sessão:**
```
BEGIN;
SELECT pg_try_advisory_xact_lock(72707369);      -- mesmo id usado pelo Prisma; FALSE => ABORT
-- precondições da migration (objetos-alvo ausentes; anterior registrada)
<migration.sql INTEGRAL — bytes canônicos LF do anexo>
INSERT INTO public._prisma_migrations
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (<UUID v4 novo, minúsculo, 36 chars>, '<SHA-256 canônico da tabela acima>', now(),
   '<nome exato do diretório>', NULL, NULL, <início efetivo da transação>, 1);
COMMIT;
```
- `started_at` estritamente crescente entre migrations; `finished_at >= started_at`.
- O INSERT **só** após todo o migration.sql suceder; `BEGIN/COMMIT/lock/INSERT` **não** entram no checksum.
- Falha em qualquer ponto ⇒ ROLLBACK daquela transação **e PARAR a cadeia** (nenhuma posterior).
- Proibido replay cego e nomes duplicados na history.

**Failure recovery (timeout/ambíguo):** consultar history+catálogo — ambos presentes e coerentes =
commit concluído (seguir); ambos ausentes = rollback (retry permitido); só um presente/divergência =
**bloquear e investigar**. Nunca inserir history isolada; nunca reaplicar às cegas.

**Pós-condições por migration:** exatamente 1 linha nova (nome/checksum/campos), objetos daquela
migration no catálogo, a seguinte ainda ausente.

**Pós-condições finais:** 28 concluídas em ordem; 5 checksums novos = canônicos; `DocumentoTecnico`
com as 2 FKs e ações corretas; índice único `Usuario_telefone_key` válido; colunas novas presentes;
zero pendências/falhas. (Quando houver CLI+credencial local: `npx prisma migrate status` e
`npx prisma migrate diff ... --exit-code` limpos, antes do lockdown.)

## Depois disto (ordem)

`DocumentoTecnico` existe → **re-preflight** do lockdown → aplicar o **lockdown aprovado inalterado**
(SHA-256 `1a195f36…`) → `verify_lockdown.sql` (`9fb63780…`) → negative control (anon key) →
Security Advisor. Lockdown permanece **CONGELADO** — não remover `DocumentoTecnico` da lista.
