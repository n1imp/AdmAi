/**
 * Metric Foundation — verificação do contrato.  [Feature METRIC_FOUNDATION · P9]
 *
 * O QUE ESTE VERIFICADOR PROVA
 *   Que o registro de métricas satisfaz o contrato: cadeia decisão→ação fechada, campos presentes,
 *   segurança declarada nos dois eixos, e — o que mais importa — que **drilldown nunca é mais
 *   permissivo que agregado**.
 *
 * POR QUE ESSA ÚLTIMA PROPRIEDADE É O CORAÇÃO
 *   É a diferença entre "o funcionário vê a própria produção" e "o funcionário lista o faturamento
 *   da empresa". Um Metric Hub tem URL previsível; se a permissão de agregado carregasse junto o
 *   direito de abrir os registros subjacentes, bastaria conhecer o endereço. O contrato separa os
 *   dois eixos, e este verificador reprova quem os colapsar.
 *
 * MEDE CONTRATO, NÃO CÁLCULO
 *   Nenhuma fórmula é executada aqui. `faturamento-liquido` pode estar declarada com a fórmula
 *   errada e passar — o que se prova é que ela DECLARA fórmula, fonte, escopo e decisão. Corretude
 *   de cálculo é de quem implementar a camada, com outro teste.
 */

import { pathToFileURL } from 'node:url';
import {
  PAPEIS, CAMPOS_DA_METRICA, FAMILIAS, MODULOS_DE_HUB, ESTADOS_DE_CONFIANCA,
  violacoesDaMetrica, derivarConfianca
} from '../../../chaveiro-bot/src/services/metricas/contrato.js';
import { METRICAS } from '../../../chaveiro-bot/src/services/metricas/registro.js';

/** Avalia o registro. PURA nos argumentos — as sabotagens percorrem este caminho. */
export function avaliarRegistro({ metricas }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  check('MET-01', Array.isArray(metricas) && metricas.length > 0,
    'registro vazio; um contrato sem métrica não prova nada');
  if (!Array.isArray(metricas) || metricas.length === 0) return { falhas, passou };

  /* MET-02 — o contrato de campo, atravessando `violacoesDaMetrica`. */
  const forasDoContrato = metricas
    .map((m) => ({ id: m.metricId, v: violacoesDaMetrica(m) }))
    .filter((x) => x.v.length > 0);
  check('MET-02', forasDoContrato.length === 0,
    `métrica fora do contrato: ${forasDoContrato.slice(0, 2).map((x) => `${x.id} (${x.v[0]})`).join('; ')}`);

  /* MET-03 — identidade única. Duas métricas com o mesmo id fazem o consumidor pegar a errada. */
  const ids = metricas.map((m) => m.metricId);
  check('MET-03', new Set(ids).size === ids.length,
    `metricId repetido: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')}`);

  /* MET-04 — a cadeia obrigatória, fechada até a AÇÃO. Métrica que não muda nada é decoração. */
  const semAcao = metricas.filter((m) => (m.decisionSupported ?? []).some((d) => !d.acao || d.acao.trim() === ''));
  check('MET-04', semAcao.length === 0,
    `decisão sem ação possível: ${semAcao.map((m) => m.metricId).join(', ')}`);

  /* MET-05 — SEGURANÇA. Drilldown nunca mais permissivo que agregado. */
  const escalada = metricas.filter((m) => {
    const s = m.securityScope ?? {};
    return (s.drilldown ?? []).some((p) => !(s.agregado ?? []).includes(p));
  });
  check('MET-05', escalada.length === 0,
    `drilldown mais permissivo que agregado em: ${escalada.map((m) => m.metricId).join(', ')} — ver o total não autoriza listar os registros`);

  /* MET-06 — nenhuma métrica sem escopo de tenant. O produto é multi-tenant por inteiro. */
  const semTenant = metricas.filter((m) => !m.securityScope?.tenantScope);
  check('MET-06', semTenant.length === 0,
    `métrica sem tenantScope: ${semTenant.map((m) => m.metricId).join(', ')}`);

  /* MET-07 — lineage: quem expõe registros subjacentes precisa declarar quem pode vê-los. */
  const semLineage = metricas.filter((m) => !(m.hubModules ?? []).includes('Lineage'));
  check('MET-07', semLineage.length === 0,
    `métrica sem módulo Lineage: ${semLineage.map((m) => m.metricId).join(', ')} — agregado sem origem explicável`);

  /* MET-08 — vocabulários fechados. */
  const familiaRuim = metricas.filter((m) => !FAMILIAS.includes(m.familia));
  check('MET-08a', familiaRuim.length === 0, `família inválida: ${familiaRuim.map((m) => m.metricId).join(', ')}`);
  const moduloRuim = metricas.filter((m) => (m.hubModules ?? []).some((x) => !MODULOS_DE_HUB.includes(x)));
  check('MET-08b', moduloRuim.length === 0, `módulo de Hub inválido: ${moduloRuim.map((m) => m.metricId).join(', ')}`);
  const papelRuim = metricas.filter((m) => (m.decisionSupported ?? []).some((d) => !PAPEIS.includes(d.papel)));
  check('MET-08c', papelRuim.length === 0, `papel inválido: ${papelRuim.map((m) => m.metricId).join(', ')}`);

  return { falhas, passou };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const real = avaliarRegistro({ metricas: METRICAS });

  const base = METRICAS[0];
  const troca = (patch) => METRICAS.map((m) => (m.metricId === base.metricId ? { ...m, ...patch } : m));

  const sabotagens = [
    ['MET-01', 'registro vazio', { metricas: [] }],
    ['MET-02', 'métrica sem businessQuestion', { metricas: troca({ businessQuestion: '' }) }],
    ['MET-02', 'métrica sem fórmula', { metricas: troca({ formula: '' }) }],
    ['MET-02', 'métrica sem decisão associada', { metricas: troca({ decisionSupported: [] }) }],
    ['MET-02', 'métrica sem sourceEntities', { metricas: troca({ sourceEntities: [] }) }],
    ['MET-03', 'metricId duplicado', { metricas: [...METRICAS, METRICAS[0]] }],
    ['MET-04', 'decisão sem ação', { metricas: troca({ decisionSupported: [{ papel: 'dono', decisao: 'algo', acao: '' }] }) }],
    /* O controle que dá razão ao contrato de segurança. */
    ['MET-05', 'funcionário com drilldown sem agregado',
      { metricas: troca({ securityScope: { agregado: ['dono'], drilldown: ['dono', 'funcionario'], tenantScope: 'empresa' } }) }],
    ['MET-06', 'métrica sem tenantScope',
      { metricas: troca({ securityScope: { agregado: ['dono'], drilldown: ['dono'] } }) }],
    ['MET-07', 'métrica sem Lineage', { metricas: troca({ hubModules: ['Hero'] }) }],
    ['MET-08a', 'família inexistente', { metricas: troca({ familia: 'INVENTADA' }) }],
    ['MET-08b', 'módulo de Hub inexistente', { metricas: troca({ hubModules: ['Hero', 'Lineage', 'ModuloFalso'] }) }],
    ['MET-08c', 'papel inexistente', { metricas: troca({ decisionSupported: [{ papel: 'tecnico', decisao: 'x', acao: 'y' }] }) }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , e]) => !avaliarRegistro(e).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: o registro real precisa ser ACEITO. Sem ele, um avaliador que reprovasse
     tudo exibiria 13/13 sabotagens e pareceria rigoroso. */
  const positivo = real.falhas.length === 0;

  /* Controles da CONFIANÇA — atravessam `derivarConfianca`, nas duas direções. */
  const casosConfianca = [
    ['sem contagem', { recordCount: null, coverage: 1 }, 'INSUFFICIENT'],
    ['zero registros', { recordCount: 0, coverage: 1 }, 'INSUFFICIENT'],
    ['dimensão não suportada', { recordCount: 100, coverage: 1, unsupportedDimension: true }, 'INSUFFICIENT'],
    ['cobertura baixa', { recordCount: 100, coverage: 0.3 }, 'LOW'],
    ['muitos inválidos', { recordCount: 100, coverage: 1, invalidValues: 20 }, 'LOW'],
    ['cobertura parcial', { recordCount: 100, coverage: 0.7 }, 'MEDIUM'],
    ['dado velho', { recordCount: 100, coverage: 1, freshnessHoras: 48 }, 'MEDIUM'],
    ['tudo bem', { recordCount: 100, coverage: 1, freshnessHoras: 1 }, 'HIGH']
  ];
  const confiancaFalhos = casosConfianca
    .filter(([, e, esp]) => derivarConfianca(e) !== esp)
    .map(([r]) => r);

  console.log('AdmAi Metric Foundation — verificação do contrato  [P9]');
  console.log(`  métricas : ${METRICAS.length} em ${new Set(METRICAS.map((m) => m.familia)).size} famílias`);
  console.log(`  campos exigidos por métrica : ${CAMPOS_DA_METRICA.length}`);
  console.log(`  checagens PASS : ${real.passou.length}`);
  console.log(`  checagens FAIL : ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NÃO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo ? 'registro real aceito' : 'REJEITOU o registro real'}`);
  console.log(`  MET-CONF-01 (estados de confiança determinísticos) : ${casosConfianca.length - confiancaFalhos.length}/${casosConfianca.length}` +
    (confiancaFalhos.length ? ` — errou: ${confiancaFalhos.join(', ')}` : ''));

  if (negFalhos.length || !positivo || confiancaFalhos.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use este resultado como evidência');
    return 2;
  }

  console.log('  CONTRATO_DE_METRICA_VERIFICADO');
  console.log('    provado: toda métrica fecha a cadeia até a AÇÃO, declara fonte e escopo de');
  console.log('      tenant, tem módulo de Lineage, e — o ponto — nenhum papel tem drilldown sem');
  console.log('      ter agregado. Um funcionário não alcança registro por conhecer a URL do Hub.');
  console.log(`      A confiança é derivada de critérios explícitos (${ESTADOS_DE_CONFIANCA.join('/')}), nunca um`);
  console.log('      percentual inventado, e zero registro devolve INSUFFICIENT em vez de zero.');
  console.log('    NÃO provado: que as fórmulas estão certas. Nenhuma é executada aqui — isto mede');
  console.log('      CONTRATO, não CÁLCULO. Uma métrica com fórmula errada e contrato completo');
  console.log('      passa, e é a implementação da camada que precisa provar o número.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
