# ADMAI_PRODUCT_GLOSSARY

Linguagem canônica do produto. A tradução DTO→experiência acontece no application layer/view
model: o domínio não muda para a UI falar melhor. Inconsistência de verbo/rótulo é bug de
produto tão real quanto layout quebrado — e elimina "cara de IA" tanto quanto o visual.

## Verbos canônicos (botões/ações)

| ação | verbo canônico | proibidos (sem razão) |
| --- | --- | --- |
| criar recurso novo | **Registrar serviço** · **Adicionar técnico** · **Adicionar usuário** | Novo/Criar/Cadastrar misturados |
| enviar arquivo | **Enviar documento** | Upload, Anexar |
| salvar edição | **Salvar** | Atualizar, Aplicar, Confirmar (fora de confirmação) |
| decidir aprovação | **Aprovar** / **Rejeitar** | Aceitar/Recusar/Negar |
| remover (recuperável ou próprio do tour) | **Remover** | Deletar |
| destrutivo irreversível (conta, anonimizar) | **Excluir** (+confirmação proporcional ao risco) | — |
| bater ponto | **Bater ponto** | Registrar ponto, Check-in |
| autenticar | **Entrar** / **Sair** | Login/Logout no texto visível |
| repartição | **Calcular** · **Exportar PDF** | Gerar |
| tentar de novo após erro | **Tentar novamente** | Recarregar, Refresh |

## Status de serviço (domínio → rótulo humano)

| domínio (backend) | rótulo no produto | semântica de cor |
| --- | --- | --- |
| `rascunho` | Rascunho | neutra |
| `aguardando` | Aguardando aprovação | atenção (única no card, não carnaval) |
| `ativo` (aprovado) | Aprovado | positiva discreta |
| `rejeitado` | Rejeitado | crítica |

`PENDENTE` cru NUNCA aparece ao usuário. Status é o ÚNICO chip semântico do card de serviço.

## Erros (taxonomia → mensagem segura)

| classe | mensagem base | nunca |
| --- | --- | --- |
| NETWORK_ERROR | "Sem conexão. Verifique sua internet e tente novamente." | stack/URL |
| AUTH_REQUIRED | (fluxo de login — sem texto assustador) | "token inválido" |
| PERMISSION_DENIED | "Você não tem permissão para isso." | detalhes de RBAC |
| VALIDATION_ERROR | mensagem por campo, vinculada ao campo | lista solta no topo |
| NOT_FOUND | "Não encontramos este item. Ele pode ter sido removido." | id interno |
| CONFLICT | mensagem específica do negócio (ex.: "Este usuário já existe.") | erro cru |
| RATE_LIMIT | "Muitas tentativas. Aguarde um instante." | números internos |
| SERVER_ERROR / DEPENDENCY_UNAVAILABLE | "Não foi possível concluir. Tente novamente em instantes." (+id de correlação quando confiável, como referência de suporte) | provider internals, secret |

Backend segue autoridade; application layer traduz. Correlation ID exposto SÓ como referência.

## Vazios (o que houve · o que significa · o que fazer — CTA só com permissão)

Padrão: "Nenhum serviço encontrado" + orientação ("Tente ajustar os filtros ou registre um novo
serviço.") + CTA condicionada à permissão. Já canônicos no produto: "Nenhum serviço encontrado",
"Nenhum técnico cadastrado". Manter tom direto, sem mascote/ilustração decorativa.

## Dinheiro, data e números

- Dinheiro: `formatarMoeda` central (R$ 1.234,56); **numerais tabulares** em colunas/totais
  financeiros; nunca truncar centavos em contexto financeiro.
- Data: `formatarData` (dd/mm/aaaa hh:mm) e `formatarDataCurta` (dd/mm); ausência = "—";
  TIMEZONE: uma política única (fundação temporal — pré-requisito da futura AGENDA).
- Contagens: "3 registros"/"1 registro" com plural correto (padrão atual preservado).

## Segurança (linguagem)

Clareza + consequência + status + ação precisa; sem estética "cyber". Danger visual SÓ em ação
materialmente perigosa (excluir conta, sair de todos os dispositivos). Recovery codes: nunca em
logs/analytics (contrato existente preservado).

## RESERVED_FUTURE (não aparecem no produto atual)

`Cliente` · `Orçamento` · `Agendamento` · `Garantia` · `Retrabalho` · `Categoria de serviço` ·
`Conversa` (WhatsApp) · `Avaliação` (Reviews) · `Notificação` (central) · `Plano/Assinatura`
(fora do MVP, D2 1.1.0). Uso antecipado de qualquer um em UI corrente = violação de
NO_PREMATURE_FUTURE_IMPLEMENTATION.
