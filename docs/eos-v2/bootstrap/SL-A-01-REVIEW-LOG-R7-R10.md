# `SL-A-01` — registro das revisões independentes R7 a R13

> **DESFECHO: `SL-A-01 = VERIFIED`.** R13 devolveu `APROVADO` sem achados — a primeira aprovação
> depois de doze rodadas com correção. Integração autoritativa concluída (8 arquivos novos,
> 2 modificados, 0 perdidos), verificadores reexecutados **na lane de integração**, `BOOTSTRAP_PROOF`
> com as 8 suítes, stale check `FRESH`, gate 7/7. Detalhe das rodadas R11 a R13 no fim do arquivo.

> **Por que este arquivo existe.** As revisões R2–R6 foram persistidas em
> `EOS_BUILD_CODEX/.eos-capsule/REVIEW-SL-A-01-R*.md`. As de R7 a R10 chegaram por transporte MCP e
> **não foram gravadas** — existiam apenas no contexto conversacional, que é exatamente o que a
> continuidade deste Run proíbe usar como autoridade. Sem este registro, a próxima retomada não
> conseguiria reconstruir o conteúdo dos Findings a partir do repositório.
>
> **Provenance deste documento:** `TRANSCRITO_DA_SESSAO`. É reprodução das respostas do revisor
> recebidas nesta sessão, não releitura de um arquivo pré-existente. As **consequências** de cada
> achado são verificáveis no código (`tools/eos/protocol/types/verify.mjs`) e no
> `EXECUTION_STATE.md` §10; os **veredictos** só têm esta cópia.

| Rodada | Thread | Veredicto | Achados |
|---|---|---|---|
| R7 | `019ffe18-afcb-7261-9ac5-6f362403af5f` | `CORRECOES_NECESSARIAS` | 3 |
| R8 | `019ffe2d-671f-73b1-bd17-aa475e682d64` | `CORRECOES_NECESSARIAS` | 2 |
| R9 | `019ffe35-3853-7903-b803-dc634e224b6d` | `CORRECOES_NECESSARIAS` | 3 |
| R10 | `019ffe3d-dfd5-7e02-8c0f-a5199c9e91c3` | `CORRECOES_NECESSARIAS` | 2 |
| D2 (Decisor) | `019ffe26-13fd-70d3-9d0a-025d8beb168b` | `DISCORDO` → opção C | — |

Todas as quatro rodadas atacaram a **correção anterior**, não o código original.

---

## R7 — três achados

**R7-01 · PARSER FAILURE.** A contagem congelada de linhas (correção da R6-01) congela quantidade,
não função estrutural. Contraexemplo executado pelo revisor: mover `DIST-14` para a prosa
explicativa já existente da §F mantendo 13 linhas não vazias, atualizando só o fingerprint →
`0 falhas / 163 PASS`. Idem em §E reutilizando a linha de `RuntimeManifest` como `Exemplo: …`.
Logo, a frase "os tokens vieram de construções normativas" não estava provada.

*Aplicado:* frase reescrita. Medi e confirmei a premissa — §F tem 13 linhas não vazias e só 3
começam com forma de bloco; 10 dos 14 grupos vivem em prosa corrida, então **não existe construção
normativa por linha em §F**. Em §E, `Exemplo:` com token da mesma família produz mapa idêntico.
Classe publicada: `COORDINATED_CHANGE_VISIBLE_IN_DIFF`. O mecanismo não foi endurecido, porque
endurecer exigiria uma distinção normativo/prosa que a seção não possui.

**R7-02 · TEST/ORACLE FAILURE.** `CHALLENGE-SL-A-01.txt` fixou
`TESTES_OBRIGATORIOS: keysets exatos; compile-fail cruzado; imports provider-native proibidos;
mutações remove/extra/merge`. O `compile-fail cruzado` nunca foi executado e nenhum registro o
revogava.

*Aplicado:* dividido em duas metades — ver `D2-SL-A-01-COMPILE-FAIL` abaixo e `TYPE-09`.

**R7-03 · CLAIM CALIBRATION FAILURE.** A classificação `STRUCTURALLY_INDEPENDENT (não há campo a
adulterar)` para CANÔNICO/CONCEITO estava **literalmente refutada pela sabotagem `TYPE-08c` do
próprio arquivo**, que inverte o campo `tipo` de `distinctions.mjs`.

*Aplicado:* rebaixado para `COORDINATED_CHANGE_DETECTABLE`, distinguindo a **expectativa**
(derivada da membresia, sem oráculo a editar) do **valor observado** (campo declarado, adulterável).

---

## D2-SL-A-01-COMPILE-FAIL — decisão material

Consulta ao Decisor sobre o `compile-fail cruzado`. **Minha posição era a opção B** (nominalidade
em runtime). O Decisor respondeu `DISCORDO`, `CONFIANCA: ALTA`, impondo a **opção C**.

Fundamento: a materialização é JS ESM puro (sem `.ts`/`.d.ts`/`tsconfig`/`jsconfig`/`package.json`;
o PLAN-A não menciona TypeScript) e os "tipos" são descritores congelados `{nome, familia, marca}` —
**não existe operação de atribuição a reprovar, porque não existe compilação**. A opção B foi
recusada por acrescentar semântica e API que o contrato não pede, com garantia diferente da pedida.

Vinculante: `compile-fail cruzado = NOT_APPLICABLE`, **nem `PASS` nem `SKIP`**; proibido introduzir
`.d.ts`, JSDoc nominal, `tsconfig`, manifesto npm ou dependência; nenhuma mensagem pode prometer
garantia estática; a supersessão **não apaga a pendência retroativamente**.

Registro completo em `EXECUTION_STATE.md` §10.

---

## R8 — dois achados, ambos sobre o `TYPE-09` criado em resposta à R7

**R8-01 · PARSER FAILURE.** `lerEspecificadoresDeImport` só reconhecia literal. Duas fontes
passavam com zero falhas:

```js
const p = 'zod'; await import(p);
await import('@anthropic-ai/' + 'sdk');
```

Sem literal não havia o que classificar, e "nada a classificar" virava aprovação.

*Aplicado:* `lerImportsDinamicosNaoAnalisaveis` + `TYPE-09d` — argumento que não seja **um único
literal** reprova. Mais 3 sabotagens e o controle `TYPE-PARSER-03` (11 casos, duas direções).

**R8-02 · CLAIM CALIBRATION FAILURE.** "os três módulos importam somente `./`" excedia a prova: o
mecanismo lê texto-fonte, não resolve o grafo.

*Aplicado:* frase declara a natureza léxica e a ausência de resolução de grafo.

---

## R9 — três achados

**R9-01 · PARSER FAILURE.** Dois JavaScript válidos atravessavam:

```js
await import // comentário válido
(p);
import { 'readFile' as rf } from 'node:fs';
```

Causa 1: `semComentarios` só removia comentário iniciado no começo da linha. Causa 2: o nome
importado como string quebra o padrão de `from`, e não casar virava aprovação.

*Aplicado:* remoção de comentário no meio da linha (guarda `[^:]` para `https://`), e —
principalmente — **particionamento**: `lerOcorrenciasNaoClassificadas` + `TYPE-09e`, onde toda
ocorrência de `import`/`require`/`export … from` precisa cair numa forma de `FORMAS_RECONHECIDAS`;
o que não cair reprova. Reconhecer mais formas só adiaria o defeito. Controle `TYPE-PARSER-04`
(14 casos) cobre o falso positivo mais provável: a palavra "import" em **prosa de comentário**, que
existe de fato no cabeçalho de `index.mjs`.

**R9-02 · CLAIM CALIBRATION FAILURE.** A frase afirmava que toda forma dinâmica não literal
reprovava — refutada pelo caso do comentário. *Aplicado:* reescrita + dois limites medidos.

**R9-03 · DOCUMENT DRIFT FAILURE.** `EXECUTION_STATE.md` §10 ainda dizia "só podem importar `./`" e
registrava 7 sabotagens / 2 controles. *Aplicado:* atualizado para `TYPE-09a..e`, 13 sabotagens,
4 controles, com os limites.

---

## R10 — dois achados

**R10-01 · PROPERTY / TEST-ORACLE / DOCUMENT DRIFT.** `TYPE-09e` fecha ocorrências **textuais** dos
keywords, não a classe de dependências. Contraexemplo válido, sem nenhum keyword:

```js
const fs = process.getBuiltinModule('node:fs');
```

Carrega o builtin de fato e atravessa com `totalFalhas=0`, contradizendo a propriedade publicada
("não pode depender … nem builtin do runtime").

*Aplicado:* **claim rebaixada, mecanismo não estendido** — enumerar mecanismos de aquisição
(`globalThis`, `createRequire`, `eval`, …) seria lista de negação, incompleta por construção, que é
a lição da R4. Classes publicadas:

| Propriedade | Classe |
|---|---|
| superfície textual de import | `DETECTIVE` — provada |
| aquisição sem keyword | `UNKNOWN` — não provada, e não alegada |

**R10-02 · CLAIM CALIBRATION FAILURE.** O rótulo `particao: desconhecido reprova, legitimo passa`
excedia os controles: `const palavra = 'import';`, `{ import: 'interno' }` e `objeto.import` são
JavaScript legítimo e seriam marcados. *Aplicado:* rótulo restrito a
`formas do repositorio passam`, com o falso positivo declarado.

---

## Estado após aplicar R10

```
protocol/types/verify.mjs   exitCode=0   176 PASS / 0 FAIL   53/53 sabotagens
                            TYPE-PARSER-01 12/12 · 02 9/9 · 03 11/11 · 04 14/14
verify-layout.mjs           exitCode=0    80 PASS / 0 FAIL   36/36 · 2/2
                            LAY-PARSER-01 10/10 · LAY-PARSER-02 ok
7 suítes EOS + fixture B    exitCode=0 nas 8
```

`SL-A-01` permanece **`NOT_VERIFIED`**. Próximo passo: **R11**, revisão independente sobre este
estado. Número de rodadas não é critério de aprovação.

---

## R11 — um achado

**R11-01 · CLAIM CALIBRATION FAILURE.** A claim de `TYPE-09` foi rebaixada na mensagem publicada e
no registro, mas o **comentário interno** do bloco (`verify.mjs:616`) continuava afirmando que o
módulo "não pode depender de nada fora do próprio Slice", incluindo builtins. O mesmo artefato
carregando uma claim ampla refutada e a classificação correta.

*Aplicado:* comentário reescrito distinguindo o que as checagens cobrem (dependência **declarada**
no texto-fonte) do que não cobrem (aquisição sem keyword), com o contraexemplo `getBuiltinModule`
nomeado ali. Varredura por `nao pode depender`, `somente ./`, `importam somente`, `so podem
importar`: nenhuma ocorrência restante.

## R12 — um achado, e desta vez no verificador de **layout**

**R12-01 · CLAIM CALIBRATION FAILURE.** Três lugares afirmavam propriedade **histórica** que o
mecanismo não observa — `layout.mjs:13` ("nada existente se moveu"), `verify-layout.mjs:240`
(`LAY-03`) e `:308` (`LAY-05`, inclusive na **mensagem** de falha: "foi movido"). A verificação lê
presença atual, filhos permitidos e contagens; não lê histórico.

*Aplicado:* linguagem rebaixada nos três, sem criar mecanismo histórico. `LAY-05` passou a dizer
"ausente do caminho do baseline". Ficou registrado que um caminho recriado com o mesmo nome
satisfaz a checagem, e que arquivo copiado e arquivo movido são indistinguíveis para ela — ambos
reprovam se não forem declarados, que é o efeito útil.

## R13 — `APROVADO`, sem achados

O revisor confirmou a distinção que eu havia sustentado ao classificar as ocorrências remanescentes:
enunciar a **regra contratual** ("um slice nunca move os subsistemas") não é alegar que o
verificador **provou** o cumprimento histórico dela. Verificou também que `EXECUTION_STATE.md` não
tinha claim excedente correspondente.

Confirmações da R13: 9/9 fingerprints; `verify-layout` exit 0 com 80 PASS, 36/36, 2/2, parser 10/10;
`types/verify` exit 0 com 176 PASS, 53/53, parsers 12/12, 9/9, 11/11, 14/14; `git diff --check`
limpo. Reconferiu os fingerprints ao final, sem alteração durante a revisão.

---

## Fechamento

```
integração autoritativa   8 novos · 2 modificados · 0 perdidos  (delta == pré-computado)
verificadores na integração   types 176 PASS/53-53 · layout 80 PASS/36-36  exit 0
BOOTSTRAP_PROOF               8 suítes EOS  exit 0
stale check                   FRESH — candidato bit a bit igual ao revisado
escopo                        nenhuma antecipação de SL-A-02/03/09; export surface limpa
gate                          7/7 critérios
```

Sobre o escopo: `grep` por `EnforcementClass`/`CapabilityMachine`/`ArtifactModel` casa em cinco
arquivos, e **todos os matches são proibições nomeadas** — comentários e listas de símbolos que o
slice não pode exportar, com o dono (`SL-A-02`, `SL-A-03`, `SL-A-09`) ao lado. Nenhuma
implementação antecipada.

### Limitações declaradas pelo próprio revisor

- **R9 e R10:** a fixture repo B não pôde ser executada — Git recusou o repositório por
  `dubious ownership` (pertence ao usuário host; a revisão roda como `CodexSandboxOffline`).
  O revisor não alterou `safe.directory`, corretamente. Ela roda na lane do Claude com exit 0, mas
  isso é evidência do implementador, não do revisor.
- **R10:** as sete suítes EOS não foram reexecutadas pelo revisor.
- **R8:** a mutação "extrator sempre vazio" não foi repetida pelo revisor.
