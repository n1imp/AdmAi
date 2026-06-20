# Política de Segurança — ChaveiroBot

Levamos a segurança a sério. Esta política descreve como **reportar vulnerabilidades** e o que
esperar do nosso processo.

## Como reportar

- **E-mail:** [seguranca@seudominio.com] (preferencial)
- **Assunto sugerido:** `[SECURITY] <resumo curto>`
- Se possível, cifre a mensagem com nossa chave PGP: [link/fingerprint da chave PGP].

**Por favor, não** abra issues públicas para falhas de segurança. Use o canal privado acima
(ou o recurso *Private vulnerability reporting* do GitHub, se habilitado).

### O que incluir no relato
- Descrição da vulnerabilidade e impacto potencial.
- Passos para reproduzir (PoC), versão/commit afetado e ambiente.
- Eventuais logs, requisições ou capturas relevantes (sem expor dados de terceiros).

## Nosso compromisso

| Etapa | Prazo alvo |
|---|---|
| Confirmação de recebimento | até **48h úteis** |
| Avaliação inicial e severidade | até **5 dias úteis** |
| Correção / mitigação | conforme severidade (crítica: o mais rápido possível) |
| Comunicação de resolução | após a correção |

Praticamos **divulgação coordenada**: pedimos que você nos dê um prazo razoável para corrigir
antes de tornar a falha pública. Reconheceremos publicamente sua contribuição, se desejar.

## Escopo

**No escopo:** backend (`chaveiro-bot`), painel (`chaveiro-painel`), webhook do WhatsApp,
autenticação (JWT/2FA/OAuth), isolamento multi-tenant e a infraestrutura sob nosso controle.

**Fora do escopo:** serviços de terceiros (WhatsApp/Meta, provedores de nuvem, Sentry),
ataques de engenharia social, DoS volumétrico, e relatórios automatizados sem prova de impacto.

## Boas práticas que já adotamos

- HTTPS/TLS em trânsito; segredos cifrados em repouso (AES-256-GCM).
- Hash de senhas com bcrypt; **2FA TOTP**; invalidação de sessões (`tokenValidoApos`).
- Isolamento por empresa (multi-tenant) com proteção anti-IDOR.
- Rate limiting nos fluxos de autenticação e webhook; validação HMAC/assinatura.
- `helmet` (CSP/HSTS), CORS com allow-list, validação de input com Zod.
- `npm audit --audit-level=high` no CI.

## Versões suportadas

| Versão | Suporte de segurança |
|---|---|
| `1.x` (atual) | ✅ |
| `< 1.0` (pré-release) | ❌ |

Obrigado por ajudar a manter o ChaveiroBot e seus usuários seguros. 🙏
