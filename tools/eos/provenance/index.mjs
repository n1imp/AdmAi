/**
 * EOS Provenance — namespace aditivo.  [SL-BOOT-02 declara · SL-A-* implementa]
 *
 * Ainda nao ha provenanceo aqui. O que existe e a fronteira: quem importar este
 * namespace antes de o Slice dono existir recebe um erro que NOMEIA o Slice, em vez
 * de um `undefined` que so falha tres camadas adiante. Fronteira declarada falha
 * cedo e aponta o dono; fronteira ausente falha tarde e nao aponta ninguem.
 */

import { NAMESPACES_ADITIVOS } from '../layout.mjs';

export const CONTRATO = NAMESPACES_ADITIVOS.provenance;

/**
 * Marcador de superficie ainda nao implementada.
 * `nome` e o que se tentou usar; a mensagem diz qual Slice do Master DAG o entrega.
 */
export function pendente(nome) {
  throw new Error(
    `provenance.${nome} ainda nao implementado; entregue por ${CONTRATO.preenchidoPor.join(' ou ')} ` +
    `(contrato: ${CONTRATO.origem})`
  );
}
