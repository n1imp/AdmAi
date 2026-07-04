# Contribuindo com o AdmAi

Obrigado por contribuir! Este guia resume as convenções do projeto. Para o contexto técnico
completo, leia o [README](README.md) (em especial a seção *Guia para IAs & Agentes*) e o
[CLAUDE.md](CLAUDE.md).

## Pré-requisitos

- **Node.js 20+**, **Docker + Docker Compose**, **PostgreSQL 16** (via Docker).
- Idioma do projeto: **português (pt-BR)** em código, comentários, UI, mensagens do bot e commits.

## Subindo o ambiente

```bash
# Backend
cd chaveiro-bot
cp .env.example .env          # preencha com valores locais
docker-compose up -d postgres redis
npm install
npx prisma migrate dev
npm run dev                   # http://localhost:3000

# Frontend (outro terminal)
cd chaveiro-painel
cp .env.example .env          # opcional (login social)
npm install
npm run dev                   # http://localhost:5173
```

## Fluxo de trabalho (Git)

1. Crie uma branch a partir de `master`: `feat/...`, `fix/...`, `docs/...`, `refactor/...`.
2. Faça commits pequenos e descritivos.
3. Abra um Pull Request para `master` com descrição do que mudou e por quê.
4. O **CI precisa estar verde** antes do merge — o check `ci-ok` agrega **lint + testes
   (unit + integração) + build + `docker build` do backend + audit**. Ver [`docs/CI_CD.md`](docs/CI_CD.md).
5. **Merge:** use **squash** na `master`. O merge dispara o **deploy automático** (Railway p/ o
   backend, Cloudflare Pages p/ o painel) — não há passo manual de deploy da web.

### Convenção de commits

Usamos um estilo próximo a [Conventional Commits](https://www.conventionalcommits.org/pt-br/),
em pt-BR:

```
feat(painel): adiciona tela de configuração de WhatsApp
fix(bot): corrige cálculo de comissão quando material é zero
docs: adiciona política de privacidade
```

> **Não** adicione o trailer `Co-Authored-By` a menos que `.claude/settings.json` habilite
> `attribution.commit`.

## Padrões de código (não regredir)

- **Multi-tenancy**: toda query de dados de negócio usa **`req.db`** (escopado por empresa),
  nunca o `prisma` global. Valide IDs recebidos do cliente antes de usar. Veja
  [db/tenant.js](chaveiro-bot/src/db/tenant.js).
- **Validação de input** com **Zod no boundary** (toda rota que recebe body/params/query).
- **Schema mudou?** Sempre gere migration: `npx prisma migrate dev`.
- **Segurança**: nunca logue senhas, tokens, segredos TOTP ou apikeys. Segredos por empresa
  ficam **cifrados**. Não enfraqueça rate limiters de `auth/*` nem a validação do webhook.
- **Contrato 401 vs 400**: nos fluxos de 2FA/OAuth, falhas de código retornam **400** (não 401)
  de propósito — não altere.
- Arquivos **< 500 linhas**; prefira **editar** a criar; **não** crie docs sem necessidade.
- Reuse utilitários existentes (ver *Padrões a reusar* no README) em vez de reinventar.

## Testes

Antes de abrir o PR:

```bash
# Backend
cd chaveiro-bot
npm run lint              # ESLint (gateado no CI)
npm test                  # unitários (Vitest)
npm run test:integration  # integração (Supertest + Postgres real) — se mexeu em rota/DB

# Frontend
cd chaveiro-painel
npm run lint              # ESLint (gateado no CI)
npm test                  # Vitest + Testing Library
npm run build             # build de produção
```

## Reportando bugs e segurança

- **Bugs**: abra uma issue com passos para reproduzir, comportamento esperado e real, ambiente.
- **Vulnerabilidades**: **não** abra issue pública — siga o [SECURITY.md](SECURITY.md).

## Checklist do PR

- [ ] Li o arquivo antes de editar.
- [ ] Queries de negócio passam por `req.db` e IDs do cliente foram validados.
- [ ] Input validado com Zod no boundary.
- [ ] Mudou o schema? Gerei a migration.
- [ ] `npm test` (e `test:integration` se aplicável) passam no backend.
- [ ] `npm test` + `npm run build` passam no painel.
- [ ] Atualizei o `CHANGELOG.md` (seção *Não lançado*) quando relevante.

### Segurança (não regredir)

- [ ] Endpoint sensível novo (auth/2FA/OTP/upload) tem **rate limit** dedicado.
- [ ] Não logo segredos/PII (o `logger` redige chaves sensíveis — não burle).
- [ ] Upload de imagem valida **magic bytes** (`utils/upload.js`), não só o MIME do data-URL.
- [ ] Mudança de RBAC/permissão deixa **trilha de auditoria** no log.
- [ ] Em produção, `ALLOWED_ORIGIN` é explícito (sem wildcard).
- [ ] O CI de segurança (`.github/workflows/security.yml`: Semgrep + gitleaks + audit) passa.
