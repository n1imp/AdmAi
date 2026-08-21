/**
 * EOS — as nove familias canonicas de tipos.  [SL-A-01 · onda 1 · BOOTSTRAP_PROOF]
 *
 * Fonte: PLAN-A secao E ("Nove familias. Cada tipo tem uma definicao e um dono").
 * Reconciliacao: PLAN-G secao K — nenhum tipo provider-native entra no nucleo.
 *
 * O QUE ESTE MODULO ENTREGA
 *   Os NOMES canonicos e a MEMBRESIA de familia. Nada alem disso.
 *
 * O QUE ELE DELIBERADAMENTE NAO ENTREGA
 *   EnforcementClass e o mapa de imposicao (SL-A-02), modelo de artefato e
 *   mutabilidade (SL-A-03), maquina de estados de capability e revalidacao
 *   (SL-A-09), e qualquer semantica de runtime. `Capability` existe aqui como nome
 *   canonico, nao como maquina de estados — e o descritor NAO carrega campo de
 *   estado, justamente para nao inviabilizar a distincao
 *   `Capability Discovered != Capability Proven` que o SL-A-09 precisa representar.
 *
 * MARCA NOMINAL
 *   Cada tipo carrega uma `marca` derivada de (familia, nome). Ela existe porque o
 *   PLAN-A secao F exige que certos tipos permanecam DISTINTOS mesmo quando o
 *   formato coincide: `Plane != Process != Session != Role != Slice != Tool`. Em
 *   JavaScript, dois objetos de mesmo formato sao intercambiaveis; a marca torna a
 *   distincao verificavel por maquina em vez de confiada a disciplina.
 */

/** As nove familias, na ordem em que o PLAN-A secao E as apresenta. */
export const FAMILIAS = Object.freeze([
  'Runtime', 'Work', 'Knowledge', 'State', 'Authority',
  'Security', 'Persistence', 'Concurrency', 'Side Effects'
]);

/** Deriva a marca nominal. O oraculo externo recalcula esta forma por conta propria. */
export const marcaDe = (familia, nome) => `eos.type.${familia.replace(/\s+/g, '')}.${nome}`;

/** Campos que TODO descritor tem, e nenhum a mais. Ver `verificarCamposExatos`. */
export const CAMPOS_DO_DESCRITOR = Object.freeze(['nome', 'familia', 'marca']);

const descritor = (familia, nome) => Object.freeze({ nome, familia, marca: marcaDe(familia, nome) });

const familia = (nome, membros) => Object.freeze(membros.map((m) => descritor(nome, m)));

/**
 * Membresia canonica. A ordem dentro de cada familia e a do PLAN-A secao E.
 * Alterar um nome aqui sem alterar o contrato documental e detectado por TYPE-01 e
 * por TYPE-02 (ancora documental), nao por revisao humana.
 */
export const TIPOS_CANONICOS = Object.freeze({
  'Runtime': familia('Runtime', [
    'Runtime', 'Plane', 'Process', 'Provider', 'Adapter', 'Session', 'Role', 'AgentIdentity', 'Capability'
  ]),
  'Work': familia('Work', [
    'Run', 'Intent', 'Task', 'Slice', 'Node', 'Join', 'Dependency', 'ExecutionGraph',
    'PlanProposal', 'ArchitectureProposal'
  ]),
  'Knowledge': familia('Knowledge', [
    'Decision', 'Invariant', 'Evidence', 'Finding', 'KnownRisk', 'ArchitectureRecord',
    'ImpactRecord', 'Contract', 'TestContract', 'ProofLedger'
  ]),
  'State': familia('State', [
    'RuntimeState', 'AgentState', 'NodeState', 'RunState', 'ContractState',
    'FindingState', 'SideEffectState', 'VerificationState', 'EnvironmentState'
  ]),
  'Authority': familia('Authority', [
    'DecisionOwner', 'Recommender', 'ApprovalOwner', 'Executor', 'Verifier',
    'AuthorityClass', 'ImpactClass', 'ReversibilityClass', 'ConfidenceClass'
  ]),
  'Security': familia('Security', [
    'Authorization', 'Enforcement', 'Detection', 'Coordination', 'Verification',
    'ContentProvenance', 'TrustState', 'SecurityEnvelope', 'RepositorySecurityProfile'
  ]),
  'Persistence': familia('Persistence', [
    'Event', 'Journal', 'Projection', 'Checkpoint', 'Snapshot', 'ArtifactVersion', 'RuntimeManifest'
  ]),
  'Concurrency': familia('Concurrency', [
    'RepositoryRuntimeLease', 'SliceLease', 'FencingToken', 'Writer', 'Reader', 'Ownership', 'Lock'
  ]),
  'Side Effects': familia('Side Effects', [
    'SideEffect', 'SideEffectIntent', 'SideEffectObservation', 'Reconciliation', 'WriteManifest'
  ])
});

/** Todos os descritores, achatados. */
export const TODOS_OS_TIPOS = Object.freeze(Object.values(TIPOS_CANONICOS).flat());

/** Resolve um nome canonico. Retorna `null` quando o nome nao e canonico — nunca inventa. */
export function tipoCanonico(nome) {
  return TODOS_OS_TIPOS.find((t) => t.nome === nome) ?? null;
}

/**
 * Familia de um nome canonico, ou `null`.
 *
 * Existe para que a pergunta "de que familia este tipo e?" tenha UMA resposta
 * verificavel. E o que impede, por exemplo, que `SliceLease` (Concurrency) ou
 * `WriteManifest` (Side Effects) sejam apresentados como tipo da familia Security e
 * herdem, so pelo nome, uma forca de garantia que o contrato nao lhes da
 * (MAR-INV-025). A classificacao de forca em si e do SL-A-02, nao daqui.
 */
export function familiaDe(nome) {
  return tipoCanonico(nome)?.familia ?? null;
}
