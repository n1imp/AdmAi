# rounds/ — Documento oficial de cada rodada

Um arquivo por rodada. Consolidado **pelo orquestrador** a partir dos relatórios em `evidence/`
e das respostas do usuário. Agentes não editam estes documentos.

## Rodadas

| Arquivo | Tema | Estado |
|---|---|---|
| `01_PRODUCT_SYSTEM_AND_CROSS_CUTTING_RULES.md` | Constituição Funcional do Produto, Papéis, Navegação e Regras Transversais (DEC-001) | ver o cabeçalho do próprio documento |

> **Nomenclatura:** o bootstrap desta pasta previu o padrão `ROUND-XX-<TEMA>.md`. Na abertura da
> Rodada 1 o usuário determinou o nome exato `01_PRODUCT_SYSTEM_AND_CROSS_CUTTING_RULES.md`.
> A instrução do usuário prevalece; o padrão de nomenclatura passa a ser
> `NN_<TEMA_EM_MAIÚSCULAS>.md`, e esta tabela é o índice autoritativo.

---

## Estados permitidos

| Estado | Significado |
|---|---|
| `DESCOBERTA NÃO INICIADA` | Documento criado, investigação não começou |
| `DESCOBERTA EM ANDAMENTO` | Agentes rodando / consolidação em curso |
| `AGUARDANDO RESPOSTA DO USUÁRIO` | Lote de perguntas entregue, aguardando |
| `ESPECIFICAÇÃO EM REVISÃO` | Revisão adversarial em curso |
| `ESPECIFICAÇÃO APROVADA PELO USUÁRIO` | Só com aprovação expressa (ver abaixo) |
| `BLOQUEADA` | Impedimento registrado, com causa e o que a destravaria |

Uma rodada só recebe `ESPECIFICAÇÃO APROVADA PELO USUÁRIO` após: ambiguidades materiais
resolvidas · dependências mapeadas · revisão adversarial concluída · critérios de aceite
objetivos · **aprovação expressa do usuário sobre o documento**.

---

## Esqueleto obrigatório (30 seções)

```markdown
# ROUND-XX — <TEMA>

## 1. Identificação e status
| Campo | Valor |
|---|---|
| Rodada | XX |
| Tema | |
| Estado | |
| Data de abertura | |
| Commit-base | |
| Agentes utilizados | |
| Aprovação do usuário | (data + citação literal, ou "não aprovada") |

## 2. Objetivo da rodada
## 3. Escopo
## 4. Fora de escopo
## 5. Agentes utilizados
## 6. Evidências do repositório
## 7. Comportamento atual
## 8. Usuários e papéis afetados
## 9. Necessidades do usuário
## 10. Problemas e causas
## 11. Hipóteses iniciais
## 12. Perguntas e respostas
## 13. Alternativas avaliadas
## 14. Pesquisa de referências
## 15. Decisões aprovadas
## 16. Decisões substituídas
## 17. Fluxos principais
## 18. Estados da interface
## 19. Casos extremos
## 20. Regras de dados
## 21. Segurança e privacidade
## 22. Acessibilidade e mobile
## 23. Dependências entre módulos
## 24. Preparação para funcionalidades futuras
## 25. Critérios de aceite
## 26. Estratégia de testes
## 27. Promoção local → staging → produção
## 28. Itens adiados
## 29. Questões abertas
## 30. Parecer de prontidão
```

---

## Lembretes normativos por seção

- **§6 e §7** — comportamento atual vem do **código**, não de relatório. Todo item com
  `arquivo:linha`.
- **§12** — perguntas em lotes de 5 a 8, cada uma com contexto, por que importa, opções,
  prós/contras, recomendação inicial e campo livre. Nenhuma resposta é atribuída ao usuário sem
  citação literal.
- **§19** — cobrir o checklist de investigação minuciosa do protocolo (§8): primeiro uso, retorno
  ao fluxo, edição, cancelamento, exclusão, desativação, duplicidade, concorrência, falha de rede,
  falha de backend, carregamento lento, dados incompletos, dados inválidos, permissões
  insuficientes, sessão expirada, botão Voltar, link direto, mobile, desktop, acessibilidade,
  auditoria, notificações, sincronização entre telas, compatibilidade com dados existentes.
- **§23** — cruzar com `00_DEPENDENCY_MAP.md`; qualquer novo acoplamento volta para lá.
- **§25** — critério objetivamente verificável. "Deve ser rápido" não é critério; um limiar é.
- **§26 e §27** — declarar explicitamente todo nível de teste **indisponível**. Limitação
  ambiental nunca equivale a teste aprovado. Staging de aplicação **não existe**: sua criação é
  pré-requisito, e local nunca é tratado como equivalente.
- **§30** — parecer de prontidão é do orquestrador, não substitui a aprovação do usuário.
