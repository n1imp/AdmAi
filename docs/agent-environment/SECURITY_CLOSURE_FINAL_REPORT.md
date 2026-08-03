# Security Closure Final Report — Superfície Atualmente Exposta

**Branch:** `fix/seguranca-criticos` · **HEAD:** `3901335` · **Missão:** "Security Closure Final" (continuação de "Security Closure Operation" e "EV-060 Remediação").

Metodologia: Evidence Driven Execution. Nada abaixo se apoia em parecer anterior sem revalidação ou evidência nova produzida nesta execução.

---

## Gate 0 — Classificação Obrigatória das Pendências

| Pendência | Categoria | Exploração Atual | Superfície Ativa | Bloqueia Encerramento? | Justificativa |
|---|---|---|---|---|---|
| **Vazamento de dados não-autenticado em `POST /auth/login`** (desambiguação por telefone retorna nomes de empresa + `usuarioId` antes de verificar senha) | **A** | **Sim — confirmada por leitura direta nesta execução** (`auth.js:169-186`) | Sim (rota pública, sempre ativa) | **SIM** | Enumeração de usuário + vazamento de afiliação empresarial sem prova de credencial; não conta no rate limit (`skipSuccessfulRequests:true`) |
| Corrida de aceite duplo em `POST /convite/:token/aceitar` (`findFirst` de `aceitoEm:null` fora de transação) | C | Sim, mas impacto baixo (duplica conta, não escala privilégio — papel já vetado na criação do convite) | Sim (rota pública) | Não | Correção barata (mesmo padrão `updateMany` condicional do EV-056), mas sem urgência de segurança — movida ao backlog |
| `billing.js`/`google.js` sem teste HTTP de `requireAuth`/`adminOnly`/RBAC | B → **RESOLVIDO nesta execução** | N/A | Sim | Não (resolvido) | 11 testes novos (`billing_google_auth.test.js`), CI real: 132/132 |
| Cobertura de testes abaixo do piso de `T-CI-01` em módulos ativos | C (reclassificado) | N/A | Parcial | Não | Por instrução explícita: não perseguir percentual; comportamentos críticos da superfície ativa (auth/RBAC/billing/google) já ganharam teste nesta e nas 2 missões anteriores |
| `react-router`/`react-router-dom` com 2 CVEs conhecidas | C | Sink não alcançável confirmado 2x (auditorias independentes) | Sim (runtime), sem sink ativo | Não | Sem atualização segura disponível (6.30.4 é a última 6.x, ainda vulnerável; fix só via major 7.x, breaking change real) — documentado como risco residual |
| Migration `Usuario.telefone @unique` não validada contra dados reais | **Gate operacional de implantação** | N/A | N/A | Não (não é vulnerabilidade da aplicação) | Precisa da query de auditoria de duplicatas antes de aplicar em qualquer ambiente com dados existentes — já documentado no commit `27ce4a9` |
| TOCTOU em `PATCH`/`DELETE /usuarios/:id` (item 31) | C | **Reproduzida e medida nesta execução** — real, mas não explorável unilateralmente pelo atacante | Sim, mas não unilateral | Não | Depende de ação concorrente de terceiro numa janela de ~15-20ms; backlog |
| Abuso de cadastro em massa (EV-057) — `cadastroLimiter` reduz mas não fecha (~2.880 trials/dia/IP) | C | Já quantificada, decisão arquitetural já tomada pelo usuário (Opção A) | Sim | Não | Não reaberta — mitigação existente + risco residual já aceito (EV-058) |
| Modelos com `empresaId` fora de `MODELOS_ESCOPADOS` (`GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`, `Assinatura`, `ConviteUsuario`, `AuditLog`) | C | Nenhum exploit vivo encontrado em 2 auditorias independentes | Sim | Não | "Landmine" arquitetural — todos os call sites atuais usam `empresaId` explícito; backlog |
| `services/credenciais.js:criarAcessoTecnico` aceita `papel:'dono'` sem validar internamente | C | Não explorável hoje — os 2 únicos chamadores nunca passam `'dono'` | Sim, mas sem call site vulnerável | Não | Defesa em profundidade; backlog |
| `/uploads` estático sem autenticação nem escopo de tenant | C | Sem exploit ativo comprovado hoje; mitigado por nomes UUID não-enumeráveis | Parcial (diretório ativo; principal vetor sensível — fotos do WhatsApp — está com a flag desligada) | Não | Destino histórico/futuro de dado LGPD-sensível (selfies de ponto, fotos de evidência) sem controle de acesso real — backlog de hardening, priorizar se o WhatsApp for reativado |
| CSP `style-src` ainda com `'unsafe-inline'` | C | Sem sumidouro de HTML não sanitizado pra explorar via CSS-only | Sim | Não | Já documentado no próprio código como débito conhecido |
| 9 das 11 vulnerabilidades de dependência do painel (Capacitor/Android build toolchain) | C | Confirmado não exploráveis (rastreado até a chamada real, 2 auditorias) | Não (dev/build-only) | Não | Já classificado, aceitar-documentar |

---

## Superfície de Ataque — Verificação Final (Gate "Revisão Adversarial")

Agente `red-team-attacker` fresco, sem contexto das missões anteriores, atacou ativamente: login/auth/JWT/refresh, 2FA/TOTP/recuperação, as 4 rotas de RBAC do EV-060, isolamento multi-tenant, uploads/downloads, APIs públicas, frontend/CSP, tokens, dependências de runtime.

**Resultado:**
- **RBAC (EV-060)**: sem bypass novo. Percorreu auto-edição de papel, auto-escalada via `permissoes`, omissão do campo `papel` (cai no default do Zod, ainda validado), `admin:true` com `papel` inconsistente — todos bloqueados.
- **Multi-tenant**: sem vazamento vivo — todo uso de `prisma` global fora de `req.db` tem `empresaId` explícito no `where`.
- **2FA/TOTP/recuperação**: sem achado — confirmado empiricamente (não só leitura) que `twoFactorLimiter` cobre `/2fa/recuperar` via prefix-match.
- **Frontend/CSP/tokens**: sem XSS/CSRF explorável; JWT sem confusão de algoritmo; tokens de propósito único checam `tipo` corretamente.
- **APIs públicas**: OAuth (JWKS+aud+iss+nonce) e webhook Stripe (HMAC+idempotência) sólidos.
- **Achado Categoria A** (§ acima): vazamento de dados em `POST /auth/login`.
- **Achado Categoria C**: corrida de aceite duplo de convite; `/uploads` público.

Nenhum SQLi (`$queryRawUnsafe` só no `SET_EMPRESA` parametrizado), RCE, ou SSRF explorável encontrado.

---

## Detalhe do bloqueador Categoria A

**`chaveiro-bot/src/routes/auth.js:169-186`** (`POST /auth/login`, ramo de login por `telefone`):

```js
const candidatos = /* busca por telefone, sem checar senha ainda */;
if (candidatos.length > 1) {
  return res.json({
    desambiguacao: candidatos.map((c) => ({ usuarioId: c.id, empresa: c.empresa?.nome ?? '—' })),
  });
}
```

A checagem de senha (`bcrypt.compare`, linha 202) só roda **depois** deste `return`, e só quando há exatamente 1 candidato. Um atacante que apenas conheça/adivinhe um número de telefone com contas em 2+ empresas — enviando qualquer `password` (só exige `min(1)`) — recebe, **sem provar nenhuma credencial**: confirmação de que o telefone está cadastrado, o nome de todas as empresas associadas, e o `usuarioId` interno de cada uma. Como a resposta é `200` (sucesso), não conta contra `authLimiter`/`authIpLimiter` (`skipSuccessfulRequests:true`), permitindo varrer números sem o throttling agressivo que se aplica a tentativas de senha errada.

**Impacto**: enumeração de usuário + vazamento de afiliação empresarial (CWE-203/CWE-200, OWASP API4:2023/A07:2021). Não é escalonamento de privilégio nem acesso a dados de outra empresa além do nome — mas é informação que nenhum usuário não-autenticado deveria receber.

**Tarefa objetiva necessária** (não implementada nesta missão — decisão de fluxo de autenticação, material, requer aprovação antes de implementar): mover a decisão de desambiguação para **depois** de validar a senha contra os candidatos (ex.: tentar `bcrypt.compare` contra cada candidato; só then, se mais de um bater, ou se a UX exigir escolha prévia, desenhar uma resposta que não vaze nome de empresa sem prova de senha). Isso muda a lógica do fluxo de login multi-empresa por telefone — não é um ajuste de 1 linha, precisa de desenho cuidadoso para não quebrar o caso legítimo de 1 telefone em N empresas.

---

## Security Hardening Backlog

Ver documento separado: `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md`.

---

## Parecer Final

## Opção B — Frente de Segurança NÃO ENCERRADA

**Pendência Categoria A** (bloqueia imediatamente):
- Vazamento de dados não-autenticado em `POST /auth/login` (desambiguação por telefone). Evidência: `auth.js:169-186`, leitura direta confirmada nesta execução. Impacto: enumeração de usuário + afiliação empresarial sem autenticação. Tarefa objetiva: redesenhar o fluxo de desambiguação para exigir prova de senha antes de revelar nomes de empresa/`usuarioId` — decisão de fluxo de auth, precisa de aprovação explícita antes de implementar (não é um ajuste trivial).

**Pendências Categoria B**: nenhuma restante — a única (billing/google) foi resolvida nesta execução com evidência real de CI (11 testes novos, 132/132 passando).

Todas as demais pendências (§Gate 0) pertencem à Categoria C e não bloqueiam — estão listadas no Security Hardening Backlog.
