/**
 * EOS — superficie publica dos tipos canonicos.  [SL-A-01 · onda 1]
 *
 * Este barrel e uma FRONTEIRA DE ESCOPO, nao uma conveniencia de import. O PLAN-G
 * secao Y atribui a Slices distintos o que e facil confundir com "tipos":
 * EnforcementClass e o mapa de imposicao sao do SL-A-02, artefato e mutabilidade do
 * SL-A-03, a maquina de capability do SL-A-09. Exportar qualquer um deles daqui
 * adiantaria escopo sem passar pelo gate desses Slices.
 *
 * RODADA DE CORRECAO 1 — achado 4 da revisao do Codex.
 *   Este arquivo declarava a propria lista `SUPERFICIE_SL_A_01` que o verificador
 *   usava como expectativa. Acrescentar `CapabilityMachine` aos exports E a lista ao
 *   mesmo tempo passava com zero falhas: o barrel era juiz em causa propria. A
 *   expectativa foi movida para `oracle/sl-a-01-surface.json`, fora deste modulo.
 *   Isso nao torna a alteracao coordenada impossivel — torna-a visivel no diff de um
 *   arquivo que nao e o que se estava editando. A afirmacao final do verificador diz
 *   exatamente isso, sem exagerar.
 */

export {
  FAMILIAS,
  TIPOS_CANONICOS,
  TODOS_OS_TIPOS,
  CAMPOS_DO_DESCRITOR,
  marcaDe,
  tipoCanonico,
  familiaDe
} from './families.mjs';

export {
  DISTINCOES_OBRIGATORIAS,
  marcaDeConceito,
  marcaDoTermo
} from './distinctions.mjs';

/**
 * Marcador das superficies que este namespace ainda NAO entrega.
 * Quem tentar usar recebe um erro que NOMEIA o Slice dono, em vez de um `undefined`
 * que so falha tres camadas adiante.
 */
export function pendente(nome, dono) {
  throw new Error(`protocol.types.${nome} nao pertence ao SL-A-01; entregue por ${dono}`);
}
