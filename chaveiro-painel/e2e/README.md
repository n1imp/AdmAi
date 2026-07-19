# E2E do painel (Chrome headless + CDP)

E2E dos fluxos **F9/M1–M4** dirigindo Chrome headless via **CDP** (Chrome DevTools Protocol).
Decisão registrada em `.ai/decisions/DEC-20260719-E2E-CDP.md`.

## Arquitetura (self-contained, sem backend)

`run.mjs` sobe um **servidor HTTP próprio** que:

- serve o build (`../dist`, com SPA fallback para `index.html`);
- responde às rotas `/api/*` com **mocks determinísticos** (inclui casos flag on/off);
- devolve **404 em `/sw.js`** para desativar o service worker (senão o SW do PWA intercepta
  `/api` e as chamadas nunca chegam ao mock).

Os papéis são simulados por um **JWT falso** em `localStorage` (sem login real). Como as
respostas são HTTP reais, o axios (XHR) funciona sem a flakiness de mockar XHR por CDP.

## Como rodar (local)

```bash
# O build PRECISA usar a API relativa para o axios bater no servidor de mock do harness:
VITE_API_URL=/api npm run build
npm run e2e
```

> ⚠️ Se o build usar um `VITE_API_URL` absoluto (ex.: `.env.production`), o axios chama a API
> externa e o e2e falha por timeout — por isso o `VITE_API_URL=/api` acima.

Env: `CHROME_PATH` (override do binário do Chrome), `E2E_DEBUG=1` (loga requests/responses).
Em falha, um screenshot é salvo em `e2e/e2e-falha.png`.

## Cobertura atual

- **M1** MeuPainel (papel funcionário): monta a home + KPIs do período renderizam após `/me/metricas`.
- **M4** Documentos: lista o documento (flag on) · formulário de envio presente · degrada para
  "Documentos indisponíveis" quando `/me/documentos` responde 404 (flag off).

Próximo incremento (mesma plumbing, asserts por texto/role): **M2** (indicadores + presença do
gestor) e **M3** (serviço atual / iniciar-concluir).

## CI

Roda no job `frontend` como passo **não-bloqueante** (`continue-on-error`), buildando com
`VITE_API_URL=/api` e usando o `google-chrome-stable` do runner. Sobe para bloqueante por marco.
