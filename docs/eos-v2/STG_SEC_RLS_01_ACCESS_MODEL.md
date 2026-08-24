# STG-SEC-RLS-01 — Finding de segurança BLOQUEANTE + ADMAI_DATABASE_ACCESS_MODEL

**Data:** 2026-08-24 · **Origem:** evidência direta do projeto Supabase `admai-staging`
(ref `qsuufuulxfkkeasgxhcv`, ACTIVE_HEALTHY) fornecida pelo usuário. **Produção NÃO tocada;
`PRODUCTION_RLS_STATE = UNKNOWN`** (só inspecionável sob autorização específica).

## Finding — `STG-SEC-RLS-01` · severity `BLOCKING_SECURITY`

Verificado direto no banco de staging:

- **26 tabelas** do schema `public` com **RLS = DISABLED**.
- Os roles **`anon`** e **`authenticated`** têm grants
  `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` em **todas** as 26.
- Supabase **Security Advisor**: `rls_disabled_in_public`, level **ERROR**, facing **EXTERNAL**,
  category **SECURITY**, nas 26.
- Tabelas sensíveis incluídas: `Usuario`, `RefreshToken`, `SessaoUsuario`,
  `CodigoRecuperacaoTotp`, `GoogleConta`, `EmpresaWhatsapp`, `Pagamento`, `AuditLog`, `Tecnico`.

**Impacto:** a *anon (publishable) key* é pública por design (feita para ir no bundle do
frontend). Com RLS off + grants presentes, qualquer um com a URL do projeto + anon key pode
`GET/POST https://qsuufuulxfkkeasgxhcv.supabase.co/rest/v1/Usuario` (e as outras 25) via
PostgREST, **lendo e escrevendo todas as tabelas e contornando 100% do backend Express**
(autenticação, autorização, isolamento de tenant). É exfiltração/adulteração externa direta.

**Não é PASS.** Fecha só sob: proteção existe + negative control morde + fluxo normal do backend
segue funcionando (§6 do amendment).

## ADMAI_DATABASE_ACCESS_MODEL (auditoria determinística do repo inteiro)

Método (§26 determinístico-primeiro): grep de todo o repo por `@supabase/supabase-js`,
`createClient`, `supabase.from(`, `.rpc(`, `/rest/v1`, `.storage.from(`, chaves anon/service-role,
uso de Prisma e SQL cru. Evidência:

- **`@supabase/supabase-js` existe SÓ no backend** (`chaveiro-bot/package.json`); o frontend
  (`chaveiro-painel`) tem **zero** deps `@supabase/*`.
- O cliente Supabase é criado **só com `SUPABASE_SERVICE_ROLE_KEY`** e usado **só para Storage**
  (`services/storage.js:32-39` → `.storage.from(bucket)`); **nenhum** `.from(tabela)`/`.rpc()`.
  Os únicos `.from(` do repo são `Buffer.from`.
- `env.js` **não tem** `SUPABASE_ANON_KEY` — só `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (`env.js:91-92`). A app **nunca** instancia nem usa a anon key.
- Dados de domínio: **100% via Prisma** no backend. `prisma` base (cross-tenant: login,
  onboarding, admin, jobs, webhooks, auditoria) e `prismaParaEmpresa` (escopado por `empresaId`
  via Client Extensions + GUC `app.empresa_id` quando `RLS_ENABLED=true`) — `src/db/tenant.js`.
- Role de runtime = `postgres.<ref>` do Supabase (**BYPASSRLS**) enquanto `DATABASE_URL_APP`
  não apontar para um role dedicado `NOBYPASSRLS` (`env.js:14-21`).

### Classificação das 26 tabelas

Todas as 26 são **`PRISMA_ONLY`** (acesso exclusivo pelo backend via Prisma). **Zero `UNKNOWN`.**

`Empresa`, `EmpresaWhatsapp`, `Tecnico`, `DocumentoTecnico`, `Servico`, `Material`,
`MovimentacaoEstoque`, `ServicoMaterial`, `Usuario`, `ContaSocial`, `Notificacao`, `Pagamento`,
`SessaoConversa`, `Avaliacao`, `ConexaoBot`, `RegistroPonto`, `BatidaPonto`, `GoogleConta`,
`AvaliacaoGoogle`, `AnaliseAvaliacoes`, `CodigoRecuperacaoTotp`, `Assinatura`, `ConviteUsuario`,
`SessaoUsuario`, `RefreshToken`, `AuditLog`.

- **STORAGE_ONLY:** os buckets (`documentos-tecnico` privado, `estoque`, `selfies-ponto`) —
  via service-role, server-side. Hoje `storage.buckets=0` no staging (bucket ainda não provisionado).
- **SUPABASE_DATA_API / AUTH_ONLY / MIXED:** nenhuma.

**Consequência-chave:** como `anon`/`authenticated` são comprovadamente **não usados** pela
aplicação, **revogar** seus grants tem **risco de compatibilidade ZERO**.

## Artefato existente (parcial — NÃO resolve este Finding)

`chaveiro-bot/prisma/rls/enable_rls.sql` habilita RLS+FORCE+policy `tenant_isolation` em **12**
tabelas (para *isolamento entre tenants* assumindo um role `app_rw` `NOBYPASSRLS`). Ele:
(a) cobre só 12 das 26 — deixa de fora `Usuario`, `Empresa`, `RefreshToken`, `SessaoUsuario`,
`CodigoRecuperacaoTotp`, `AuditLog`, `Assinatura`, `ConviteUsuario`, `SessaoConversa`,
`GoogleConta`, ...; (b) **não revoga** grants de `anon`/`authenticated`. Logo **não** fecha
STG-SEC-RLS-01 (exposição externa). É um concern *separado e posterior* (isolamento inter-tenant),
mantido como está.

## Fluxo (amendment STAGING SECURITY + MIGRATION RECONCILIATION)

1. ✅ Auditoria determinística → este documento (access model + finding).
2. **Codex D1 DECISOR** — boundary correto (A: RLS+policies / B: revoke anon+authenticated / C: híbrido).
   Thread registrado no ledger quando concluído.
3. Claude implementa a decisão como **artefato versionado** (SQL + runbook) — Write Set.
4. **Negative control** com a anon key de staging: `/rest/v1/{Usuario,RefreshToken,Empresa,Pagamento}`
   → DENIED; sabotagem (desabilitar o controle) → o controle morde; restaurar. `authenticated`
   sem privilégio não contorna. (Requer anon key + aplicação no banco de staging.)
5. Reconciliação de migration (baseline não rastreado) — passo separado, depois do boundary.
6. Só então: retomar o programa de staging (operational → bucket → matriz → E2E).

> Passos 3–5 dependem de **aplicar no banco de staging** (credenciais/execução SQL) — enquanto
> ausentes, o artefato versionado (passo 3) é produzido no repo e a aplicação/prova fica
> `BLOCKED_CAPABILITY` com revisitCondition.
