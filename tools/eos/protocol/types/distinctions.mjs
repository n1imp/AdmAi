/**
 * EOS — as distincoes obrigatorias do PLAN-A secao F.  [SL-A-01 · onda 1]
 *
 * A secao F nao acrescenta tipos: ela proibe COLAPSOS. Sao pares e cadeias que
 * precisam permanecer distintos mesmo quando o formato coincide. Em JavaScript dois
 * objetos de mesmo formato sao intercambiaveis, entao "sao conceitos diferentes"
 * seria apenas uma frase de documentacao. Aqui vira dado verificavel: cada termo
 * carrega marca nominal propria e a verificacao reprova se duas marcas de um mesmo
 * grupo colidirem.
 *
 * DOIS TIPOS DE TERMO, MANTIDOS SEPARADOS DE PROPOSITO
 *   CANONICO — o termo e um dos 75 tipos da secao E. A verificacao exige que ele
 *              exista na familia declarada; uma distincao que cite tipo inexistente
 *              e defeito, nao detalhe.
 *   CONCEITO — o termo NAO e um tipo da secao E. `Tool`, `Single Writer` e
 *              `OS-level Write Restriction` nunca foram tipos canonicos. Registra-los
 *              como CANONICO inventaria membros que o contrato documental nao tem, e
 *              TYPE-01 reprovaria — corretamente.
 *
 * `relacionadoA` liga um CONCEITO ao tipo canonico correspondente quando a secao F
 * usa a forma em prosa ("Runtime State", "Slice Lease") e a secao E usa a forma
 * exata (`RuntimeState`, `SliceLease`). Sao grafias diferentes do mesmo assunto, e
 * colapsa-las apagaria a diferenca entre citar um tipo e citar um conceito.
 *
 * OBSERVACAO SOBRE O TEXTO DA FONTE (nao e defeito de contrato)
 *   A secao F afirma "As tres em negrito" e marca QUATRO distincoes em negrito:
 *   DIST-05, DIST-06, DIST-12 e DIST-13. A divergencia e de contagem em prosa; as
 *   distincoes em si sao inequivocas. Registrado aqui em vez de silenciosamente
 *   escolher tres.
 */

import { tipoCanonico } from './families.mjs';

/** Marca nominal de um conceito que nao e tipo canonico. */
export const marcaDeConceito = (nome) => `eos.concept.${nome.replace(/[^A-Za-z0-9]+/g, '-')}`;

const canonico = (nome, familia) => Object.freeze({ nome, tipo: 'CANONICO', familia });
const conceito = (nome, relacionadoA = null) =>
  Object.freeze({ nome, tipo: 'CONCEITO', marca: marcaDeConceito(nome), relacionadoA });

/**
 * As catorze distincoes da secao F, na ordem do texto.
 * `enfase: true` marca as que a propria secao F destaca como as mais confundidas.
 */
export const DISTINCOES_OBRIGATORIAS = Object.freeze([
  Object.freeze({
    id: 'DIST-01', enfase: false,
    termos: Object.freeze([
      canonico('Plane', 'Runtime'), canonico('Process', 'Runtime'), canonico('Session', 'Runtime'),
      canonico('Role', 'Runtime'), canonico('Slice', 'Work'), conceito('Tool')
    ]),
    nota: 'um Process pode hospedar varias Session, cada uma servindo varios Role; nenhum deles e um Slice'
  }),
  Object.freeze({
    id: 'DIST-02', enfase: false,
    termos: Object.freeze([conceito('Runtime Event', 'Event'), conceito('Engineering Contract', 'Contract')])
  }),
  Object.freeze({
    id: 'DIST-03', enfase: false,
    termos: Object.freeze([
      canonico('DecisionOwner', 'Authority'), canonico('Recommender', 'Authority'),
      canonico('ApprovalOwner', 'Authority'), canonico('Executor', 'Authority'),
      canonico('Verifier', 'Authority')
    ])
  }),
  Object.freeze({
    id: 'DIST-04', enfase: false,
    termos: Object.freeze([conceito('Proposal Authority'), conceito('Execution Authority')])
  }),
  Object.freeze({
    id: 'DIST-05', enfase: true,
    termos: Object.freeze([
      canonico('Authorization', 'Security'), canonico('Enforcement', 'Security'),
      canonico('Detection', 'Security'), canonico('Coordination', 'Security'),
      canonico('Verification', 'Security')
    ]),
    nota: 'quem pode / o que impede / o que percebe / o que organiza / o que prova — e a razao de existir a secao H'
  }),
  Object.freeze({
    id: 'DIST-06', enfase: true,
    termos: Object.freeze([
      conceito('Capability Discovered', 'Capability'), conceito('Capability Proven', 'Capability')
    ]),
    nota: 'SL-A-01 nao implementa a maquina de estados de capability (SL-A-09), mas o descritor de Capability tambem nao fixa estado algum — do contrario a distincao ficaria irrepresentavel'
  }),
  Object.freeze({
    id: 'DIST-07', enfase: false,
    termos: Object.freeze([conceito('Provider Sandbox'), conceito('EOS Security Policy')])
  }),
  Object.freeze({
    id: 'DIST-08', enfase: false,
    termos: Object.freeze([conceito('Provider-native Memory'), conceito('EOS Knowledge System')])
  }),
  Object.freeze({
    id: 'DIST-09', enfase: false,
    termos: Object.freeze([canonico('Journal', 'Persistence'), canonico('Projection', 'Persistence')])
  }),
  Object.freeze({
    id: 'DIST-10', enfase: false,
    termos: Object.freeze([conceito('Runtime State', 'RuntimeState'), conceito('Observed External Reality')])
  }),
  Object.freeze({
    id: 'DIST-11', enfase: false,
    termos: Object.freeze([
      canonico('RepositoryRuntimeLease', 'Concurrency'), canonico('SliceLease', 'Concurrency')
    ])
  }),
  Object.freeze({
    id: 'DIST-12', enfase: true,
    termos: Object.freeze([conceito('Single Writer'), conceito('Filesystem Containment')])
  }),
  Object.freeze({
    id: 'DIST-13', enfase: true,
    termos: Object.freeze([conceito('Slice Lease', 'SliceLease'), conceito('OS-level Write Restriction')])
  }),
  Object.freeze({
    id: 'DIST-14', enfase: false,
    termos: Object.freeze([conceito('CODEX_REVIEW_PASS'), conceito('VERIFICATION_PASS')])
  })
]);

/* REMOVIDO na rodada de correcao 1, por achado 6 da revisao do Codex.
   Existia aqui uma lista `TERMOS_COM_VOCABULARIO_DE_PROVIDER` que isentava
   `Provider Sandbox`, `Provider-native Memory` e `CODEX_REVIEW_PASS` da checagem de
   vazamento provider-native. Dois problemas reais:

     a) a isencao era controlada pelo candidato — acrescentar `Claude Permission Mode`
        a distincao E a isencao ao mesmo tempo passava com zero falhas;
     b) eu havia medido que `Provider-native Memory` sequer era carregada por alguma
        checagem: era isencao inutil, o que so alarga a superficie sem beneficio.

   A substituicao e mais forte e mais simples: todo termo CONCEITO precisa aparecer
   LITERALMENTE na secao F (TYPE-08c). `Provider Sandbox` aparece — e contrato.
   `Claude Permission Mode` e `Gemini Runtime` nao aparecem — e vazamento. A ancora
   documental dispensa lista de excecao, e nenhum nome de fornecedor entra por ali. */

/** Marca nominal de qualquer termo de distincao, canonico ou conceito. */
export function marcaDoTermo(termo) {
  return termo.tipo === 'CANONICO' ? (tipoCanonico(termo.nome)?.marca ?? null) : termo.marca;
}
