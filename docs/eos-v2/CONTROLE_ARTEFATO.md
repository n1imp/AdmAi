# Controle de artefato ignorado — `GIT_IGNORED != NOT_A_SIDE_EFFECT`

`SCOPE-F2D` · lane `HARNESS` · repositório real, `.gitignore` real, CLI real.

## O que estava errado

`observarSujos()` e `shasDaLane()` chamam o Git com `--exclude-standard`. Enquanto essas eram as
únicas fontes de observação, **toda escrita coberta por `.gitignore` era invisível ao Write Set**.

Eu piorei isso na rodada anterior. Duas fatias de harness haviam bloqueado integração com
`UNDECLARED_WRITE` porque rodar a captura escreve ~130 arquivos em `chaveiro-painel/telas/`.
Acrescentei o diretório ao `.gitignore` e descrevi a mudança como "fecha a causa estrutural".
Não fechava: **cegava o detector**. A escrita continuava acontecendo; só deixava de ser vista.

Não descoberto por mim, mas descoberto por este trabalho: `chaveiro-bot/uploads-docs` (107
arquivos) e `chaveiro-bot/uploads-ponto` (68) são escritas de **runtime do produto** — documentos
enviados e selfies de ponto gerados durante a observação — que nunca foram observáveis, nem antes
do meu `.gitignore`.

## Controle negativo, antes da correção

| passo | resultado |
| --- | --- |
| escrever `chaveiro-painel/telas/_CONTROLE_NEGATIVO.txt`, fora do Write Set | arquivo existe no disco |
| `git status --porcelain -uall` | 0 linhas |
| `write-set-gate --comparar` | `OBSERVED_SUBSET` |

`OBSERVED_SUBSET` significa "escreveu-se **menos** que o declarado". O detector não só deixou de
ver a escrita — ele afirmou o contrário dela. **FAIL.**

## Correção

Dimensão nova no gate, na menor camada responsável:

- `artefatosIgnorados(raiz)` enumera o que o Git ignora, **exceto** `node_modules` e `.git`
  (67.246 dos 67.666 ignorados são `node_modules`, e são efeito de `npm ci`, não da tarefa);
- **nunca lê conteúdo.** A lista inclui `.env` e `.env.test`; a marca gravada é `tamanho:mtime`,
  obtida por `statSync`. Detectar escrita não pode virar leitura de segredo;
- `observarArtefatosDaLane()` compara contra o baseline: criados, alterados e removidos;
- classe `UNDECLARED_ARTIFACT_WRITE`, que **bloqueia integração** como as demais;
- declaração ganha `artefatos: [raízes autorizadas]`; escrita ignorada abaixo delas é efeito
  declarado da tarefa, fora delas é clandestina;
- declaração **sem** `artefatosPorLane` devolve `UNKNOWN_DIFFERENCE` — falha fechada. Tratar
  ausência de baseline como "nada foi escrito" seria a afirmação forte a partir do desconhecimento.

## Controles, depois da correção

| controle | esperado | obtido |
| --- | --- | --- |
| escrita ignorada **não** declarada | detecta | `UNDECLARED_ARTIFACT_WRITE`, caminho nomeado |
| Git enxerga esse caminho? | não | 0 linhas — o controle mede o caminho novo, não o antigo |
| mesma escrita, raiz **declarada** | não acusa | `OBSERVED_SUBSET`, 1 artefato observado, 0 não declarados |
| nenhuma escrita de artefato | não acusa | 0 não declarados |
| sabotagem: remover a raiz declarada | volta a acusar | `UNDECLARED_ARTIFACT_WRITE` |

Mais 11 controles no `--selftest`, contra repositório sintético com `.gitignore` real — inclusive
a contraprova de que o Git realmente não enxerga o caminho sabotado, sem a qual o teste estaria
medindo o mecanismo antigo.

`--selftest`: **109/109**.

## Classe de enforcement realmente provada

`DETECTION_ON_COMPARE`, não prevenção.

O gate **detecta** escrita não declarada — de fonte e agora de artefato — quando alguém executa a
comparação. Ele não **impede** escrita: hooks estão desligados e o contrato proíbe criá-los neste
fluxo. E o bloqueio de integração continua `COORDINATION_ONLY`: `bloqueiosAbertos()` informa, e
nada obriga a consultá-lo antes de integrar.

Limite que permanece, e que metadado nenhum resolve: `mtime` pode ser reescrito e tamanho pode
coincidir. Isto detecta escrita acidental e não declarada, que é o caso real; não detecta
adversário que forje metadado.

## Onde as capturas ficam

Permanecem em `chaveiro-painel/telas/`, ignoradas pelo Git — evidência é artefato, não fonte, e não
deve entrar no diff. A diferença é que agora estão **dentro da superfície observada**: escrevê-las
sem declarar a raiz produz `UNDECLARED_ARTIFACT_WRITE`.

`GIT_VISIBILITY != FILESYSTEM_SIDE_EFFECT_VISIBILITY` — as duas passam a ser medidas em separado.
