/**
 * Verificação da camada de EXPOSIÇÃO das métricas.  [Metric Foundation]
 *
 * O QUE ESTA BATERIA ALCANÇA — e o que ela NÃO alcança
 *   Ela é PURA: exercita autorização, allowlist, estados de resposta e comparação sem banco e sem
 *   HTTP. Isso a torna rápida e determinística, e é exatamente por isso que ela não prova
 *   isolamento de tenant nem consistência agregado↔registros — essas exigem banco de verdade e
 *   estão em `test/integration/metricas_exposicao.test.js`.
 *
 *   Dizer que "a exposição está verificada" olhando só para cá seria a mesma sobreafirmação que o
 *   MAR-INV-025 proíbe: o que está provado aqui é a LÓGICA de decisão, não o comportamento servido.
 *
 * A CHECAGEM ESTRUTURAL QUE VALE MAIS QUE AS OUTRAS
 *   `EXP-ESTRUTURA-01` lê o router e reprova se aritmética de métrica aparecer nele. É o guarda
 *   contra o defeito mais caro desta camada: alguém reimplementar "só a somazinha" no controller e
 *   criar uma segunda definição da métrica — a não verificada, e justamente a que o usuário vê.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from '../snapshot.mjs';
import { METRICAS, PERMISSAO_POR_METRICA, papeisComPermissao } from '../../../chaveiro-bot/src/services/metricas/registro.js';
import { CALCULADORES, agruparPorDimensao, serieTemporal } from '../../../chaveiro-bot/src/services/metricas/calculo.js';
import { CONSULTAS, PROIBIDOS_DIRETO } from '../../../chaveiro-bot/src/services/metricas/consulta.js';
import {
  ESTADOS_DA_RESPOSTA, FILTROS_PROIBIDOS, autorizarAgregado, autorizarDrilldown,
  camposPermitidos, compararValores, estadoDoResultado, montarResposta, politicaDaMetrica,
  redigirRegistros,
  servivel, validarPedido
} from '../../../chaveiro-bot/src/services/metricas/exposicao.js';

const ROUTER = `${RAIZ}chaveiro-bot/src/routes/metricas.js`;
const CONSULTA_JS = `${RAIZ}chaveiro-bot/src/services/metricas/consulta.js`;

/** Usuários sintéticos. `permissoesEfetivas` ausente força o cálculo pelo preset real do papel. */
const dono = { papel: 'dono' };
const gestor = { papel: 'gestor' };
const funcionario = { papel: 'funcionario', tecnicoId: 42 };
/* O caso que uma lista de papéis erraria: funcionário COM override de financeiro. */
const funcionarioComOverride = { papel: 'funcionario', tecnicoId: 7, permissoes: { financeiro: { ver: true } } };

export function executar() {
  const falhas = [];
  const ok = [];
  const check = (id, cond, msg) => (cond ? ok.push(id) : falhas.push(`${id}: ${msg}`));

  const faturamento = METRICAS.find((m) => m.metricId === 'faturamento-liquido');
  const producao = METRICAS.find((m) => m.metricId === 'producao-por-tecnico');

  /* ---------------- Autorização ---------------- */

  check('EXP-AUTH-01', autorizarAgregado(dono, faturamento).autorizado === true,
    'dono precisa alcançar o agregado');
  check('EXP-AUTH-02', autorizarAgregado(gestor, faturamento).autorizado === true,
    'gestor tem financeiro.ver no preset');
  check('EXP-AUTH-03', autorizarAgregado(funcionario, faturamento).autorizado === false,
    'funcionário sem override não pode alcançar faturamento');

  /* O ponto do desenho: a autoridade é `pode()`, que enxerga OVERRIDE. Uma lista de papéis
     responderia "não" aqui, e estaria errada — o usuário tem a permissão de verdade. */
  check('EXP-AUTH-04', autorizarAgregado(funcionarioComOverride, faturamento).autorizado === true,
    'override concedido foi ignorado — a autorização não está usando pode()');

  const auto = autorizarAgregado(funcionario, producao);
  check('EXP-AUTH-05', auto.autorizado === true && auto.escopo === 'PROPRIO',
    'funcionário precisa ver a PRÓPRIA produção, em escopo PROPRIO');
  check('EXP-AUTH-06', autorizarAgregado(dono, producao).escopo === 'EMPRESA',
    'dono precisa ver o agregado da empresa, não um recorte');

  /* Agregado permitido NÃO implica drilldown. */
  check('EXP-AUTH-07', autorizarDrilldown(funcionario, producao).autorizado === false,
    'auto-escopo vazou para o drilldown — ver o próprio número não é ver os registros');
  check('EXP-AUTH-08', autorizarDrilldown(gestor, producao).autorizado === true,
    'quem tem a permissão de módulo precisa alcançar os registros');

  /* Funcionário sem `tecnicoId` não vira escopo PROPRIO: não há de quem recortar. */
  check('EXP-AUTH-09', autorizarAgregado({ papel: 'funcionario' }, producao).autorizado === false,
    'conta sem técnico vinculado não pode receber escopo PROPRIO');

  /* ---------------- Allowlist ---------------- */

  check('EXP-FILT-01', validarPedido(faturamento, { dimensao: 'tecnico' }).length === 0,
    'dimensão declarada precisa ser aceita');
  check('EXP-FILT-02', validarPedido(faturamento, { dimensao: 'salario' }).length > 0,
    'dimensão não declarada precisa REPROVAR, não ser ignorada');
  check('EXP-FILT-03', validarPedido(faturamento, { filtros: { inventado: 1 } }).length > 0,
    'filtro arbitrário do cliente não pode passar');
  check('EXP-FILT-04', validarPedido(faturamento, { periodo: 'decada' }).length > 0,
    'período fora da lista precisa reprovar');
  check('EXP-FILT-05', validarPedido(faturamento, { periodo: 'personalizado' }).length > 0,
    'personalizado sem inicio/fim precisa reprovar');
  check('EXP-FILT-06', validarPedido(faturamento, { inicio: '2026-05-01', fim: '2026-01-01' }).length > 0,
    'janela invertida precisa reprovar');

  /* Tenant NUNCA é parâmetro do cliente — em nenhuma grafia. */
  const tenantFalhos = FILTROS_PROIBIDOS.filter((p) => validarPedido(faturamento, { [p]: 1 }).length === 0);
  check('EXP-FILT-07', tenantFalhos.length === 0,
    `tenant aceito como parâmetro: ${tenantFalhos.join(', ')}`);

  /* ---------------- Estados de resposta ---------------- */

  check('EXP-EST-01', estadoDoResultado({ estado: 'OK', valor: 10 }) === 'VALUE', 'resultado OK devia ser VALUE');
  check('EXP-EST-02', estadoDoResultado({ estado: 'INSUFFICIENT', motivo: 'x', valor: null }) === 'INSUFFICIENT_DATA',
    'INSUFFICIENT precisa chegar como INSUFFICIENT_DATA');
  /* Falha de consulta NUNCA se disfarça de dado insuficiente. */
  check('EXP-EST-03', estadoDoResultado(null) === 'UNAVAILABLE',
    'ausência de resultado virou dado insuficiente — esconde incidente atrás de estado normal');
  check('EXP-EST-04', ESTADOS_DA_RESPOSTA.length === 4 && !ESTADOS_DA_RESPOSTA.includes('ZERO'),
    'estado de resposta não pode incluir zero como categoria');

  const respInsuf = montarResposta({
    metrica: faturamento,
    resultado: { estado: 'INSUFFICIENT', motivo: 'sem denominador', valor: null },
    janela: { gte: new Date('2026-03-01'), lte: new Date('2026-03-31') },
    escopo: 'EMPRESA'
  });
  check('EXP-EST-05', respInsuf.status === 'INSUFFICIENT_DATA' && respInsuf.value === null,
    'INSUFFICIENT_DATA carregou valor — zero disfarçado de medida');
  check('EXP-EST-06', typeof respInsuf.reason === 'string' && respInsuf.reason.length > 0,
    'INSUFFICIENT sem motivo não diz ao consumidor o que fazer');

  /* Lineage precisa existir e não pode vazar interno. */
  check('EXP-LIN-01', Boolean(respInsuf.lineage?.formula) && Array.isArray(respInsuf.lineage?.sourceEntities),
    'resposta sem lineage: número sem procedência não se discute');
  const serializado = JSON.stringify(respInsuf);
  check('EXP-LIN-02', !/SELECT |empresaId|prisma/i.test(serializado),
    'lineage vazou interno de implementação ou identificador de tenant');

  /* ---------------- Comparação ---------------- */

  check('EXP-CMP-01', compararValores(120, 100)?.variacaoPercentual === 20, 'variação percentual errada');
  check('EXP-CMP-02', compararValores(80, 100)?.direcao === 'CAIU', 'direção errada na queda');
  /* Sem base anterior, a direção é DESCONHECIDA — não "subiu infinito", nem 100%. */
  check('EXP-CMP-03', compararValores(50, 0)?.variacaoPercentual === null &&
    compararValores(50, 0)?.direcao === 'SEM_BASE',
    'divisão por zero virou percentual — a métrica inventaria crescimento');
  check('EXP-CMP-04', compararValores(10, null) === null,
    'comparação sem valor anterior precisa ser nula, não zero');

  /* ---------------- Cobertura e consistência ---------------- */

  const semConsulta = Object.keys(CALCULADORES).filter((id) => !CONSULTAS[id]);
  check('EXP-COB-01', semConsulta.length === 0,
    `cálculo sem consulta declarada (seria NOT_APPLICABLE em runtime): ${semConsulta.join(', ')}`);
  const semCalculo = Object.keys(CONSULTAS).filter((id) => !CALCULADORES[id]);
  check('EXP-COB-02', semCalculo.length === 0, `consulta sem cálculo: ${semCalculo.join(', ')}`);
  check('EXP-COB-03', METRICAS.every((m) => PERMISSAO_POR_METRICA[m.metricId]),
    'métrica sem permissão declarada ficaria sem autoridade de acesso');
  check('EXP-COB-04', servivel('faturamento-liquido') && !servivel('taxa-recompra'),
    'servivel() não distingue métrica implementada de métrica só declarada');

  /* Drilldown nunca mais permissivo que agregado — por construção, e conferido. */
  const maisPermissivo = METRICAS.filter((m) =>
    m.securityScope.drilldown.some((p) => !m.securityScope.agregado.includes(p)));
  check('EXP-SEC-01', maisPermissivo.length === 0,
    `drilldown mais permissivo que agregado: ${maisPermissivo.map((m) => m.metricId).join(', ')}`);

  /* A derivação precisa REAGIR ao RBAC: se `papeisComPermissao` devolvesse sempre a mesma coisa,
     todos os controles acima passariam e a ancoragem seria decorativa. */
  check('EXP-SEC-02',
    papeisComPermissao({ modulo: 'usuarios', acao: 'editar' }).length <
    papeisComPermissao({ modulo: 'servicos', acao: 'ver' }).length,
    'a derivação de papéis não reage ao preset — só o dono gerencia usuários, mas gestor vê serviços');

  /* ---------------- Agrupamento e série ----------------
     A regressão que o incidente do `?dimensao=` exige: parâmetro ACEITO e sem efeito reprova. */

  const DIA = '2026-04-10T10:00:00Z';
  const OUTRO_DIA = '2026-04-11T10:00:00Z';
  const linhas = [
    { id: 1, tecnicoId: 1, local: 'Centro', status: 'ativo', criadoEm: DIA, valorLiquido: 10 },
    { id: 2, tecnicoId: 1, local: 'Norte', status: 'ativo', criadoEm: DIA, valorLiquido: 20 },
    { id: 3, tecnicoId: 2, local: 'Centro', status: 'ativo', criadoEm: OUTRO_DIA, valorLiquido: 30 },
    { id: 4, tecnicoId: 2, local: 'Centro', status: 'cancelado', criadoEm: DIA, valorLiquido: 99 }
  ];
  const ctxTec = { tecnicos: [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno' }] };
  const porTecnico = agruparPorDimensao('servicos-concluidos', linhas, {}, 'tecnico', ctxTec);
  const porLocal = agruparPorDimensao('servicos-concluidos', linhas, {}, 'local', {});
  const porDia = agruparPorDimensao('servicos-concluidos', linhas, {}, 'dia', {});

  check('EXP-GRP-01', porTecnico?.grupos.length === 2, 'agrupamento por técnico não produziu 2 grupos');
  check('EXP-GRP-02', porTecnico?.grupos.every((g) => ['Ana', 'Bruno'].includes(g.rotulo)),
    'rótulo do técnico não foi resolvido pelo contexto');
  /* O total dos grupos precisa bater com o agregado — senão o breakdown contradiz o Hero. */
  check('EXP-GRP-03',
    porTecnico.grupos.reduce((t, g) => t + g.valor, 0) ===
    CALCULADORES['servicos-concluidos'].calcular(linhas, {}).valor,
    'a soma dos grupos diverge do agregado — breakdown e Hero contariam coisas diferentes');

  /* A REGRESSÃO PEDIDA: dimensões diferentes precisam produzir agrupamentos DIFERENTES. Um
     parâmetro aceito e ignorado devolveria a mesma coisa para as três, e antes devolvia. */
  const assinatura = (b) => JSON.stringify(b?.grupos.map((g) => [g.rotulo, g.valor]));
  check('EXP-GRP-04',
    new Set([assinatura(porTecnico), assinatura(porLocal), assinatura(porDia)]).size === 3,
    'dimensões diferentes produziram o MESMO agrupamento — o parâmetro está sendo ignorado');
  check('EXP-GRP-05', agruparPorDimensao('servicos-concluidos', linhas, {}, 'inventada', {}) === null,
    'dimensão desconhecida agrupou em vez de recusar');

  /* Escopo alcança o RÓTULO, não só a linha — a regra que `producao-por-tecnico` gerou. */
  const soAna = agruparPorDimensao('servicos-concluidos', linhas, {}, 'tecnico', { tecnicos: [{ id: 1, nome: 'Ana' }] });
  check('EXP-GRP-06',
    soAna.grupos.length === 1 && !JSON.stringify(soAna).includes('Bruno') && !JSON.stringify(soAna).includes('"2"'),
    'contexto recortado ainda deixou vazar rótulo ou id de outro técnico');

  const janela = { gte: new Date('2026-04-10T00:00:00Z'), lte: new Date('2026-04-12T23:59:59Z') };
  const serie = serieTemporal('servicos-concluidos', linhas, janela, {});
  check('EXP-SER-01', serie?.pontos.length === 3, `série devia cobrir 3 dias, tem ${serie?.pontos.length}`);
  /* Dia sem serviço entra com zero: pular o dia desenharia linha contínua onde houve queda. */
  check('EXP-SER-02', serie.pontos.some((p) => p.valor === 0), 'dia vazio sumiu da série em vez de valer zero');
  check('EXP-SER-03', serie.pontos.reduce((t, p) => t + (p.valor ?? 0), 0) === 3,
    'a série não soma o agregado do período');
  check('EXP-SER-04', serieTemporal('servicos-concluidos', linhas, null, {}) === null,
    'série sem janela devolveu algo em vez de null');

  /* Granularidade vem do contrato. `dia` é declarada; `semana` não, e precisa REPROVAR. */
  const sc = METRICAS.find((m) => m.metricId === 'servicos-concluidos');
  check('EXP-SER-05', validarPedido(sc, { granularidade: 'dia' }).length === 0,
    'granularidade declarada foi recusada');
  check('EXP-SER-06', validarPedido(sc, { granularidade: 'semana' }).length > 0,
    'granularidade NÃO declarada foi aceita — a camada HTTP decidindo semântica temporal');

  /* ---------------- Política de campo (Hub #2) ----------------
     A capacidade que a primeira vertical não exercitou: ver a métrica não é ver todos os campos
     que a sustentam. */

  const receita = METRICAS.find((m) => m.metricId === 'faturamento-liquido');

  /* Alcançável só por override: preset nenhum produz financeiro sem tecnicos. É ele que torna a
     política não-vacua — sem esse caso, "campo redigido" e "campo inexistente" seriam iguais. */
  const soFinanceiro = { papel: 'funcionario', tecnicoId: 5, permissoes: { financeiro: { ver: true } } };

  const doGestor = camposPermitidos(receita, gestor);
  const doRestrito = camposPermitidos(receita, soFinanceiro);
  const doFuncionario = camposPermitidos(receita, funcionario);

  /* CONTROLE POSITIVO — sem ele, uma API que apagasse TUDO passaria em todos os negativos. */
  check('EXP-FIELD-01', doGestor.omitidos.length === 0,
    `gestor tem financeiro.ver e tecnicos.ver: nada devia ser omitido, omitiu ${doGestor.omitidos}`);

  check('EXP-FIELD-02', doRestrito.omitidos.length === 1 && doRestrito.omitidos[0] === 'comissaoGerada',
    `com financeiro.ver e sem tecnicos.ver, só comissaoGerada devia sair; saiu ${doRestrito.omitidos}`);
  check('EXP-FIELD-03', doRestrito.permitidos.includes('valorLiquido'),
    'valor foi omitido de quem tem financeiro.ver — a política está negando demais');
  check('EXP-FIELD-04', doFuncionario.omitidos.length === 4,
    `sem permissão nenhuma os quatro campos financeiros deviam sair; saíram ${doFuncionario.omitidos}`);

  /* Política que esquece um campo é pior que política nenhuma: parece completa. */
  const FINANCEIROS = ['valorCobrado', 'valorMaterial', 'valorLiquido', 'comissaoGerada'];
  const naoNomeados = FINANCEIROS.filter((c) => !(c in (receita.fieldPolicy ?? {})));
  check('EXP-FIELD-05', naoNomeados.length === 0,
    `campo financeiro sem política declarada: ${naoNomeados.join(', ')}`);

  /* A redação acontece no SERVIDOR: o campo não existe no payload, não vem escondido. */
  const linha = {
    id: 1, tecnicoId: 2, local: 'Centro', criadoEm: '2026-04-01',
    valorCobrado: 300, valorMaterial: 100, valorLiquido: 200, comissaoGerada: 24
  };
  const redigido = redigirRegistros(receita, [linha], soFinanceiro);
  check('EXP-FIELD-06', !('comissaoGerada' in redigido.registros[0]),
    'comissaoGerada veio no payload para quem não pode vê-la — redação de fachada');
  check('EXP-FIELD-07', redigido.registros[0].valorLiquido === 200,
    'campo autorizado sumiu junto com o proibido');
  check('EXP-FIELD-08', !JSON.stringify(redigido).includes('24'),
    'o valor da comissão sobreviveu em algum lugar do payload redigido');
  check('EXP-FIELD-09', redigido.camposOmitidos.includes('comissaoGerada'),
    'a omissão não é declarada — a UI mostraria coluna vazia como se fosse zero');

  /* Campo sem política passa: id, local e data não são segredo. */
  check('EXP-FIELD-10', redigido.registros[0].local === 'Centro' && redigido.registros[0].id === 1,
    'campo não sensível foi redigido — a política está cobrindo o que não deve');

  /* Métrica SEM política própria herda a PADRÃO — e este controle já afirmou o contrário.
     A versão anterior exigia que `servicos-concluidos` não redigisse nada, o que descrevia o
     desenho antigo (política por métrica) e virou falso no momento em que o drilldown passou a
     carregar os campos financeiros para todas: o campo protegido no Hub #1 voltaria a sair.
     A sensibilidade é do CAMPO. Uma métrica pode endurecer, nunca afrouxar. */
  const semPolitica = redigirRegistros(
    METRICAS.find((m) => m.metricId === 'servicos-concluidos'), [linha], funcionario);
  check('EXP-FIELD-11', semPolitica.camposOmitidos.includes('valorLiquido'),
    'métrica sem fieldPolicy própria NÃO herdou a proteção padrão — o campo financeiro vazaria por ela');
  check('EXP-FIELD-12', !('comissaoGerada' in semPolitica.registros[0]),
    'comissão saiu por uma métrica que não declara política — a proteção não pode depender de lembrar');

  /* E a herança não pode afrouxar: a métrica financeira exige MAIS, e continua exigindo. */
  const receitaPolicy = politicaDaMetrica(receita);
  check('EXP-FIELD-13', receitaPolicy.comissaoGerada.length === 2,
    'a fusão perdeu uma exigência — união de permissões, nunca substituição');

  /* ---------------- Predicado compartilhado (Hub #2) ----------------
     O drilldown lista exatamente o que o cálculo somou. As duas métricas com Hub têm predicados
     DIFERENTES, e é isso que o controle precisa provar: um filtro genérico serviria uma e trairia
     a outra. */
  const AMOSTRA = [
    { id: 1, status: 'ativo', criadoEm: '2026-04-10', valorLiquido: 100 },
    { id: 2, status: 'ativo', criadoEm: '2026-04-11', valorLiquido: -50 },
    { id: 3, status: 'cancelado', criadoEm: '2026-04-10', valorLiquido: 999 }
  ];
  const elegReceita = CALCULADORES['faturamento-liquido'].elegiveis(AMOSTRA, {});
  const elegContagem = CALCULADORES['servicos-concluidos'].elegiveis(AMOSTRA, {});

  check('EXP-PRED-01', elegReceita.length === 1,
    `receita descarta valor inválido: esperado 1 elegível, veio ${elegReceita.length}`);
  check('EXP-PRED-02', elegContagem.length === 2,
    `contagem não olha valor: esperado 2 elegíveis, veio ${elegContagem.length}`);
  check('EXP-PRED-03', elegReceita.length !== elegContagem.length,
    'os dois predicados coincidiram — um filtro genérico esconderia a diferença que importa');

  /* SOURCE_SET_CONSISTENCY: a lista É o conjunto que o agregado usou. */
  const agregadoReceita = CALCULADORES['faturamento-liquido'].calcular(AMOSTRA, {});
  check('EXP-PRED-04', agregadoReceita.registros === elegReceita.length,
    'o agregado contou um conjunto diferente do que o drilldown listaria');
  /* VISIBLE_FIELD_RECONSTRUCTION: só para quem vê o campo, e aqui vê. */
  check('EXP-PRED-05', elegReceita.reduce((t, r) => t + r.valorLiquido, 0) === agregadoReceita.valor,
    'a soma dos registros autorizados não reconstrói o agregado');

  /* ---------------- Estrutura ---------------- */

  const routerSrc = existsSync(ROUTER) ? readFileSync(ROUTER, 'utf8') : null;
  check('EXP-ESTRUTURA-00', routerSrc !== null, 'router de métricas ausente');
  if (routerSrc) {
    /* Aritmética de métrica no controller criaria uma segunda definição — a não verificada. */
    const semComentario = routerSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    check('EXP-ESTRUTURA-01', !/reduce\(|_sum|aggregate\(|\/ *linhas\.length/.test(semComentario),
      'aritmética de métrica apareceu no router — a fórmula precisa ficar em calculo.js');
    check('EXP-ESTRUTURA-02', /req\.db/.test(semComentario),
      'router não usa req.db: escopo de tenant deixaria de ser estrutural');
    /* Sem `switch` por métrica: acrescentar métrica não pode exigir tocar o controller. */
    check('EXP-ESTRUTURA-03', !/switch *\(/.test(semComentario),
      'switch por métrica no router — o registro deixou de escolher');
  }

  const consultaSrc = existsSync(CONSULTA_JS) ? readFileSync(CONSULTA_JS, 'utf8') : null;
  if (consultaSrc) {
    /* `BatidaPonto` não está em MODELOS_ESCOPADOS: consulta direta vazaria entre tenants.
       Comentário fora da varredura — o cabeçalho de `consulta.js` cita a forma proibida para
       explicá-la, e a primeira execução deste controle acusou justamente esse texto. Documentar o
       que não fazer não pode reprovar quem documentou. */
    const semComentarioConsulta = consultaSrc
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
    const diretos = PROIBIDOS_DIRETO.filter((m) => new RegExp(`db\\.${m}\\.`).test(semComentarioConsulta));
    check('EXP-ESTRUTURA-04', diretos.length === 0,
      `consulta direta a modelo NÃO escopado por tenant: ${diretos.join(', ')} — precisa vir por relação`);
  }

  /* ---------------- Controles dos próprios controles estruturais ----------------
     Sem isto, `EXP-ESTRUTURA-01` e `-04` passariam por não encontrarem nada — inclusive se as
     regex estivessem quebradas. Um guarda que nunca dispara não é guarda; é decoração que
     tranquiliza. Cada um recebe uma fonte sintética com a violação que ele existe para pegar. */
  const varrerProibidos = (fonte) => PROIBIDOS_DIRETO
    .filter((m) => new RegExp(`db\\.${m}\\.`).test(
      fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')));
  const temAritmetica = (fonte) => /reduce\(|_sum|aggregate\(|\/ *linhas\.length/.test(
    fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 '));

  const sabotagens = [
    ['consulta direta a BatidaPonto é detectada',
      varrerProibidos('const b = await db.batidaPonto.findMany({});').length === 1],
    ['citação em COMENTÁRIO não é detectada como violação',
      varrerProibidos('/* nunca faça db.batidaPonto.findMany */ const x = 1;').length === 0],
    ['soma no router é detectada',
      temAritmetica('const total = linhas.reduce((a, b) => a + b.valor, 0);') === true],
    ['média disfarçada no router é detectada',
      temAritmetica('const media = soma / linhas.length;') === true],
    ['agregação Prisma no router é detectada',
      temAritmetica('await req.db.servico.aggregate({ _sum: { valorLiquido: true } });') === true],
    ['router legítimo não é acusado',
      temAritmetica('const r = CALCULADORES[id].calcular(linhas, janela, extra);') === false]
  ];
  const sabFalhos = sabotagens.filter(([, ok]) => !ok).map(([r]) => r);
  check('EXP-ESTRUTURA-05', sabFalhos.length === 0,
    `guarda estrutural que não dispara quando deveria (ou dispara sem motivo): ${sabFalhos.join('; ')}`);

  /* ---------------- Saída ---------------- */

  console.log('AdmAi Metric Foundation — camada de exposição  [P7]');
  console.log(`  métricas servíveis : ${Object.keys(CONSULTAS).length} de ${METRICAS.length} no contrato`);
  console.log(`  checagens PASS : ${ok.length}   FAIL : ${falhas.length}`);
  for (const f of falhas) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log('    provado aqui: autorização por pode() — que enxerga override, ao contrário de uma');
  console.log('      lista de papéis; allowlist que REJEITA em vez de ignorar; INSUFFICIENT e');
  console.log('      UNAVAILABLE que não viram zero nem um ao outro; e que a fórmula não vazou para');
  console.log('      o router.');
  console.log('    NÃO provado aqui: isolamento de tenant e consistência agregado↔registros. Os dois');
  console.log('      exigem banco e estão em test/integration/metricas_exposicao.test.js — esta');
  console.log('      bateria é pura, e chamar isso de "exposição verificada" seria sobreafirmar.');

  if (falhas.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use esta exposição como evidência');
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(executar());
