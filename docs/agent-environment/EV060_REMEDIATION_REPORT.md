# EV-060 Remediation Report — Escalonamento Lateral de Privilégios em `admin.js`

**Branch:** `fix/seguranca-criticos` · **Commits:** `09cce01` (reprodução), `c36c151` (correção) · **Missão:** continuação da "Security Closure Operation", que concluiu Opção B bloqueada por este achado único.

## 1. Reprodução

O achado original (EV-060, registrado na missão anterior) cobria só `POST /usuarios` e `POST /usuarios/convidar`. A investigação desta missão **ampliou o escopo real** por leitura direta do código, antes de qualquer correção: `PATCH /usuarios/:id` e `DELETE /usuarios/:id` tinham o mesmo defeito — e o `DELETE` era pior (nenhum guard de hierarquia, nenhum teste na rota inteira).

Escrevi 7 testes negativos novos contra o código **sem correção** (`test/integration/rbac_privilege_escalation.test.js`, commit `09cce01`) e confirmei via CI real (não suposição): run [`30825079813`](https://github.com/n1imp/AdmAi/actions/runs/30825079813) — **7 falhas exatas**, todas nos casos novos (`gestor cria gestor`, `gestor convida gestor`, `gestor desativa gestor/dono`, `gestor promove funcionário a gestor`, `gestor deleta dono/gestor`), **114 outros testes já passavam** (comportamento legítimo nunca esteve quebrado — o bug é ausência de restrição, não regressão funcional).

**Existe escalonamento lateral reproduzível: SIM**, confirmado empiricamente.

## 2. Causa raiz

`src/services/permissoes.js` já tinha `podeAtribuirPapel(ator, papelPretendido)` e `podeGerenciarUsuario(ator, alvo)` — ambas baseadas em `nivelDoPapel` (`PAPEIS=['dono','gestor','funcionario']`, índice=nível), já usadas corretamente em `src/routes/tecnicos.js:306,358`. As 4 rotas de `src/routes/admin.js` nunca as importavam; cada uma tinha um guard ad-hoc que só bloqueava `papel === 'dono'`:

| Rota | Falha |
|---|---|
| `POST /usuarios` | gestor cria gestor (par) livre |
| `PATCH /usuarios/:id` | idem + **nenhum guard cross-user** fora da troca de papel (gestor podia desativar/editar o dono) |
| `DELETE /usuarios/:id` | **nenhum guard**, zero teste |
| `POST /usuarios/convidar` | gestor convida gestor (par) livre |

Pré-condição em todos os casos: o ator precisa já ter `usuarios.editar` via override concedido por um `dono` (`PRESET_GESTOR` não dá isso por padrão).

## 3. Arquitetura

`podeAtribuirPapel`/`podeGerenciarUsuario` usam `<` estrito — aplicadas cruas quebrariam "dono cria outro dono" (regressão testada). A correção usa o mesmo padrão de bypass total para dono/admin já empregado em `limitarPermissoesAoAtor` (`permissoes.js:157`), preservando 100% do comportamento legítimo do dono.

## 4. Arquivos modificados

- `chaveiro-bot/src/routes/admin.js` — as 4 rotas (import de `podeAtribuirPapel`/`podeGerenciarUsuario`; guards substituídos, não empilhados).
- `chaveiro-bot/test/integration/rbac_privilege_escalation.test.js` — 7 testes novos + comentário de contexto do EV-060.

Nenhuma alteração em `services/permissoes.js` — as funções já estavam corretas, só não eram usadas.

## 5. Justificativa técnica da correção

- **`POST /usuarios`, `PATCH .../papel`, `POST /usuarios/convidar`**: guard trocado por `req.user.papel !== 'dono' && !req.user.admin && !podeAtribuirPapel(req.user, papel)` — superconjunto estritamente mais restritivo do guard antigo (substitui, não empilha).
- **`PATCH /usuarios/:id`**: novo guard cross-user (`podeGerenciarUsuario`) cobre `ativo`/`senha`/`permissoes`/`papel`, não só a troca de papel. Busca do alvo (`antes`) ampliada para incluir esse caso; 404 verificado antes de `podeGerenciarUsuario` decidir (evita trocar 404→403 indevido para ID inexistente).
- **`DELETE /usuarios/:id`**: reaproveita a busca `alvoDel` já existente (antes só usada no audit log), move o 404 pra antes da mutação, insere o guard entre a busca e o `deleteMany`.
- Toda busca do alvo permanece escopada por `empresaId: req.user.empresaId` — preserva o anti-IDOR cross-tenant já existente.

## 6. Testes criados (antes/depois)

| Caso | Antes (commit `09cce01`) | Depois (commit `c36c151`) |
|---|---|---|
| gestor cria gestor (par) | 201 (falha — deveria ser 403) | **403** |
| gestor convida gestor (par) | 200 (falha) | **403** |
| gestor desativa outro gestor | 200 (falha) | **403** |
| gestor desativa o dono | 200 (falha) | **403** |
| gestor promove funcionário a gestor | 200 (falha) | **403** |
| gestor deleta o dono | 200 (falha) | **403** |
| gestor deleta outro gestor | 200 (falha) | **403** |
| dono cria dono/gestor/funcionário | 201 (regressão) | 201 (mantido) |
| gestor cria/edita funcionário (nível abaixo) | 200/201 (regressão) | 200/201 (mantido) |
| dono promove/faz downgrade | 200 (novo) | 200 |
| dono deleta gestor/funcionário | 200 (novo, rota nunca testada) | 200 |
| gestor PATCH cross-tenant | 404 (regressão, ator dono já cobria; novo teste com ator gestor) | 404 (mantido — nunca 403) |

CI real, run [`30825941205`](https://github.com/n1imp/AdmAi/actions/runs/30825941205): **121/121 testes de integração passando** (25 arquivos), suíte unitária 368/368, lint 0 erros, typecheck limpo, `Security` workflow (Semgrep/gitleaks/`npm audit`) verde.

## 7. Revisão adversarial (Gate 6)

Agente `red-team-attacker` fresco (sem contexto desta conversa) tentou 6 vetores: bypass via aceite de convite, inconsistência de guard entre campos editáveis, propagação de `usuarios.editar` a um subordinado, condição de corrida entre guard e mutação, `papel` nulo no alvo, e as regressões. Resultado:

- **4 vetores refutados** (bypass de convite, inconsistência de campo, `papel` nulo, e a propagação de permissão — esta última é real mas inofensiva: um funcionário com `usuarios.editar` pendurado ainda não consegue agir sobre ninguém, por ser o nível mais baixo da hierarquia).
- **1 achado novo, distinto de EV-060**: TOCTOU de baixa severidade — o guard lê o estado do alvo antes da mutação, mas o `where` do `updateMany`/`deleteMany` final não revalida o nível; uma promoção legítima concorrente de terceiro na janela exata poderia deixar a mutação do atacante se aplicar indevidamente. **Não é explorável unilateralmente pelo atacante** (depende de ação concorrente de outra pessoa). CWE-367, severidade baixa (~CVSS 3.1). Registrado como EV-062/item 31 da Discovery Queue, não corrigido (fora do escopo desta missão — remediar EV-060 especificamente, não abrir nova frente).
- Regressões: confirmadas via a suíte real de CI (121/121), não pela revisão adversarial isolada (sem Postgres no ambiente do agente).

**Nenhum achado reabre o escalonamento lateral original.**

## 8. Validação final

- `npx vitest run` (backend): 368/368.
- `npx vitest run` (integração, CI real): 121/121, 25 arquivos.
- `npx eslint .`: 0 erros.
- `npm run typecheck`: limpo.
- CI (`ci.yml`): `backend`, `frontend`, `docker-build`, `codex-policy` — todos verdes nos 2 runs (reprodução e correção).
- `Security` (`security.yml`): Semgrep, gitleaks, `npm audit` — verdes.

## 9. Impacto sobre a frente de segurança

EV-060 era o único bloqueador que motivou a Opção B da missão "Security Closure Operation". Está corrigido, testado e revisado adversarialmente. Os demais itens do `SECURITY_CLOSURE_REPORT.md` anterior (não relacionados ao EV-060, fora do escopo desta missão) continuam pendentes:

- `billing.js`/`google.js` sem nenhum teste de negação de acesso.
- 5 de 6 módulos prioritários abaixo do piso já decidido em `T-CI-01`.
- `react-router`/`react-router-dom` com CVEs em runtime, upgrade major (`T-DEPS-01`) não executado.
- Migration `Usuario.telefone @unique` ainda não validada contra dados reais (ambiental).
- Novo item desta missão: TOCTOU de baixa severidade em `admin.js` (§7), não corrigido.

## 10. Parecer Final

### EV-060: **ENCERRADO**

Reproduzido com evidência real (CI), corrigido com o menor diff que reusa funções já existentes e testadas em outro lugar do código, validado com 7 testes novos + zero regressão em 121 testes de integração reais, e sobreviveu a uma revisão adversarial dedicada que tentou 6 vetores diferentes de bypass sem sucesso.

### Frente de Segurança: **NÃO oficialmente encerrada**

O EV-060 (único bloqueador da missão anterior) está resolvido, mas a frente como um todo carrega pendências não relacionadas a ele (listadas no §9), incluindo um achado novo de baixa severidade surgido nesta própria revisão adversarial (TOCTOU, §7). Nenhuma delas é um bloqueador crítico ou alto reaberto por esta missão — mas declarar a frente "encerrada" sem mencioná-las seria impreciso. Cabe ao usuário decidir se aceita esse conjunto de riscos residuais (nenhum deles reabre um escalonamento de privilégio) e considera a frente fechada, ou se deseja triá-los numa próxima missão.
