/**
 * Metric Foundation — DISPONIBILIDADE derivada do schema.  [Feature METRIC_FOUNDATION · P9]
 *
 * A REGRA QUE ESTE MÓDULO EXISTE PARA IMPOR
 *   A classificação de disponibilidade é DERIVADA, nunca declarada. Se cada métrica trouxesse um
 *   campo `disponibilidade: 'AVAILABLE_NOW'` escrito à mão, ele estaria certo no dia em que foi
 *   escrito e passaria a mentir na primeira migration — exatamente o drift que a regra
 *   `AUTHORITATIVE_DERIVATION_FIRST` proíbe, e que já custou três correções no SL-A-02.
 *
 *   Aqui a fonte autoritativa é o `schema.prisma`. A métrica declara de quais entidades depende
 *   (`sourceEntities`); este módulo lê o schema e responde se elas existem. Ninguém opina.
 *
 * POR QUE A CLASSE NÃO É SÓ "DISPONÍVEL / INDISPONÍVEL"
 *   Saber QUAL modelo falta é o que orienta a ordem das features. `taxa-recompra` e
 *   `conversao-funil` estão as duas indisponíveis, mas a primeira destrava com `Cliente` e a
 *   segunda exige `Lead` + `Oportunidade` + histórico de transição. Colapsar as duas em
 *   "indisponível" perderia justamente a informação que decide o que construir primeiro.
 *
 * PROVENANCE
 *   Os modelos existentes vêm do schema (OBSERVED). A classificação é DERIVED. Nada é INFERRED.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from '../snapshot.mjs';
import { METRICAS } from '../../../chaveiro-bot/src/services/metricas/registro.js';
import { CLASSES_DE_DISPONIBILIDADE } from '../../../chaveiro-bot/src/services/metricas/contrato.js';

export const SCHEMA = `${RAIZ}chaveiro-bot/prisma/schema.prisma`;

/**
 * Lê os modelos declarados no schema. Exportada: os controles atravessam esta função.
 * `null` quando o schema não está acessível — indisponível nunca vira lista vazia.
 */
export function lerModelos(fonte) {
  if (typeof fonte !== 'string') return null;
  return [...fonte.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

/**
 * Modelo ausente → classe que NOMEIA o que falta. Ordem de precedência declarada: quando faltam
 * vários, o primeiro da lista manda, porque é o pré-requisito mais profundo.
 */
export const MODELO_PARA_CLASSE = Object.freeze([
  ['Lead', 'REQUIRES_CRM'],
  ['Oportunidade', 'REQUIRES_CRM'],
  ['Cliente', 'REQUIRES_CUSTOMER'],
  ['Agendamento', 'REQUIRES_SCHEDULING'],
  ['Orcamento', 'REQUIRES_BUDGET'],
  ['Garantia', 'REQUIRES_WARRANTY']
]);

/**
 * Classifica uma métrica. PURA nos argumentos — os controles percorrem este caminho.
 *
 * `INSUFFICIENT_DATA` cobre o caso em que o modelo existe mas a métrica precisa de um campo que
 * ele não tem; `DEFINITION_CONFLICT`, o caso em que a própria definição se contradiz. Nenhum dos
 * dois é falha a esconder — são desfechos legítimos que orientam trabalho.
 */
export function classificarMetrica({ metrica, modelosExistentes }) {
  if (modelosExistentes === null) {
    return { classe: 'INSUFFICIENT_DATA', motivo: 'schema indisponível; sem ele nada pode ser afirmado' };
  }
  if (!Array.isArray(metrica.sourceEntities) || metrica.sourceEntities.length === 0) {
    return { classe: 'DEFINITION_CONFLICT', motivo: 'métrica sem sourceEntities — não há como derivar disponibilidade' };
  }

  const faltando = metrica.sourceEntities.filter((e) => !modelosExistentes.includes(e));
  if (faltando.length === 0) {
    return { classe: 'AVAILABLE_NOW', motivo: `todas as entidades existem: ${metrica.sourceEntities.join(', ')}` };
  }

  for (const [modelo, classe] of MODELO_PARA_CLASSE) {
    if (faltando.includes(modelo)) {
      return { classe, motivo: `falta o modelo ${modelo}${faltando.length > 1 ? ` (e também ${faltando.filter((f) => f !== modelo).join(', ')})` : ''}` };
    }
  }

  return { classe: 'INSUFFICIENT_DATA', motivo: `entidade ausente e não mapeada a uma classe: ${faltando.join(', ')}` };
}

/** Deriva a classificação de todas as métricas. */
export function derivarDisponibilidade({ metricas, modelosExistentes }) {
  const resultados = metricas.map((m) => ({
    metricId: m.metricId,
    familia: m.familia,
    ...classificarMetrica({ metrica: m, modelosExistentes })
  }));

  const porClasse = {};
  for (const r of resultados) (porClasse[r.classe] ??= []).push(r.metricId);

  return {
    resultados,
    porClasse,
    implementaveisAgora: resultados.filter((r) => r.classe === 'AVAILABLE_NOW').map((r) => r.metricId)
  };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const modelos = existsSync(SCHEMA) ? lerModelos(readFileSync(SCHEMA, 'utf8')) : null;
  const real = derivarDisponibilidade({ metricas: METRICAS, modelosExistentes: modelos });

  /* Controles do PARSER de modelos — atravessam `lerModelos`. */
  const casosModelo = [
    ['model Servico {\n  id Int\n}', ['Servico']],
    ['model A {}\nmodel B {}', ['A', 'B']],
    ['model   Espacado   {', ['Espacado']],
    ['// model Comentado {', []],
    ['enum Status {', []],
    ['', []]
  ];
  const modeloFalhos = casosModelo
    .filter(([f, esp]) => JSON.stringify(lerModelos(f)) !== JSON.stringify(esp))
    .map(([f]) => JSON.stringify(f.slice(0, 28)));
  const nuloOk = lerModelos(null) === null;

  /* Controles da CLASSIFICAÇÃO. Cada classe alcançável, e a ordem de precedência respeitada. */
  const m = (sourceEntities) => ({ metricId: 'x', sourceEntities });
  const casosClasse = [
    ['tudo existe', m(['Servico']), ['Servico', 'Tecnico'], 'AVAILABLE_NOW'],
    ['falta Cliente', m(['Cliente', 'Servico']), ['Servico'], 'REQUIRES_CUSTOMER'],
    ['falta Agendamento', m(['Agendamento']), ['Servico'], 'REQUIRES_SCHEDULING'],
    ['falta Orcamento', m(['Orcamento']), ['Servico'], 'REQUIRES_BUDGET'],
    ['falta Garantia', m(['Garantia']), ['Servico'], 'REQUIRES_WARRANTY'],
    /* Precedência: faltando Lead E Cliente, CRM manda — é o pré-requisito mais profundo. */
    ['CRM tem precedência sobre Cliente', m(['Lead', 'Cliente']), ['Servico'], 'REQUIRES_CRM'],
    ['entidade ausente não mapeada', m(['EntidadeInventada']), ['Servico'], 'INSUFFICIENT_DATA'],
    ['sem sourceEntities', m([]), ['Servico'], 'DEFINITION_CONFLICT'],
    /* Schema indisponível NUNCA vira AVAILABLE_NOW. */
    ['schema indisponível', m(['Servico']), null, 'INSUFFICIENT_DATA']
  ];
  const classeFalhos = casosClasse
    .filter(([, metrica, mods, esp]) => classificarMetrica({ metrica, modelosExistentes: mods }).classe !== esp)
    .map(([r]) => r);

  /* Controle de REAÇÃO: a derivação precisa mudar quando o schema muda. Sem isto, uma função que
     devolvesse sempre a mesma classe passaria em tudo acima. */
  const comTudo = derivarDisponibilidade({
    metricas: METRICAS,
    modelosExistentes: [...(modelos ?? []), 'Cliente', 'Endereco', 'Agendamento', 'Orcamento', 'Lead', 'Oportunidade', 'Garantia']
  });
  const reage = comTudo.implementaveisAgora.length > real.implementaveisAgora.length;

  console.log('AdmAi Metric Foundation — disponibilidade derivada do schema  [P9]');
  console.log(`  modelos no schema : ${modelos?.length ?? 'UNAVAILABLE'}`);
  console.log(`  métricas no registro : ${METRICAS.length}`);
  console.log('');
  for (const classe of CLASSES_DE_DISPONIBILIDADE) {
    const ids = real.porClasse[classe];
    if (!ids) continue;
    console.log(`  ${classe} (${ids.length})`);
    for (const id of ids) {
      const r = real.resultados.find((x) => x.metricId === id);
      console.log(`    ${id.padEnd(28)} ${r.motivo}`);
    }
  }
  console.log('');
  console.log(`  controles de parser de modelo : ${casosModelo.length - modeloFalhos.length}/${casosModelo.length}` +
    (modeloFalhos.length ? ` — errou: ${modeloFalhos.join(', ')}` : ''));
  console.log(`  schema ausente devolve null   : ${nuloOk}`);
  console.log(`  controles de classificação    : ${casosClasse.length - classeFalhos.length}/${casosClasse.length}` +
    (classeFalhos.length ? ` — errou: ${classeFalhos.join('; ')}` : ''));
  console.log(`  reage a mudança de schema     : ${reage} (com os 7 modelos ausentes: ${comTudo.implementaveisAgora.length} implementáveis, hoje: ${real.implementaveisAgora.length})`);

  if (modeloFalhos.length || classeFalhos.length || !nuloOk || !reage) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use esta classificação');
    return 2;
  }

  console.log(`  IMPLEMENTÁVEIS AGORA (${real.implementaveisAgora.length}) : ${real.implementaveisAgora.join(', ')}`);
  console.log('    derivado: a classe de cada métrica sai do schema.prisma, não de campo declarado.');
  console.log('      Uma migration que crie `Cliente` muda esta saída sozinha — e é essa a razão de');
  console.log('      derivar em vez de anotar: anotação fica certa hoje e mente na próxima migration.');
  console.log('    NÃO derivado: que a métrica AVAILABLE_NOW está correta. Existir a entidade não');
  console.log('      garante que o campo exigido pela fórmula exista nela, nem que a fórmula esteja');
  console.log('      certa. Isto mede PRÉ-REQUISITO DE MODELO, não corretude de cálculo.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
