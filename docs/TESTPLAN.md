# TESTPLAN — Fase 2 (Testes funcionais)

Plano de testes por fluxo, para rodar **depois de o app estar estável** (Fase 1 concluída). Cada caso: papel(is), plataforma, pré-condições, passos, resultado esperado. **Duas passadas separadas: desktop primeiro, mobile depois.**

## Ambiente & credenciais

- Local: backend `:3000` (Postgres/Redis), painel `:5173` (proxy `/api`). Zero mutação contra prod.
- Usuários de teste: **dono** `dono/Dono@123456` · **gestor** `gestor/Gestor@123456` · **funcionário** `func/Func@123456`. Técnico com PIN: criar via `POST /api/tecnicos` (retorna PIN; trocar senha provisória no 1º acesso).
- Legenda plataforma: 🖥️ desktop · 📱 mobile · 🔁 ambos. Status: ✅ passou · ❌ falhou · ⏭️ pulado.
- Formato de evidência por caso: status+payload da API (aba Network/console), screenshot quando relevante, camada da causa se falhar.

## Matriz-resumo (fluxo × papel × plataforma)

| Fluxo | dono | gestor | funcionário | Plat. |
|-------|------|--------|-------------|-------|
| A. Login/logout/refresh | sim | sim | sim (PIN) | 🔁 |
| B. RBAC de navegação e API | total | parcial | mínimo | 🔁 |
| C. Ponto (clock-in/out) | — | — | ✅ (tecnicoId) | 📱 (nativo) / 🖥️ (fallback) |
| D. Serviços + aprovação | criar/aprovar | criar/aprovar | criar→pendente | 🔁 |
| E. Estoque/materiais | ✅ | ✅ | — | 🔁 |
| F. Dashboard/métricas | ✅ | ✅ | MeuPainel | 🔁 |
| G. Avaliações + Google (B1) | ✅ | ✅ | — | 🔁 |
| H. Billing/Stripe | ✅ | — | — | 🖥️ |
| I. Responsividade/PWA | ✅ | ✅ | ✅ | 🔁 |

---

## A. Autenticação & sessão

**A1 — Login por usuário/senha** 🔁 · dono/gestor/func
Passos: `/login` → USUÁRIO → credenciais → ENTRAR. Esperado: 200, redireciona (dono/gestor→Dashboard, func→MeuPainel), token em `localStorage.admai_token`.

**A2 — Login por telefone + desambiguação** 🔁 · técnico
Pré: técnico com acesso PIN. Passos: aba TELEFONE → telefone+PIN. Esperado: se `senhaProvisoria`, força `/trocar-senha`; se mesmo telefone em 2 empresas → tela de desambiguação.

**A3 — Rotação de refresh token** 🔁 · qualquer
Passos: logar, esperar/forçar expirar o access token (1h) e disparar uma chamada. Esperado: interceptor faz `POST /api/auth/refresh` (cookie HttpOnly) → novo token → retry transparente (sem deslogar). **Testar também:** falha de refresh → limpa sessão + `/login`.

**A4 — 2FA (TOTP e telefone)** 🖥️ · usuário com 2FA ligado
Passos: login → desafio 2FA → código. Esperado: código errado 401 (não 400 — contrato do README); rate-limit por desafio após 5 tentativas.

**A5 — Recuperar/redefinir senha, magic link, verificar e-mail, aceitar convite** 🖥️
Nota: **RESEND é placeholder** em prod → e-mails não saem. Testar via token gerado (logs) ou mock. Esperado: fluxos completam com token válido; expirado/reused → erro tratado.

**A6 — Logout e logout-all** 🔁
Esperado: logout limpa token+cookie; `/me/logout-all` invalida sessões e refresh tokens (tokens antigos deixam de valer — `tokenValidoApos`).

---

## B. RBAC (navegação + API) — cobre os fixes B2/B3

**B1 — Menu por papel** 🔁
Esperado: funcionário vê só Início/MeuPainel/MeuPonto/MeusServiços; gestor sem Usuários/Configuração; dono tudo. (UI esconde por permissão.)

**B2 — Deep-link a rota não permitida** 🔁 · func/gestor
Passos: como func, navegar direto a `/servicos`, `/tecnicos`, `/estoque`. Esperado: a página pode renderizar (gating de rota só em `/configuracao/usuarios`), mas as chamadas API retornam **403** e a UI mostra erro/vazio — **nunca dado de outro papel**.

**B3 — Enforcement na API (regressão dos fixes)** 🔁 · func
Esperado (confirmar): `GET /api/usuarios` 403 · `GET /api/dashboard` 403 · `POST /api/whatsapp/cloud/credenciais` **403** (B2) · `GET /api/google/reviews` **403** (B3) · `POST /api/google/reviews/:id/responder` **403**. dono/gestor: 200 nas de avaliações.

**B4 — Isolamento de tenant (IDOR)** 🖥️ · dono de 2 empresas
Passos: logar tenant A; tentar `GET/PATCH/DELETE` recurso (tecnico/servico/material/selfie) por **id do tenant B**. Esperado: **404** em todos (extensão `req.db`). *(Coberto por `test/integration/idor.test.js` no CI.)*

---

## C. Ponto (clock-in/out)

**C1 — Ciclo completo** 📱/🖥️ · funcionário (com tecnicoId)
Passos: MeuPonto → Entrada → Saída almoço → Volta → Saída. Esperado: state machine avança; horários **server-side**; `jaCompleto` no fim; totais/hora-extra calculados.

**C2 — Selfie + geolocalização** 📱 (device) / 🖥️ (fallback)
Passos: bater ponto → conceder câmera+GPS. Esperado: selfie capturada (base64) + lat/lng enviados; batida guarda evidência. **Fallback:** negar câmera → `<input capture>`; negar GPS → registra sem GPS (toast). **Decisão aceita (L3):** selfie/geo são **opcionais** — bater sem elas retorna 201.

**C3 — Recuperação da selfie autorizada** 🖥️
Esperado: `GET /api/ponto/selfie/:arquivo` só serve para dono/`ponto:ver` do **mesmo tenant**; cross-tenant → 404; `Cache-Control: private, no-store`.

**C4 — Mobile nativo (Capacitor)** 📱 device Android — **⚠️ só em device real**
Verificar: `getUserMedia`/`geolocation` no WebView; e se o **CapacitorHttp** quebra o refresh via cookie (lead L2 — pode deslogar no app).

---

## D. Serviços & aprovação

**D1 — Criar serviço (dono/gestor)** 🔁
Passos: NovoServiço → dados + MaterialPicker + técnico → salvar. Esperado: status `ativo`; baixa de estoque; comissão/valor líquido calculados; agenda avaliação.

**D2 — Criar serviço (funcionário) com aprovação ligada** 🔁
Pré: `Empresa.aprovacaoServico=true`. Esperado: status `pendente`; **sem** baixa de estoque/comissão; toast "Enviado para aprovação".

**D3 — Aprovar / rejeitar** 🔁 · dono/gestor
Passos: Aprovações → aprovar / rejeitar. Esperado: aprovar → `ativo` + baixa de estoque + `aprovadoPor/Em`; rejeitar → `rejeitado`; card sai da fila **após confirmação do servidor** (pessimista — L6); reaprovar já-aprovado → 409.

**D4 — Listar/paginar/excluir** 🔁
Esperado: `/servicos` pagina (limit 15, "carregar mais" acumula); excluir espera o DELETE e só então remove da UI (erro → item fica).

---

## E. Estoque & materiais 🔁 · dono/gestor
**E1** CRUD de material + upload de imagem (magic-byte check). **E2** Movimentação de estoque + alertas de mínimo. **E3** Relatório PDF por período. Esperado: saldos corretos; upload rejeita não-imagem.

## F. Dashboard & métricas 🔁
**F1 — Dashboard (dono/gestor):** períodos (hoje/semana/mês/custom); KPIs (receita bruta/líquida, ticket, comissões) + comparativo; gráficos recharts (barras/pizza/linha). Esperado: números batem com os serviços `ativo` do período; degrada se `/avaliacoes` falhar.
**F2 — MeuPainel (funcionário):** comissão a receber/ganha, meta mensal, aviso de pendentes.

## G. Avaliações & Google 🔁 — **valida o fix B1**
**G1** aba **CLIENTE**: lista/filtra (todas/respondidas/enviadas/agendadas). **G2** aba **GOOGLE**: agora carrega **200** (antes 404) — mostrar status "não conectado" (sem creds) sem crash; func **não** acessa (403, B3). **G3** aba SOLICITAÇÃO.

## H. Billing/Stripe 🖥️ · dono
**H1** checkout (`/api/billing/checkout`), **H2** portal, **H3** webhook (`POST /webhook/stripe`, raw body) — usar Stripe CLI/test mode. Esperado: `Assinatura` atualiza nos 5 eventos.

## I. Responsividade & PWA 🔁

**Passada mobile (📱 ~390px):** BottomNav fixo (touch ≥44px, safe-area), sem overflow horizontal, bottom-sheets. **Pinch-zoom agora funciona** (fix L7). Safe-area no topo (notch) — confirmar em device.
**Passada desktop (🖥️ ≥1024px):** Sidebar fixa, `max-w-6xl` centralizado, gráficos em `ResponsiveContainer`, nomes longos no eixo Y não truncam.
**PWA:** manifest "AdmAi", ícones 192/512 presentes, service worker em prod, instalável no Android.

---

## Sequência de execução sugerida
1. 🖥️ **Desktop** — A → B → D → E → F → G → H → I(desktop).
2. 📱 **Mobile** (emulação Chrome p/ layout) — A → B → C(fallback) → D → F → I(mobile).
3. 📱 **Device Android real** — C2/C4 (câmera/GPS/Capacitor), refresh no app, instalação PWA.
4. **CI** — `test:integration` (B4 IDOR/auth) roda no PR.

Resultados vão para uma cópia desta matriz com ✅/❌ + evidência; falhas viram entradas no `BUGLIST.md`.

---

## Resultados — passada DESKTOP (2026-07-07, 🖥️ 1568×778, Chrome)

| Caso | Resultado | Evidência |
|------|-----------|-----------|
| A1 login **dono** | ✅ | 200 → `/` PAINEL; sidebar completa |
| A1 login **funcionário** | ✅ | 200 → `/` **MeuPainel** ("Olá, técnico"); sidebar mínima (Meu painel/serviços/ponto/Config) |
| B1(menu) RBAC de navegação | ✅ | func **não** vê Serviços/Técnicos/Avaliações/Usuários |
| F1 Dashboard (dono) | ✅ | KPIs + período + gráficos renderizam (R$0 — DB novo) |
| F2 MeuPainel (func) | ✅ (com ressalva) | atalhos ok; **`/me/metricas` 400** (func sem técnico vinculado) → banner degrada ok, sem crash |
| G1 Avaliações → CLIENTE | ✅ | aba renderiza (sem avaliações) |
| **G2 Avaliações → GOOGLE (valida B1)** | ✅ | `GET /api/google/status` **200** + `/reviews` **200** (era 404); painel Google + 3 reviews mock renderizam |
| I(desktop) login/layout | ✅ | showcase pane + sidebar fixa + `max-w` centralizado |

**Observação (UX, não-bug):** funcionário **sem técnico vinculado** → `/me/metricas` **400** com mensagem genérica ("Não foi possível carregar suas métricas"). Estado incomum (funcionário normal é técnico via `criarAcesso`); mensagem poderia ser específica.

**Não executados nesta passada** (para próxima): A3 rotação de refresh, A4 2FA, D2/D3 criar→aprovar/rejeitar, E estoque, H billing, B4 IDOR (roda no CI).

**Nota de ferramenta:** o renderer do Chrome congelou em algumas navegações (`/login`) — screenshot repetido recupera. Não é bug do app (limitação da automação nesta sessão).
