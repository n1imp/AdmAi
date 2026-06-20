# Política de Privacidade — ChaveiroBot

> ⚠️ **Aviso:** Este é um **modelo** preparado para o ChaveiroBot. Antes de publicar,
> preencha os campos entre colchetes `[ ]` e **valide com um advogado**. Ele não substitui
> aconselhamento jurídico.

**Última atualização:** [DD/MM/AAAA]
**Versão:** 1.0

---

## 1. Quem somos

O **ChaveiroBot** ("Plataforma", "nós") é um serviço de software (SaaS) que permite a
empresas de chaveiro registrarem serviços de campo via WhatsApp e gerirem receita, comissões,
estoque e avaliações por um painel web.

- **Controlador (dados da conta/empresa-cliente):** [NOME DA EMPRESA OPERADORA], CNPJ [CNPJ],
  com sede em [ENDEREÇO].
- **Encarregado pelo Tratamento de Dados (DPO):** [NOME], e-mail **[privacidade@seudominio.com]**.

Esta Política descreve como tratamos dados pessoais conforme a **Lei nº 13.709/2018 (LGPD)**.

## 2. Papéis (LGPD): controlador x operador

O ChaveiroBot atua em **dois papéis** distintos:

- **Controlador** dos dados de **cadastro e uso da Plataforma** (donos e usuários do painel):
  nome, e-mail, telefone, credenciais, logs de acesso.
- **Operador** dos dados que a **empresa-cliente (chaveiro)** insere sobre **seus próprios
  clientes finais** (ex.: telefone, nome e avaliação do cliente atendido). Nesses casos, a
  **empresa-cliente é a Controladora** e o ChaveiroBot trata os dados **em seu nome**, seguindo
  suas instruções e esta Política.

## 3. Dados que coletamos

### 3.1. Dados de usuários do painel (controlador)
| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Nome, e-mail, telefone | Identificação e contato | Execução de contrato (art. 7º, V) |
| Usuário e senha (hash) / login social | Autenticação e segurança | Execução de contrato / legítimo interesse |
| Segredo de 2FA (cifrado) | Segurança da conta | Legítimo interesse (art. 7º, IX) |
| Logs de acesso, IP, métricas técnicas | Segurança, prevenção a fraude, operação | Cumprimento legal / legítimo interesse |

### 3.2. Dados de clientes finais do chaveiro (operador)
| Dado | Finalidade | Base legal |
|---|---|---|
| Telefone do cliente (WhatsApp) | Envio de mensagem de avaliação do serviço | Definida pela empresa-cliente (Controladora) |
| Nome do cliente | Identificação do atendimento | Idem |
| Foto de evidência do serviço | Comprovação do serviço executado | Idem |
| Nota/avaliação (1–5) e comentário | Pesquisa de satisfação | Idem |

> A empresa-cliente é responsável por obter **consentimento/base legal** dos seus clientes
> finais e por enviar comunicações em conformidade com os Termos do WhatsApp.

## 4. Como usamos os dados

- Operar o registro de serviços, comissões, estoque e avaliações.
- Autenticar usuários e proteger contas (2FA, detecção de abuso, rate limiting).
- Enviar mensagens de avaliação ao cliente final **a pedido da empresa-cliente**.
- Gerar métricas e relatórios agregados de uso e desempenho.
- Garantir segurança, prevenir fraudes e cumprir obrigações legais.

**Não vendemos dados pessoais** e não os usamos para publicidade de terceiros.

## 5. WhatsApp e mensageria

O envio e o recebimento de mensagens ocorrem por meio da **API oficial do WhatsApp
(WhatsApp Business Platform / Meta)**. Ao usar a Plataforma, aplicam-se também as políticas
da Meta. Mensagens proativas usam **modelos (templates) aprovados** e respeitam a janela de
atendimento e o opt-in do destinatário.

## 6. Compartilhamento e operadores (sub-operadores)

Compartilhamos dados apenas com prestadores necessários à operação, sob contrato e dever de
confidencialidade:

| Operador | Finalidade | Dados |
|---|---|---|
| Provedor de hospedagem [ex.: Hetzner/DigitalOcean] | Infraestrutura (servidores, banco) | Todos, em repouso |
| Meta Platforms (WhatsApp) | Envio/recebimento de mensagens | Telefone, conteúdo da mensagem |
| Sentry | Monitoramento de erros (PII filtrada) | Dados técnicos de erro |
| Provedores de login social (Google/Microsoft/Apple) | Autenticação opcional | E-mail verificado |

## 7. Segurança

Adotamos medidas técnicas e organizacionais, incluindo: **criptografia em trânsito (HTTPS/TLS)**,
**criptografia de segredos em repouso (AES-256-GCM)**, hashing de senhas (bcrypt), **2FA**,
isolamento por empresa (multi-tenant), rate limiting, e monitoramento. Nenhum sistema é 100%
seguro; em caso de incidente relevante, comunicaremos os titulares e a **ANPD** conforme a LGPD.

## 8. Retenção e descarte

- Dados de conta: mantidos enquanto a conta estiver ativa e por até **[X meses]** após o
  encerramento, salvo obrigação legal.
- Dados de clientes finais (avaliações, telefones): retidos pelo período definido pela
  empresa-cliente, com padrão de **[180 dias]**, após o qual são anonimizados ou eliminados.
- Logs técnicos: até **[90 dias]**.

## 9. Direitos do titular (LGPD, art. 18)

Você pode solicitar: confirmação de tratamento, acesso, correção, anonimização, portabilidade,
eliminação, informação sobre compartilhamento e revogação de consentimento.

- **Usuários do painel:** exerça os direitos diretamente nas configurações ou via
  **[privacidade@seudominio.com]**.
- **Clientes finais do chaveiro:** as solicitações devem ser direcionadas à **empresa de
  chaveiro** (Controladora). Encaminharemos a ela quando recebidas por nós.

Prazo de resposta: até **15 dias**.

## 10. Cookies e tecnologias similares

O painel usa armazenamento local/cookies estritamente necessários para **sessão e
autenticação**. [Descreva aqui eventuais cookies de analytics, se aplicável.]

## 11. Crianças e adolescentes

A Plataforma é destinada a uso profissional por maiores de 18 anos. Não coletamos
intencionalmente dados de menores.

## 12. Alterações

Podemos atualizar esta Política. Mudanças relevantes serão comunicadas pelo painel ou por
e-mail, com nova data de "Última atualização".

## 13. Contato

Dúvidas sobre privacidade: **[privacidade@seudominio.com]**.
Encarregado (DPO): **[NOME]** — **[email]**.
Autoridade Nacional de Proteção de Dados (ANPD): https://www.gov.br/anpd
