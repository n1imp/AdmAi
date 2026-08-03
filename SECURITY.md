# Política de Segurança — AdmAi

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

## Riscos aceitos e documentados

Nem toda escolha de design elimina um risco por completo — algumas são decisões conscientes,
avaliadas e aceitas em troca de simplicidade ou compatibilidade. Registramos aqui as que
afetam diretamente a segurança do usuário, para que sejam avaliadas por quem reporta uma
vulnerabilidade relacionada, não descobertas como se fossem descuido.

**Token de acesso em `localStorage` (painel web).** O JWT de sessão do painel
(`chaveiro-painel`) é armazenado em `localStorage`, não em cookie `httpOnly`. Essa é uma
decisão aceita nesta frente de segurança (não uma omissão): a alternativa (token só em
memória + renovação via cookie `httpOnly`) exige uma reestruturação maior do cliente HTTP e
foi tratada como iniciativa separada, fora do escopo já entregue.

O que já mitiga esse risco hoje:
- O **refresh token**, ao contrário do token de acesso, já usa cookie `httpOnly` (não é
  acessível via JavaScript, mesmo sob XSS).
- A Content-Security-Policy do painel reduz a superfície de um XSS que tentasse ler o
  `localStorage` — **CSP reduz, não elimina** esse risco; nenhum vetor de XSS foi encontrado
  no código atual do painel em auditoria, mas isso não é uma garantia permanente contra
  vulnerabilidades futuras.

Se você reportar um XSS real no painel, o impacto de exfiltração do token de acesso via
`localStorage` já é um risco conhecido e assumido — reporte mesmo assim, o XSS em si
continua sendo uma vulnerabilidade séria a corrigir.

## Versões suportadas

| Versão | Suporte de segurança |
|---|---|
| `1.x` (atual) | ✅ |
| `< 1.0` (pré-release) | ❌ |

Obrigado por ajudar a manter o AdmAi e seus usuários seguros. 🙏
