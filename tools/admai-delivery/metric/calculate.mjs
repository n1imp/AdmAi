/**
 * BATERIA de verificação da camada de cálculo.  [Metric Foundation · P7]
 *
 * O QUE MUDOU, E POR QUÊ IMPORTA
 *   Este arquivo já foi dono dos cálculos. Não é mais: eles vivem em
 *   `chaveiro-bot/src/services/metricas/calculo.js`, porque o Dockerfile copia apenas
 *   `chaveiro-bot/` e código de runtime que importasse de `tools/` quebraria o build.
 *
 *   O harness ficou com o papel que lhe cabe — VERIFICAR — e deixou de ter contrato próprio.
 *   Manter uma segunda cópia aqui criaria dois inventários do mesmo contrato, que é exatamente o
 *   defeito R18-04 do lado EOS: as duas podem divergir com todos os gates verdes. Uma autoridade,
 *   um verificador.
 *
 * O QUE ESTA BATERIA PROVA
 *   Cobertura (toda métrica implementável tem cálculo, e nada além), ancoragem no contrato,
 *   os oito números exatos sobre fixture determinística, `INSUFFICIENT` onde um número enganaria,
 *   NÃO-VACUIDADE dos filtros — cada fixture tem linha que o filtro exclui, e removê-la muda o
 *   resultado — determinismo, e as permissões lidas do contrato.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { METRICAS } from '../../../chaveiro-bot/src/services/metricas/registro.js';
import {
  CALCULADORES, FIXTURES, podeVer, verificarAncoragem
} from '../../../chaveiro-bot/src/services/metricas/calculo.js';
import { derivarDisponibilidade, lerModelos, SCHEMA } from './availability.mjs';

/* `noPeriodo` do cálculo é interno; a bateria refaz o recorte só para MEDIR quantas linhas o
   filtro de valor inválido descartou. Refazer aqui é de propósito: usar a função do módulo
   testado para conferir o módulo testado seria comparar o instrumento consigo mesmo. */
const noPeriodo = (data, { inicio, fim }) => {
  if (!inicio && !fim) return true;
  const t = new Date(data).getTime();
  if (Number.isNaN(t)) return false;
  if (inicio && t < new Date(inicio).getTime()) return false;
  if (fim && t > new Date(fim).getTime()) return false;
  return true;
};


/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const F = FIXTURES;
  const C = CALCULADORES;
  const falhas = [];
  const ok = [];
  const check = (id, cond, msg) => (cond ? ok.push(id) : falhas.push(`${id}: ${msg}`));

  /* ---- Cobertura: toda métrica implementável tem cálculo, e nada além ---- */
  /* A lista de implementáveis vem da DERIVAÇÃO sobre o schema, não de uma lista escrita aqui:
     uma migration que crie `Cliente` faz `taxa-recompra` virar implementável e esta checagem
     REPROVAR por falta de cálculo — que é exatamente o alarme desejado. */
  const modelos = existsSync(SCHEMA) ? lerModelos(readFileSync(SCHEMA, 'utf8')) : null;
  const disp = modelos ? derivarDisponibilidade({ metricas: METRICAS, modelosExistentes: modelos }) : null;
  const implementaveis = [...(disp?.implementaveisAgora ?? [])].sort();
  check('CALC-COB-00', disp !== null, 'schema indisponível: sem ele não há como saber o que é implementável');
  const comCalculo = Object.keys(C).sort();
  check('CALC-COB-01', JSON.stringify(implementaveis) === JSON.stringify(comCalculo),
    `implementáveis=[${implementaveis}] com cálculo=[${comCalculo}]`);

  /* ---- Ancoragem no contrato ---- */
  const problemasDeAncoragem = [];
  for (const [id, calc] of Object.entries(C)) {
    problemasDeAncoragem.push(...verificarAncoragem(id, calc, METRICAS.find((m) => m.metricId === id)));
  }
  check('CALC-ANC-01', problemasDeAncoragem.length === 0, problemasDeAncoragem.join('; '));

  /* ---- Os oito números, exatos ---- */
  const esperados = [
    ['faturamento-liquido', C['faturamento-liquido'].calcular(F.servicos, F.periodo).valor, 600],
    ['ticket-medio', C['ticket-medio'].calcular(F.servicos, F.periodo).valor, 200],
    ['comissao-total', C['comissao-total'].calcular(F.servicos, F.periodo).valor, 72],
    ['servicos-concluidos', C['servicos-concluidos'].calcular(F.servicos, F.periodo).valor, 4],
    ['taxa-aprovacao', C['taxa-aprovacao'].calcular(F.servicos, F.periodo, F.empresaComAprovacao).valor, 0.5],
    ['horas-trabalhadas', C['horas-trabalhadas'].calcular(F.registrosDePonto, F.periodo).valor, 8],
    ['nota-media-avaliacao', C['nota-media-avaliacao'].calcular(F.avaliacoes, F.periodo).valor, 4]
  ];
  for (const [id, obtido, esperado] of esperados) {
    check(`CALC-NUM/${id}`, obtido === esperado, `esperado ${esperado}, obtido ${obtido}`);
  }

  const producao = C['producao-por-tecnico'].calcular(F.servicos, F.periodo, F.tecnicos).valor;
  check('CALC-NUM/producao-por-tecnico',
    producao.length === 3 &&
    producao[0].tecnicoId === 10 && producao[0].servicos === 2 && producao[0].valorLiquido === 400 &&
    producao[1].tecnicoId === 11 && producao[1].servicos === 2 && producao[1].valorLiquido === 200,
    `agrupamento inesperado: ${JSON.stringify(producao)}`);
  check('CALC-ZERO-EXPLICITO',
    producao.some((l) => l.tecnicoId === 12 && l.servicos === 0),
    'técnico sem serviço sumiu da lista — "não produziu" virou indistinguível de "não existe"');

  /* ---- `INSUFFICIENT` no lugar de número que engana ---- */
  check('CALC-INSUF/ticket-medio',
    C['ticket-medio'].calcular([], F.periodo).estado === 'INSUFFICIENT',
    'média sem denominador devolveu número em vez de INSUFFICIENT');
  check('CALC-INSUF/taxa-aprovacao',
    C['taxa-aprovacao'].calcular(F.servicos, F.periodo, F.empresaSemAprovacao).estado === 'INSUFFICIENT',
    'empresa sem aprovação ligada precisa devolver INSUFFICIENT, nunca 100%');
  check('CALC-INSUF/nota-media',
    C['nota-media-avaliacao'].calcular(F.avaliacoes.slice(0, 3), F.periodo).estado === 'INSUFFICIENT',
    'média de amostra abaixo do mínimo precisa devolver INSUFFICIENT');
  check('CALC-INSUF-MOTIVO',
    typeof C['ticket-medio'].calcular([], F.periodo).motivo === 'string' &&
    C['ticket-medio'].calcular([], F.periodo).motivo.length > 0,
    'INSUFFICIENT sem motivo é só um buraco');
  check('CALC-INSUF-SEM-VALOR',
    C['ticket-medio'].calcular([], F.periodo).valor === null,
    'INSUFFICIENT não pode carregar valor numérico — seria número com aparência de medida');

  /* ---- NÃO-VACUIDADE: cada filtro, removido, MUDA o resultado ---- */
  const semCancelado = F.servicos.filter((s) => s.status !== 'cancelado');
  const naoVacuo = [
    ['filtro de status', C['faturamento-liquido'].calcular(F.servicos, F.periodo).valor !==
      C['faturamento-liquido'].calcular(F.servicos.map((s) => ({ ...s, status: 'ativo' })), F.periodo).valor],
    ['filtro de período', C['faturamento-liquido'].calcular(F.servicos, F.periodo).valor !==
      C['faturamento-liquido'].calcular(F.servicos, {}).valor],
    ['filtro de valor inválido', C['faturamento-liquido'].calcular(F.servicos, F.periodo).registros !==
      F.servicos.filter((s) => s.status === 'ativo' && noPeriodo(s.criadoEm, F.periodo)).length],
    ['nota nula não conta como zero', C['nota-media-avaliacao'].calcular(F.avaliacoes, F.periodo).registros === 5],
    ['ponto incompleto não entra', C['horas-trabalhadas'].calcular(F.registrosDePonto, F.periodo).incompletos === 1],
    ['a fixture TEM linha excluível por status', semCancelado.length !== F.servicos.length]
  ];
  const vacuos = naoVacuo.filter(([, mudou]) => !mudou).map(([r]) => r);
  check('CALC-NAOVACUO', vacuos.length === 0, `filtro declarado e não aplicado (ou fixture sem alvo): ${vacuos.join('; ')}`);

  /* ---- Determinismo ---- */
  check('CALC-DET',
    JSON.stringify(C['faturamento-liquido'].calcular(F.servicos, F.periodo)) ===
    JSON.stringify(C['faturamento-liquido'].calcular(F.servicos, F.periodo)),
    'duas execuções sobre a mesma entrada divergiram');

  /* ---- Segurança lida do contrato ---- */
  check('CALC-SEC-01', podeVer('faturamento-liquido', 'dono', 'agregado') === true,
    'dono precisa ver o agregado de faturamento');
  check('CALC-SEC-02', podeVer('faturamento-liquido', 'funcionario', 'agregado') === false,
    'funcionário não pode alcançar faturamento agregado');
  /* O ponto que o contrato formaliza: agregado não implica drilldown. */
  check('CALC-SEC-03',
    podeVer('producao-por-tecnico', 'funcionario', 'agregado') === true &&
    podeVer('producao-por-tecnico', 'funcionario', 'drilldown') === false,
    'agregado permitido passou a permitir drilldown — as duas permissões colapsaram');
  check('CALC-SEC-04', podeVer('faturamento-liquido', 'dono', 'registro') === false,
    'nível desconhecido precisa negar, não cair em permissivo');

  /* ---- Saída ---- */
  console.log('AdmAi Metric Foundation — camada de cálculo  [P7]');
  console.log(`  métricas com cálculo : ${comCalculo.length} de ${implementaveis.length} implementáveis`);
  console.log(`  checagens PASS : ${ok.length}   FAIL : ${falhas.length}`);
  for (const f of falhas) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log('  números provados sobre fixture determinística:');
  console.log(`    faturamento-liquido   ${C['faturamento-liquido'].calcular(F.servicos, F.periodo).valor}`);
  console.log(`    ticket-medio          ${C['ticket-medio'].calcular(F.servicos, F.periodo).valor}`);
  console.log(`    comissao-total        ${C['comissao-total'].calcular(F.servicos, F.periodo).valor}`);
  console.log(`    servicos-concluidos   ${C['servicos-concluidos'].calcular(F.servicos, F.periodo).valor}`);
  console.log(`    taxa-aprovacao        ${C['taxa-aprovacao'].calcular(F.servicos, F.periodo, F.empresaComAprovacao).valor}`);
  console.log(`    horas-trabalhadas     ${C['horas-trabalhadas'].calcular(F.registrosDePonto, F.periodo).valor}`);
  console.log(`    nota-media-avaliacao  ${C['nota-media-avaliacao'].calcular(F.avaliacoes, F.periodo).valor}`);
  console.log(`    producao-por-tecnico  ${producao.length} técnicos, incluindo zero explícito`);
  console.log('');
  console.log('    provado: a aritmética, as regras de qualidade e a ancoragem de cada cálculo na');
  console.log('      fórmula do registro. Filtro declarado é filtro APLICADO — cada fixture tem');
  console.log('      linha que o filtro exclui, e removê-la muda o número.');
  console.log('    NÃO provado: que alguma rota já serve estes números. A ligação com `req.db`, o');
  console.log('      escopo de tenant em runtime e os endpoints pertencem à camada de exposição,');
  console.log('      que não está construída. Aritmética correta não é métrica entregue.');

  if (falhas.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use estes números');
    return 2;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(executar());
