# Reconciliação linha a linha — GO_LIVE / LAUNCH / BUGLIST  (F6-09, 2026-08-23)

Cada item ABERTO dos documentos operacionais recebe uma disposição explícita. A regra é
referenciar a linha, nunca duplicar o conteúdo — os documentos continuam sendo a fonte.
`ZERO_FORGOTTEN_BLOCKER`: nada daqui fica sem dono ou sem condição de revisita.

**Baldes de disposição**

- **D2-DECISÃO** — depende de decisão do usuário (custo, negócio, jurídico).
- **D2-PROVISIONAMENTO** — depende de deploy/infra que não existe (sonda F5: Railway sem
  serviços; `admai-staging` pausado; provisionar é ato com custo → proposta, nunca unilateral).
- **PROVADO-LOCAL** — o comportamento já tem prova local nesta execução; falta apenas a
  repetição em produção pós-deploy (smoke), que herda o bloqueio de provisionamento.
- **EXTERNO** — ação em plataforma de terceiro (Google Play) que só o usuário pode executar.

## GO_LIVE_CHECKLIST.md (16 abertos)

| Linha | Item | Disposição |
| --- | --- | --- |
| 47 | A5 DNS/domínio | **D2-DECISÃO** — domínio não decidido; bloqueia também sitemap/og:url (F6-02) |
| 53 | A7 Backups produção | **D2-DECISÃO** — Q-010 (Pro/PITR ou cron); drill local provado (F6-07, RUNBOOK) |
| 63 | A8 Sentry DSN | **D2-PROVISIONAMENTO** — sem DSN não há monitoramento; matriz LGPD anotou Sentry como não-medido local |
| 85 | B1 Legal com advogado | **D2-DECISÃO** — GAP-LEGAL-MODELO-01 (decisão do usuário 2026-08-23: mantém bloqueado) |
| 87 | B2 Legais acessíveis em prod | **PROVADO-LOCAL** (rotas públicas + noindex/robots F6-02) → smoke pós-deploy |
| 89 | B3 Canal de suporte publicado | **D2-DECISÃO** — canal (e-mail/WhatsApp) é escolha operacional do usuário |
| 97-102 | C1-C5 Build Android/Capacitor | **EXTERNO/D2** — exige máquina com Android Studio + keystore do usuário; fora do caminho web-release |
| 109-119 | D1-D5 Google Play | **EXTERNO** — conta, ficha, revisão do Google: atos do usuário na plataforma |

## LAUNCH_CHECKLIST.md (13 abertos — smoke de produção, linhas 331-343)

| Linha | Smoke | Disposição |
| --- | --- | --- |
| 331 | /health em produção | **D2-PROVISIONAMENTO** (não há produção deployada verificável) |
| 332-333 | Cadastro + verificação de e-mail | **PROVADO-LOCAL** (jornada F5 onboarding; e-mail real depende de provider em prod) |
| 334 | Refresh silencioso | **PROVADO-LOCAL** (interceptor testado unit + jornadas) |
| 335 | Esqueci a senha ponta a ponta | **PROVADO-LOCAL** (fluxo e estados SL-03/07; envio real de e-mail depende de prod) |
| 336 | 2FA + 10 códigos | **PROVADO-LOCAL** (F4-01 loop completo pela API real) |
| 337 | Magic link | **PROVADO-LOCAL** (estados medidos; envio real depende de prod) |
| 338-339 | Stripe checkout + webhook | **PROVADO-LOCAL** (HMAC real + matriz 402 + página /assinatura; checkout vivo exige Stripe prod = D2) |
| 340 | Banner + PostHog só com consentimento | **PROVADO-LOCAL** (matriz LGPD F4-04 por rede real) |
| 341 | Crisp abre em /ajuda | **PROVADO-LOCAL** (gate SL-05; tag carrega só com consentimento — medido) |
| 342 | Status page | **D2-DECISÃO** — status.barbers-flow.com nunca foi provisionada; decidir se entra no go-live |
| 343 | Convite por e-mail | **PROVADO-LOCAL** (aceite + corrida SEC-HB-01; e-mail real depende de prod) |

## LAUNCH_PLAN.md / BUGLIST.md

Zero checkboxes abertos. BUGLIST: todos os itens listados já constam como resolvidos no
próprio documento ou viraram achados do registry (fechados em F2/F3).

## F6-10 — F-MAR-071 (ponto de imposição do write-set gate)

**Avaliação**: impor a declaração ANTES da escrita exigiria hook de ferramenta (pre-write) —
vetado pela governança deste fluxo (`CLAUDE.md`: sem hooks novos). O ponto barato que EXISTE é
a detecção pós-hoc no fechamento (`--fechar` compara declarado × observado), e a sessão provou
que ele pega: 3 violações reais detectadas e reconciliadas (SL-03 registry omitido; F6-SEO
caminho por palpite; F6-PERF dist/ não declarado), nenhuma passou em silêncio.
**Decisão**: manter a imposição pós-hoc + as correções de processo já registradas (verificar
caminho antes de declarar; fatia com build declara dist/). Revisita: se o fluxo ganhar CI
próprio, o gate entra como job (imposição sem hook local).
