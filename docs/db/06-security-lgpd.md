# F6 — Planejamento de Segurança & LGPD

> Crítico: o AdmAi é **multi-tenant** (vazamento cross-empresa = pior cenário) e coleta **dados
> sensíveis** (geo+selfie+CPF+salário). Aterrado no `enable_rls.sql` real, `decisions.md` e
> `docs/legal/`. Referência: STRIDE, menor privilégio, LGPD (Lei 13.709/2018).

## Modelo de ameaças (STRIDE) — foco cross-tenant

| Ameaça | Vetor no AdmAi | Controle atual | Reforço proposto |
|---|---|---|---|
| **S**poofing | roubo de token/sessão | JWT HS256 1h + refresh rotacionado SHA-256 HttpOnly; `tokenValidoApos` | rotação do segredo JWT; revisar expiração |
| **T**ampering | alterar dado de outra empresa | `prismaParaEmpresa` injeta `empresaId` (`src/db/tenant.js`) | **ligar RLS** (ADR-004) = 2ª camada |
| **R**epudiation | negar ação privilegiada | `AuditLog` (antes/depois, ip, ator) | tornar append-only de fato (abaixo) |
| **I**nformation disclosure | **IDOR cross-tenant** | extensão reescreve `findUnique→findFirst`; testes `idor.test.js` | estender IDOR a whatsapp/google/selfie; RLS |
| **D**enial of service | flood de endpoints | rate-limit (express-rate-limit + Redis) | quotas por tenant (F7) |
| **E**levation of privilege | funcionário agindo como dono | `requirePermissao(modulo, acao)` (`services/permissoes.js`); self-scope por `req.user.tecnicoId` | menor privilégio; reteste dos 3 papéis a cada mudança de RBAC (lição B1/B2/B3) |

## RBAC (já implementado — documentar, cf. `decisions.md`)

- Papéis `dono`/`gestor`/`funcionario` + overrides por módulo (`Usuario.permissoes` Json).
- **Dono é imutável** (grant total; override nunca reduz o dono — evita self-lockout).
- **Servidor é a fonte da verdade:** esconder no front não é segurança; toda mutação passa por
  `requirePermissao`. Funcionário é **self-scoped no backend** (nunca confia em `tecnicoId` do cliente).
- **Critério:** toda rota de mutação com permissão explícita — B1/B2/B3 desta trilha corrigiram rotas
  que tinham só `requireAuth`. Manter como invariante de revisão.

## Isolamento no banco — RLS (aterrado no `prisma/rls/enable_rls.sql`)

O script **já existe e é grau de produção**:
- **Fail-closed:** sem o GUC `app.empresa_id`, as policies retornam **zero linhas** (`current_setting(..., true)` → NULL).
- **`FORCE ROW LEVEL SECURITY`:** vale até para o owner das tabelas (Prisma cria como owner).
- **Cobertura:** 7 tabelas com `empresaId` direto (`Tecnico`, `Servico`, `Material`, `Pagamento`,
  `EmpresaWhatsapp`, `Avaliacao`, `RegistroPonto`) + 4 por relação via `EXISTS` no pai (`BatidaPonto`→
  `RegistroPonto`, `MovimentacaoEstoque`→`Material`, `ServicoMaterial`→`Servico`, `Notificacao`→`Usuario`).
- **Deliberadamente fora:** `Empresa`/`Usuario` (login cross-tenant), `SessaoConversa` (empresaId
  nullable na desambiguação), `GoogleConta`/`AvaliacaoGoogle`/`ContaSocial` (jobs cross-tenant).

**Pré-condições para ligar (ADR-004, ordem obrigatória):**
1. `RLS_ENABLED=true` em **staging**, painel inteiro validado (o `src/db/tenant.js` passa a cravar
   `set_config('app.empresa_id', <id>, true)` por transação).
2. **Role dedicado `app_rw` sem `BYPASSRLS`** no `DATABASE_URL` de runtime (senão a RLS é inócua — o
   role atual do Supabase bypassa). Migrations seguem no role owner.
3. **Jobs cross-tenant** (`services/agendador.js` — expurgo LGPD, sync avaliações, inbound do bot) usam
   `prisma` base sem GUC → dar-lhes conexão privilegiada **ou** setar o GUC por empresa. Sob RLS com role
   restrito, esquecê-los = job "some" (fail-closed).

Roteiro operacional detalhado: [`../TUTORIAL_RLS_DAST.md`](../TUTORIAL_RLS_DAST.md). Rollback documentado
no próprio `enable_rls.sql` (bloco DESFAZER).

## Criptografia & gestão de chave

- **Trânsito:** TLS (Supabase/Railway).
- **Repouso:** Supabase cifra o volume; segredos de app cifrados no código (`accessTokenEnc`,
  `refreshTokenEnc`, `totpSecret`, `telefoneOtpHash`); senhas em **bcrypt**.
- **Gap corporativo:** a chave de cifra vive em **env** → propor **KMS** (custódia + rotação). Avaliar
  *column-level encryption* para `Tecnico.cpf/salarioBase`.

## Auditoria imutável

`AuditLog` existe (antes/depois, ip, ator). **Reforços:** (1) **append-only de fato** — o role de app
não deve ter UPDATE/DELETE na tabela; (2) **retenção** definida; (3) **cobertura** de todas as ações
privilegiadas (papel alterado, exclusão de usuário, mudança de billing, **acesso a selfie/geo**).

## LGPD — mapa de dados pessoais e plano

**Dado pessoal/sensível identificado (evidência no schema):**

| Categoria | Onde | Titular | Base legal (a confirmar — DPO) |
|---|---|---|---|
| Geolocalização | `BatidaPonto.lat/lng/precisao` | funcionário | execução de contrato / obrigação legal (jornada) |
| Selfie (biometria) | `BatidaPonto.selfieUrl` | funcionário | idem — **alto risco → exige RIPD** |
| CPF, nascimento, endereço, salário | `Tecnico.*` | funcionário | execução de contrato |
| Nome/telefone de cliente | `Servico.cliente*`, `Avaliacao.clienteTelefone` | cliente final | legítimo interesse / consentimento |

**Já registrado como pendente** em [`../decisions.md`](../decisions.md) (2026-06-21) — este plano o torna
acionável:
- **Retenção (minimização — LGPD art. 15/16):** definir prazo `N` para expurgar selfie/geo (ex.: após
  fechamento do mês/cálculo do banco de horas, respeitando prazo trabalhista de contestação). Implementar
  **job de expurgo** estendendo `services/agendador.js`. ⚠️ `N` é decisão do dono + jurídico.
- **Transparência (art. 9):** a tela de bater ponto (`MeuPonto.jsx`/`CapturaSelfie.jsx`) deve avisar
  **antes da captura** que selfie+localização são coletadas (finalidade: comprovação de jornada), com
  link à Política de Privacidade ([`../legal/POLITICA_DE_PRIVACIDADE.md`](../legal/POLITICA_DE_PRIVACIDADE.md)).
- **Direitos do titular (art. 18):** export/exclusão — cruzar com a exclusão de empresa (F4/F8: rotina
  explícita, não cascade cego).
- **RIPD/DPIA (art. 38):** obrigatório para o ponto com selfie+geo (tratamento de alto risco). Esqueleto:
  finalidade, necessidade/proporcionalidade, riscos ao titular, salvaguardas (cifra, retenção, acesso
  auditado), medidas de mitigação. ⚠️ Redação final = DPO/jurídico.

## O que precisa de você
- **DPO/jurídico:** base legal por finalidade, prazo `N` de retenção, aprovação do RIPD.
- **Infra:** ligar RLS exige o staging + role dedicado (ADR-004) — não fazer cego em prod.

**✅ F6:** STRIDE ✓ · RBAC documentado ✓ · RLS aterrada + pré-condições ✓ · mapa LGPD + RIPD (esqueleto) ✓.
**⚠️ Pendente:** aval DPO, ligar RLS (staging), KMS.
