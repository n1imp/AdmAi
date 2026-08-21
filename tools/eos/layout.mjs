/**
 * EOS Multi-Agent Runtime — contrato de layout.  [SL-BOOT-02 · Onda 0]
 *
 * O PLAN-A secao AK propoe uma estrutura ADITIVA: quatro namespaces novos ao lado
 * dos dez subsistemas que ja existem, sem reorganizar nenhum deles. "Aditivo" e
 * uma afirmacao verificavel, nao uma intencao — e este modulo existe para que ela
 * seja verificada por maquina a cada slice seguinte, e nao lembrada por disciplina.
 *
 * Por que um contrato de layout e nao apenas diretorios vazios: um diretorio vazio
 * nao prova nada e nao diz a quem vem depois o que colocar dentro. Aqui cada
 * namespace declara qual slice do EOS_MASTER_IMPLEMENTATION_DAG o preenche, o que
 * ele vai exportar e de que plano vem o contrato. Isso transforma "criei as pastas"
 * numa propriedade testavel: o layout confere com o DAG, e os subsistemas preexistentes
 * continuam PRESENTES nos caminhos que o baseline registra.
 *
 * A diferenca importa  [R12-01]: a verificacao observa presenca atual, filhos permitidos
 * e contagens congeladas — ela nao le historico do repositorio. "Nada se moveu" seria
 * afirmacao sobre o passado; o que se prova e que hoje esta onde o baseline diz que
 * deveria estar. Um caminho recriado com o mesmo nome satisfaz a checagem.
 */

/**
 * Os dez subsistemas ja existentes. CONGELADOS quanto a localizacao: um slice pode
 * acrescentar arquivos dentro deles, nunca move-los, renomea-los ou remove-los.
 * Mover qualquer um quebraria todo import ja escrito e invalidaria as suites que
 * servem de BOOTSTRAP_PROOF ate PROOF_PLANE_OPERATIONAL.
 */
export const SUBSISTEMAS_EXISTENTES = Object.freeze([
  'accounting', 'baseline', 'engineering', 'knowledge', 'proof',
  'risk', 'router', 'runs', 'selftest', 'verification'
]);

/**
 * Os quatro namespaces aditivos do PLAN-A secao AK.
 *
 * `preenchidoPor` referencia Slices reais do Master DAG. `verify-layout.mjs` checa
 * essa referencia contra o PLAN-G: um namespace apontando para um Slice inexistente
 * e um defeito de plano, nao um detalhe de organizacao.
 *
 * RODADA DE CORRECAO 3 — F-MAR-067 (LAYOUT_CONTRACT_MISSING_MATERIALIZATION_TRANSITION).
 *
 * `subNamespaces` era uma lista de nomes, e o contrato nao tinha como dizer que um
 * subnamespace declarado JA FOI materializado. Consequencia concreta: o primeiro
 * Slice que cumprisse o contrato reprovaria nele. Duas manifestacoes:
 *
 *   LAY-06 aprovava so quando o subnamespace declarado estava AUSENTE do disco;
 *   LAY-03 rejeitava qualquer filho do namespace que nao fosse `index.mjs`.
 *
 * A segunda foi encontrada pelo Codex na analise D1; eu so tinha visto a primeira.
 *
 * A correcao mantem DECLARED e MATERIALIZED como CAMPOS DISTINTOS (amendment 002
 * secao 23) e exige consistencia entre eles: existe no disco EXATAMENTE quando o
 * contrato diz que foi materializado. `materializadoPor: null` e explicito de
 * proposito — ausencia, string vazia ou campo faltando nao podem significar
 * materializacao por omissao.
 */
export const NAMESPACES_ADITIVOS = Object.freeze({
  protocol: {
    origem: 'PLAN-A secao AK + secoes O-T',
    proposito: 'protocolo de evento, artefatos, snapshot e versionamento canonicos',
    subNamespaces: Object.freeze({
      types:      Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-A-01' }),
      schemas:    Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: null }),
      events:     Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: null }),
      artifacts:  Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: null }),
      snapshots:  Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: null }),
      versioning: Object.freeze({ declaradoPor: 'SL-BOOT-02', materializadoPor: null })
    }),
    modulos: Object.freeze({}),
    /* SL-A-04 entrega `repositoryId` obrigatorio em `protocol/artifacts/`; SL-A-05 e
       SL-A-09 entregam maquina de contrato e modelo de capability em
       `protocol/schemas/`. Colocacao decidida em D1-F-MAR-070-E-COLOCACAO: nenhum
       subnamespace novo e criado, entao a secao AK congelada nao e tocada. */
    preenchidoPor: Object.freeze([
      'SL-A-01', 'SL-A-03', 'SL-A-04', 'SL-A-05', 'SL-A-06', 'SL-A-07', 'SL-A-08', 'SL-A-09'
    ]),
    exportaraFuturamente: Object.freeze([
      'tipos canonicos das nove familias',
      'envelope de evento com classificacao bidimensional (kind x concern)',
      'modelo de artefato e mutabilidade',
      'RepositorySnapshot e SnapshotId',
      'schemaVersion por tipo de mensagem e RuntimeManifest'
    ])
  },
  authority: {
    origem: 'PLAN-A secao G + PLAN-B secoes AG-AK',
    proposito: 'representacao de autoridade, precedencia e o Authority Validator',
    subNamespaces: Object.freeze({}),
    modulos: Object.freeze({}),
    preenchidoPor: Object.freeze(['SL-A-01', 'SL-K-11']),
    exportaraFuturamente: Object.freeze([
      'D0/D1/D2 e o registro maior (impact, reversibility, confidence, scope)',
      'precedencia congelada do PLAN-A secao G',
      'resultados nao booleanos: AUTHORIZED, DENIED, WAITING_DECISION, POLICY_CONFLICT, AUTHORITY_AMBIGUOUS, INVALID_CONTEXT'
    ])
  },
  provenance: {
    origem: 'PLAN-A secao J',
    proposito: 'as nove categorias de proveniencia e os tres eixos independentes',
    subNamespaces: Object.freeze({}),
    modulos: Object.freeze({}),
    preenchidoPor: Object.freeze(['SL-A-10']),
    exportaraFuturamente: Object.freeze([
      'canais normativos e canais de dado',
      'provenance x authority x trust como eixos independentes (MAR-INV-022)'
    ])
  },
  invariants: {
    origem: 'PLAN-A secoes M-N',
    proposito: 'registro de invariantes com EnforcementClass e mapa de imposicao',
    subNamespaces: Object.freeze({}),
    modulos: Object.freeze({}),
    preenchidoPor: Object.freeze(['SL-A-02']),
    // Consolida o registro que hoje vive em knowledge/registries.mjs. CONSOLIDA,
    // nao move: o modulo atual permanece onde esta e continua funcionando, porque
    // dez suites dependem dele e elas sao o oraculo de bootstrap.
    exportaraFuturamente: Object.freeze([
      'InvariantId, Statement, Domain, Authority, EnforcementClass',
      'EnforcementPoint, DetectionPoint, VerificationMethod',
      'ApplicablePhases, ViolationFindingCategory',
      'marcacao UNENFORCED explicita para invariante sem imposicao conhecida'
    ])
  }
});

/* REMOVIDO na rodada de correcao 3, por achado do Codex (revisao do SL-A-01):
   este modulo exportava `ENFORCEMENT_CLASSES` com as seis classes do PLAN-A secao H,
   sob a justificativa de "reexportar para uso do verificador". Nenhum verificador a
   usava — grep confirmou zero consumidores — e o PLAN-G secao Y atribui
   `EnforcementClass` e o mapa de imposicao ao SL-A-02. Era implementacao antecipada
   de outro Slice, sobrevivendo por ser conveniente e nao por ser necessaria. O
   SL-A-02 a entrega no lugar certo, com o gate certo. */

/** Regra aditiva, em uma frase, para quem for ler so isto. */
export const REGRA_ADITIVA =
  'Um slice pode criar namespace novo e acrescentar arquivos aos existentes. ' +
  'Nenhum slice move, renomeia ou remove subsistema existente sem PLAN_DEFECT registrado.';
