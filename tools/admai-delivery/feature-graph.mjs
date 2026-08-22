/**
 * AdmAi Delivery Harness — Feature Graph e READY_FRONTIER.  [Wave P0 → P1]
 *
 * A REGRA QUE MOLDA ESTE ARQUIVO
 *   O grafo é DERIVADO do estado real, não copiado da ordem das waves. Uma feature está READY
 *   quando suas dependências estão satisfeitas por algo OBSERVADO no repositório — modelo que
 *   existe no schema, rota que existe no código, gate que foi verificado. Copiar a numeração das
 *   waves produziria uma ordem plausível e falsa: P3 pode estar pronta enquanto P2 não está.
 *
 *   Por isso cada dependência é um PREDICADO sobre o estado observado, e não um rótulo.
 *
 * O QUE ISTO NÃO É
 *   Não é um plano. Não decide o que deve ser feito nem em que ordem de valor — decide o que PODE
 *   ser feito com segurança agora. Prioridade continua sendo decisão de produto.
 *
 * PROVENANCE
 *   `observado` vem do schema Prisma e do filesystem (OBSERVED). `estado` de cada feature é
 *   DERIVED. Nada aqui é INFERRED.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ, observarRepositorio } from './snapshot.mjs';
/* `tenant-coverage` só depende de `snapshot`, então não há ciclo. A cobertura entra aqui como
   FATO OBSERVADO por instrumento próprio — o grafo não recalcula cobertura, ele consulta. */
import { observarCobertura, derivarCobertura } from './tenant-coverage.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

/** Provas que uma conclusao pode declarar. Fora disso, nao ha estado forte concedivel. [H-01.4] */
export const PROVAS = Object.freeze(['PRESENCA', 'EXECUCAO']);

/**
 * Lista de NEGACAO, INCOMPLETA por construcao. Rede secundaria: reforca, nao garante.
 * Quem sustenta a checagem e `provaDe` — a derivacao positiva.
 */
export const AFIRMACOES_DE_EXECUCAO = Object.freeze([
  [/\bexit\s*(?:code\s*)?\d+/i, 'exit code'],
  [/\b\d+\s*\/\s*\d+\s*PASS/i, 'contagem N/N PASS'],
  [/\b\d+\s+PASS\b/i, 'contagem N PASS'],
  [/\b\d+\s*\/\s*\d+\b[^"]*\b(?:su[ií]tes?|testes?|integra)/i, 'razao sobre suites'],
  [/\btestes?\s+pass(ou|aram|ing)\b/i, 'afirmacao verbal de execucao'],
  [/\b(executad[oa]s?|rodou|rodaram)\b/i, 'afirmacao verbal de execucao']
]);

/**
 * Conclusoes que afirmam mais do que o grafo observou. PURA — as sabotagens atravessam aqui.  [H-01.4]
 *
 * O R28-07 mostrou o limite da versao anterior: quatro regexes olhando so `evidencia`. Uma conclusao
 * dizendo "testes passaram" passava, e o controle publicava `ok`. Lista de negacao e incompleta por
 * construcao — licao que ja estava escrita em `PADROES_DE_SEGREDO` deste mesmo harness, e que eu
 * repeti mesmo assim.
 *
 * A regra agora e POSITIVA: estado forte exige `provaDe`; `EXECUCAO` exige `execucaoRef` que resolva
 * para execucao real do Evidence Bundle. Sem bundle legivel, `EXECUCAO` nao e concedivel.
 */
/**
 * Execucoes que podem SUSTENTAR estado forte, extraidas do bundle.  [H01-DREV-01]
 *
 * Era um `filter` inline dentro de `executar()`. O controle de "referencia a execucao FAIL reprova"
 * passava um `Set` ja filtrado a mao para `inflacoesDe`, entao testava o CONSUMIDOR e nunca o
 * FILTRO: restaurar a versao antiga — que aceitava todo id do bundle — nao quebrava o controle. E o
 * bundle real so tem execucoes PASS, entao a execucao de verdade tambem nao diferenciava.
 *
 * Funcao pura, usada pelo caminho real E pelo controle: o que se sabota e o que se executa.
 */
export function execucoesQueSustentam(bundle) {
  return new Set(
    (bundle?.execucoes ?? [])
      .filter((e) => e.estado === 'PASS' && e.exitCode === 0)
      .map((e) => e.id)
  );
}

export function inflacoesDe(nos = [], execucoesReais = new Set()) {
  const fora = [];
  for (const n of nos) {
    const forte = n.estado === 'VERIFIED' || n.estado === 'IN_PROGRESS';
    if (forte && !PROVAS.includes(n.provaDe)) {
      fora.push(`${n.id}: estado ${n.estado} sem provaDe declarada (${PROVAS.join('/')})`);
    }
    if (n.provaDe === 'EXECUCAO') {
      if (!n.execucaoRef) fora.push(`${n.id}: provaDe EXECUCAO sem execucaoRef`);
      else if (!execucoesReais.has(n.execucaoRef)) {
        /* [H01-REV-07] `execucoesReais` recebia TODO id do bundle, inclusive de execucao FAIL ou
           NAO_EXECUTADA. Existencia de id nao e resultado: um VERIFIED podia apontar para uma suite
           que falhou. So execucao APROVADA sustenta estado forte. */
        fora.push(`${n.id}: execucaoRef "${n.execucaoRef}" nao e execucao APROVADA no Evidence Bundle`);
      }
    }
    /* Rede secundaria sobre o objeto INTEIRO. [H01-REV-07] A versao anterior listava tres campos a
       mao — `evidencia`, `restante`, `entrega` — entao um campo NOVO na conclusao ficava livre.
       Serializa-se o no inteiro, menos os campos estruturais que nao carregam afirmacao. */
    if (n.provaDe === 'PRESENCA') {
      const ESTRUTURAIS = ['id', 'wave', 'estado', 'provaDe', 'execucaoRef', 'faltando'];
      const texto = JSON.stringify(
        Object.fromEntries(Object.entries(n).filter(([k]) => !ESTRUTURAIS.includes(k)))
      );
      for (const [re, rotulo] of AFIRMACOES_DE_EXECUCAO) {
        if (re.test(texto)) fora.push(`${n.id}: ${rotulo} numa conclusao de PRESENCA`);
      }
    }
  }
  return fora;
}

/**
 * Capacidades observáveis: cada uma é uma pergunta que um script responde olhando o repositório.
 * Nada de "a equipe considera pronto".
 */
export function observarCapacidades(estadoRepo = observarRepositorio()) {
  const modelos = new Set(estadoRepo.prisma.modelos ?? []);
  const rotas = existsSync(`${RAIZ}chaveiro-bot/src/routes`)
    ? readdirSync(`${RAIZ}chaveiro-bot/src/routes`).filter((f) => f.endsWith('.js'))
    : [];
  const testesIntegracao = existsSync(`${RAIZ}chaveiro-bot/test/integration`)
    ? readdirSync(`${RAIZ}chaveiro-bot/test/integration`).filter((f) => f.endsWith('.test.js'))
    : [];

  const leRota = (arquivo) => {
    const p = `${RAIZ}chaveiro-bot/src/routes/${arquivo}`;
    return existsSync(p) ? readFileSync(p, 'utf8') : '';
  };

  return {
    modelo: (nome) => modelos.has(nome),
    rota: (arquivo) => rotas.includes(arquivo),
    teste: (arquivo) => testesIntegracao.includes(arquivo),
    rbacNoBackend: existsSync(`${RAIZ}chaveiro-bot/src/middlewares/auth.js`) &&
      /requirePermissao/.test(readFileSync(`${RAIZ}chaveiro-bot/src/middlewares/auth.js`, 'utf8')),
    isolamentoDeTenant: existsSync(`${RAIZ}chaveiro-bot/src/db/tenant.js`),
    harnessDeEntrega: ['snapshot.mjs', 'write-scope.mjs', 'test-orchestrator.mjs',
      'evidence-bundle.mjs', 'stale-check.mjs', 'gate.mjs']
      .every((m) => existsSync(`${RAIZ}tools/admai-delivery/${m}`)),
    gateP0Verificado: existsSync(`${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`),
    /* A autoridade migrou para dentro do produto: o Dockerfile copia só `chaveiro-bot/`, e código
       de runtime que importasse de `tools/` quebraria o build. O harness ficou só com a
       verificação, e este detector precisa olhar os DOIS lados — se ele olhasse apenas o harness,
       apagar o contrato do produto passaria despercebido. */
    metricFoundation:
      ['contrato.js', 'registro.js', 'calculo.js']
        .every((m) => existsSync(`${RAIZ}chaveiro-bot/src/services/metricas/${m}`)) &&
      ['availability.mjs', 'verify.mjs', 'calculate.mjs']
        .every((m) => existsSync(`${RAIZ}tools/admai-delivery/metric/${m}`)),
    metricExposicao: existsSync(`${RAIZ}chaveiro-bot/src/routes/metricas.js`),
    /* A vertical exige as DUAS pontas: a página que compõe e os primitivos que ela compõe.
       Olhar só a página deixaria passar um Hub sem os módulos. */
    /* Duas verticais: a segunda prova segurança por campo, que a primeira não exercitou. */
    metricHubVertical2:
      existsSync(`${RAIZ}chaveiro-painel/src/pages/MetricHubReceita.jsx`) &&
      existsSync(`${RAIZ}chaveiro-painel/src/hooks/useMetricHub.js`) &&
      existsSync(`${RAIZ}chaveiro-painel/src/pages/MetricHubShell.jsx`),
    metricHubVertical:
      existsSync(`${RAIZ}chaveiro-painel/src/pages/MetricHub.jsx`) &&
      existsSync(`${RAIZ}chaveiro-painel/src/components/metric/MetricPrimitives.jsx`) &&
      existsSync(`${RAIZ}chaveiro-painel/src/components/metric/MetricDrilldown.jsx`),
    /* Contado pelo próprio instrumento de cobertura, não redigido. Se ele não puder observar,
       o valor é `null` e a conclusão não é derivada — indisponível nunca vira zero. */
    /* Conta LACUNA MATERIAL, não rota descoberta. `descobertas.length` incluía as auto-escopadas
       por token e as que não tocam dado de tenant — que estão declaradamente fora do vetor
       cross-tenant e exigem outro instrumento. Contá-las aqui contradizia o veredito do próprio
       `tenant-coverage.mjs` e o alvo declarado, que é 100% dos vetores MATERIAIS e não 100% das
       rotas. A divergência ficou escondida enquanto ainda havia lacuna material. */
    lacunasDeTenant: (() => {
      try {
        const c = derivarCobertura(observarCobertura());
        if (c.veredito === 'UNKNOWN') return null;
        /* UNKNOWN entra na conta: não classificável nunca é "sem risco". */
        return c.lacunasComVetor.length + c.lacunasNaoClassificadas.length;
      } catch { return null; }
    })(),
    conteudoDeRota: leRota,
    _modelos: modelos,
    _rotas: rotas
  };
}

/**
 * As features, com dependências como PREDICADOS.
 *
 * `depende` recebe as capacidades observadas e devolve a lista do que falta. Lista vazia = pronta
 * para começar. A ordem do array não significa nada: quem ordena é o grafo.
 */
export const FEATURES = Object.freeze([
  {
    id: 'DELIVERY_HARNESS',
    wave: 'P0',
    titulo: 'Harness de entrega verificável',
    depende: (c) => c.harnessDeEntrega ? [] : ['os seis módulos de tools/admai-delivery/'],
    entrega: 'snapshot · write-scope · test-orchestrator · evidence-bundle · stale-check · gate',
    conclusao: (c) => c.gateP0Verificado && c.harnessDeEntrega
      ? { estado: 'VERIFIED', provaDe: 'PRESENCA', evidencia: 'os seis modulos do harness presentes e EVIDENCE_BUNDLE.json existe; o resultado das execucoes esta NO bundle, nao aqui' }
      : { estado: null }
  },
  {
    id: 'BILLING_ACCESS_AUDIT',
    wave: 'P1',
    titulo: 'Provar se existe gate comercial bloqueando o produto',
    depende: (c) => c.modelo('Assinatura') ? [] : ['modelo Assinatura'],
    entrega: 'veredito BILLING_GATE_PRESENT / ABSENT_WITH_TESTED_SCOPE / PARTIAL / UNKNOWN',
    bloqueiaSe: 'o teste dirigido não executar — escrito não é executado',
    conclusao: (c) => c.teste('billing_access_audit.test.js')
      ? { estado: 'VERIFIED', provaDe: 'PRESENCA', evidencia: 'billing_access_audit.test.js presente; o veredito BILLING_GATE depende da execucao registrada no bundle' }
      : { estado: null }
  },
  {
    id: 'PRODUCT_INTEGRITY',
    wave: 'P1',
    titulo: 'Integridade: RBAC e isolamento multi-tenant com negativos obrigatórios',
    depende: (c) => [
      ...(c.rbacNoBackend ? [] : ['requirePermissao no backend']),
      ...(c.isolamentoDeTenant ? [] : ['client Prisma com escopo de tenant'])
    ],
    entrega: 'negativos cross-tenant e de escalação de privilégio como gate permanente',
    /* IN_PROGRESS de propósito: as 6 rotas de escrita de maior consequência estão provadas, e
       `tenant-coverage.mjs` ainda mede lacunas. Chamar de VERIFIED aqui seria promover cobertura
       parcial a completa — o erro que o próprio instrumento existe para tornar visível. */
    conclusao: (c) => {
      if (!c.teste('idor_escrita_cross_tenant.test.js')) return { estado: null };
      const lacunas = c.lacunasDeTenant;
      return lacunas === 0
        ? { estado: 'VERIFIED', provaDe: 'PRESENCA',
            evidencia: 'as 4 suites dirigidas existem — IDOR leitura, IDOR escrita, vazamento de colecao e billing; nenhum vetor material ou nao classificado ficou sem suite que o nomeie. Os resultados sao do Evidence Bundle',
            /* Calibração: o que está provado é ausência de LACUNA MATERIAL no escopo medido, não
               isolamento de toda rota. As 15 auto-escopadas por token seguem descobertas e pedem
               instrumento de autenticação/sessão; `POST /materiais/upload` tem risco de storage,
               não de query cross-tenant. Ambos declarados, nenhum resolvido aqui. */
            restante: '15 rotas auto-escopadas por token e 1 sem acesso a dado de tenant seguem fora deste instrumento, por declaração' }
        : { estado: 'IN_PROGRESS', provaDe: 'PRESENCA', evidencia: 'idor_escrita_cross_tenant.test.js presente, cobrindo as 6 rotas de escrita',
            restante: `${lacunas} rotas ainda sem negativo cross-tenant que as nomeie` };
    }
  },
  {
    id: 'CATEGORIAS_SERVICO',
    wave: 'P2',
    titulo: 'Categorias de serviço',
    depende: (c) => c.modelo('CategoriaServico') ? [] : ['modelo CategoriaServico (greenfield)'],
    entrega: 'taxonomia de serviços — pré-requisito de precificação e de métricas por categoria'
  },
  {
    id: 'CLIENTES',
    wave: 'P2',
    titulo: 'Cliente como entidade de primeira classe',
    /* Hoje `Servico` guarda clienteNome/clienteTelefone/local/endereco como TEXTO SOLTO. Todo
       serviço histórico existe sem Cliente — daí a regra de não inventar Cliente fake. */
    depende: (c) => c.modelo('Cliente') ? [] : ['modelo Cliente (greenfield; Servico usa texto solto hoje)'],
    entrega: 'identidade de cliente, base de CRM e de métricas de recorrência'
  },
  {
    id: 'ENDERECOS',
    wave: 'P2',
    titulo: 'Endereços normalizados',
    depende: (c) => [
      ...(c.modelo('Endereco') ? [] : ['modelo Endereco (greenfield)']),
      ...(c.modelo('Cliente') ? [] : ['CLIENTES — endereço pertence a alguém'])
    ],
    entrega: 'endereço estruturado, base de roteirização e de métricas geográficas'
  },
  {
    id: 'AGENDAMENTO',
    wave: 'P3',
    titulo: 'Agendamento',
    depende: (c) => [
      ...(c.modelo('Agendamento') ? [] : ['modelo Agendamento (greenfield)']),
      ...(c.modelo('Cliente') ? [] : ['CLIENTES']),
      ...(c.modelo('Endereco') ? [] : ['ENDERECOS'])
    ],
    entrega: 'compromisso datado, base de ocupação e de pontualidade'
  },
  {
    id: 'ORCAMENTO',
    wave: 'P3',
    titulo: 'Orçamento e aprovação',
    depende: (c) => [
      ...(c.modelo('Orcamento') ? [] : ['modelo Orcamento (greenfield)']),
      ...(c.modelo('Cliente') ? [] : ['CLIENTES']),
      ...(c.modelo('CategoriaServico') ? [] : ['CATEGORIAS_SERVICO — orçar exige o que se orça'])
    ],
    entrega: 'proposta, aprovação e taxa de conversão'
  },
  {
    id: 'METRIC_FOUNDATION',
    wave: 'P9',
    titulo: 'Metric Intelligence — registry, grafo e camada de métrica',
    /* Vem ANTES do CRM por decisão registrada: é preciso saber quais estados e eventos preservar
       para medir conversão, drop-off e ciclo de vida — instrumentar depois é adivinhação. */
    depende: (c) => [
      ...(c.modelo('Servico') ? [] : ['modelo Servico']),
      ...(c.rbacNoBackend ? [] : ['PRODUCT_INTEGRITY — drilldown não pode ampliar acesso'])
    ],
    entrega: 'registry de métricas, linhagem e confiança do dado',
    /* Contrato + cálculo + exposição, com a autoridade única dentro do produto e o harness só
       verificando. O que ainda não existe é o Hub — e Hub é P10, feature própria, não pendência
       desta. */
    conclusao: (c) => {
      if (!c.metricFoundation) return { estado: null };
      if (!c.metricExposicao) {
        return { estado: 'IN_PROGRESS', provaDe: 'PRESENCA',
          evidencia: 'contrato + registro (12 metricas) + availability + calculate presentes, com 8 calculadoras declaradas',
          restante: 'camada de exposição: nenhuma rota serve estes números ainda' };
      }
      return { estado: 'VERIFIED', provaDe: 'PRESENCA',
        evidencia: 'contrato + registro + calculo + exposicao + suites de integracao presentes; as propriedades cobertas sao autorizacao por pode() com override, allowlist que rejeita, INSUFFICIENT que nao vira zero e consistencia agregado <-> registros',
        /* Calibração: o que está provado é a FUNDAÇÃO — número correto, autorizado e explicável.
           A experiência analítica rica é o Metric Hub, e prometê-la aqui seria sobreafirmar. */
        restante: 'drilldown implementado em 1 das 8 (contrato declarado para todas); Hubs visuais são P10' };
    }
  },
  {
    id: 'METRIC_HUBS',
    wave: 'P10',
    titulo: 'Hubs de métrica',
    depende: (c) => (c.estadoDe('METRIC_FOUNDATION') === 'VERIFIED'
      ? [] : ['METRIC_FOUNDATION verificada']),
    entrega: 'hub por métrica: hero, pulse, timeline, decomposição, drivers, anomalias',
    /* IN_PROGRESS de propósito: UMA vertical provada não são oito Hubs. Chamar de VERIFIED aqui
       promoveria a prova do framework à entrega da feature — o mesmo erro que o contrato virando
       implementação, agora uma camada acima. `hub-readiness.mjs` classifica o que falta em cada
       uma das sete restantes. */
    conclusao: (c) => (c.metricHubVertical
      ? {
        estado: 'IN_PROGRESS', provaDe: 'PRESENCA',
        evidencia: c.metricHubVertical2
          ? 'DUAS verticais: `servicos-concluidos` (contagem + drilldown) e `faturamento-liquido` (seguranca por CAMPO), com suites de exposicao, field-level security, UI e a11y presentes; framework compartilhado extraido DEPOIS da repeticao (useMetricHub + MetricHubShell + primitivos)'
          : 'vertical `servicos-concluidos` completa',
        restante: c.metricHubVertical2
          ? '5 métricas aguardam drilldown, 1 exige módulo de ranking (valor agrupado), 4 aguardam modelo — ver hub-readiness.mjs'
          : '7 métricas restantes'
      }
      : { estado: null })
  },
  {
    id: 'CRM',
    wave: 'P11',
    titulo: 'CRM — lead, oportunidade, funil',
    depende: (c) => [
      ...(c.modelo('Lead') ? [] : ['modelo Lead (greenfield)']),
      ...(c.modelo('Oportunidade') ? [] : ['modelo Oportunidade (greenfield)']),
      ...(c.modelo('Cliente') ? [] : ['CLIENTES']),
      /* Dependência de ORDEM, e não de código: instrumentar o funil depois de construí-lo perde o
         histórico de transição, que não se recupera. Agora ela resolve de verdade. */
      ...(c.estadoDe('METRIC_FOUNDATION') === 'VERIFIED'
        ? [] : ['METRIC_FOUNDATION verificada (dependência de ordem)'])
    ],
    entrega: 'pipeline comercial instrumentado desde o primeiro dia'
  },
  {
    id: 'GARANTIA_RETRABALHO',
    wave: 'P6',
    titulo: 'Garantia e retrabalho',
    depende: (c) => [
      ...(c.modelo('Garantia') ? [] : ['modelo Garantia (greenfield)']),
      ...(c.modelo('Servico') ? [] : ['modelo Servico'])
    ],
    entrega: 'vínculo entre serviço original e retorno — base de qualidade'
  },
  {
    id: 'STAGING',
    wave: 'P14',
    titulo: 'Ambiente de staging na cadeia de promoção',
    depende: () => ['decisão do usuário sobre backup/RPO (Q-010) antes de promover dado novo'],
    entrega: 'cadeia local → staging → produção'
  }
]);

/**
 * Deriva o estado de cada feature e a fronteira executável. PURA nos argumentos.
 *
 * QUATRO ESTADOS, NÃO DOIS  [corrigido por higiene de fronteira]
 *   A versão anterior só perguntava "as dependências estão satisfeitas?", e com isso uma feature
 *   já entregue continuava aparecendo como READY para sempre. Uma fronteira que lista trabalho
 *   concluído não é fronteira — é catálogo, e faz a próxima retomada refazer o que já existe.
 *
 *     VERIFIED     entregue e com gate fechado
 *     IN_PROGRESS  começou, tem evidência no repositório, e ainda falta escopo declarado
 *     READY        dependências satisfeitas e nada começado
 *     BLOCKED      falta dependência
 *
 *   `readyFrontier` passa a conter só READY e IN_PROGRESS — o que ainda tem trabalho a fazer.
 *   A conclusão é DERIVADA de evidência observável no repositório, nunca declarada à mão: um
 *   booleano escrito por quem implementou se auto-confirma e volta a mentir no primeiro engano.
 */
export function derivarGrafo({ features, capacidades }) {
  /* [Metric Exposure] Dependência ENTRE features não tinha como ser derivada: `depende` só recebia
     as capacidades, então `METRIC_HUBS` declarava `'METRIC_FOUNDATION verificada'` como literal
     constante — uma dependência que nunca resolve. A fundação ficou VERIFIED e o Hub continuou
     BLOCKED por ela, com a fronteira vazia por um motivo falso.

     Duas passagens: a primeira calcula as conclusões, que dependem só de capacidades e nunca de
     outra feature — por isso não há ciclo. A segunda resolve as dependências com `estadoDe` em mão. */
  const conclusoes = new Map(features.map((f) =>
    [f.id, f.conclusao ? f.conclusao(capacidades) : { estado: null, evidencia: null }]));
  const estadoDe = (id) => conclusoes.get(id)?.estado ?? null;
  const contexto = { ...capacidades, estadoDe };

  const nos = features.map((f) => {
    const faltando = f.depende(contexto);
    const conclusao = conclusoes.get(f.id);

    let estado;
    if (faltando.length > 0) estado = 'BLOCKED';
    else if (conclusao.estado === 'VERIFIED') estado = 'VERIFIED';
    else if (conclusao.estado === 'IN_PROGRESS') estado = 'IN_PROGRESS';
    else estado = 'READY';

    return {
      id: f.id, wave: f.wave, titulo: f.titulo, entrega: f.entrega,
      estado, faltando, evidencia: conclusao.evidencia ?? null,
      /* [H-01.4/10] A conclusao declara em QUE tipo de observacao ela se apoia. Sem isto, o grafo
         dizia "6/6 PASS" a partir da existencia de um arquivo, e a unica defesa era uma lista de
         frases proibidas — incompleta por construcao. */
      provaDe: conclusao.provaDe ?? null,
      execucaoRef: conclusao.execucaoRef ?? null,
      restante: conclusao.restante ?? null
    };
  });

  const porEstado = (e) => nos.filter((n) => n.estado === e).map((n) => n.id);

  return {
    nos,
    verificadas: porEstado('VERIFIED'),
    emAndamento: porEstado('IN_PROGRESS'),
    prontas: porEstado('READY'),
    bloqueados: porEstado('BLOCKED'),
    /* A fronteira EXECUTÁVEL: o que ainda tem trabalho. Concluída não entra. */
    readyFrontier: [...porEstado('IN_PROGRESS'), ...porEstado('READY')]
  };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

/**
 * Flags reconhecidas.  [R27-05]
 *
 * Irmao confirmado da classe "parametro aceito e nao aplicado": flag desconhecida saia com exit 0 e
 * a mesma saida do modo padrao, entao o chamador acreditava ter pedido outro modo. Corrigi essa
 * classe no `evidence-bundle`, depois no `write-set-gate` — e aqui ela seguia de pe.
 */
/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Nao escreve: deriva o grafo do estado observado. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte: allowlist literal ja removeu uma capacidade real. */
export const FLAGS = flagsDoModulo(import.meta.url);

export function executar() {
  const estadoRepo = observarRepositorio();
  const capacidades = observarCapacidades(estadoRepo);
  const grafo = derivarGrafo({ features: FEATURES, capacidades });

  /* Controles negativos: o grafo precisa ser capaz de mudar de veredito quando o estado muda.
     Um grafo que devolve a mesma fronteira para qualquer estado não está derivando nada. */
  const capFalsas = { ...capacidades, modelo: () => true, rbacNoBackend: true, isolamentoDeTenant: true, harnessDeEntrega: true };
  const comTudo = derivarGrafo({ features: FEATURES, capacidades: capFalsas });

  /* [Metric Exposure] A sabotagem era PARCIAL: zerava quatro capacidades e deixava as demais como
     o estado real. Quando `METRIC_FOUNDATION` passou a VERIFIED, as duas fronteiras ficaram vazias
     pelo mesmo motivo e o controle acusou — corretamente, porque uma sabotagem que não muda o
     estado não sabota nada. Zerar TODO booleano mantém o controle capaz de falhar. */
  const zerarBooleanos = (c) => Object.fromEntries(
    Object.entries(c).map(([k, v]) => [k, typeof v === 'boolean' ? false : v]));
  const capVazias = { ...zerarBooleanos(capacidades), modelo: () => false, lacunasDeTenant: null };
  const comNada = derivarGrafo({ features: FEATURES, capacidades: capVazias });

  /* Feature de teste com conclusão controlada — atravessa o mesmo `derivarGrafo`. */
  const fx = (conclusao) => [{ id: 'FX', wave: 'PX', titulo: 't', entrega: 'e', depende: () => [], conclusao }];
  const est = (conclusao) => derivarGrafo({ features: fx(conclusao), capacidades }).nos[0].estado;

  const sabotagens = [
    /* Compara o VETOR DE ESTADOS, não o tamanho da fronteira. O tamanho é proxy e empata por
       coincidência: com tudo verificado de um lado e tudo bloqueado do outro, as duas fronteiras
       ficam vazias e um grafo que ignorasse as capacidades passaria. O que precisa reagir é a
       derivação inteira. */
    ['a derivação reage a estado vazio',
      JSON.stringify(comNada.nos.map((n) => n.estado)) !== JSON.stringify(grafo.nos.map((n) => n.estado))],
    ['CLIENTES bloqueado sem o modelo', comNada.nos.find((n) => n.id === 'CLIENTES').estado === 'BLOCKED'],
    /* Dependência ENTRE features precisa RESOLVER. Antes era literal constante: `METRIC_HUBS`
       ficava BLOCKED mesmo com a fundação VERIFIED, e a fronteira mentia por um motivo falso. Os
       dois sentidos importam — resolver quando satisfeita, e bloquear quando não. */
    ['dependência entre features resolve quando satisfeita', (() => {
      const g = derivarGrafo({
        features: [{ id: 'A', wave: 'P', titulo: 't', entrega: 'e', depende: () => [], conclusao: () => ({ estado: 'VERIFIED', provaDe: 'PRESENCA' }) },
          { id: 'B', wave: 'P', titulo: 't', entrega: 'e', depende: (c) => (c.estadoDe('A') === 'VERIFIED' ? [] : ['A']) }],
        capacidades
      });
      return g.nos.find((n) => n.id === 'B').estado === 'READY';
    })()],
    ['dependência entre features bloqueia quando NÃO satisfeita', (() => {
      const g = derivarGrafo({
        features: [{ id: 'A', wave: 'P', titulo: 't', entrega: 'e', depende: () => [], conclusao: () => ({ estado: 'IN_PROGRESS', provaDe: 'PRESENCA' }) },
          { id: 'B', wave: 'P', titulo: 't', entrega: 'e', depende: (c) => (c.estadoDe('A') === 'VERIFIED' ? [] : ['A']) }],
        capacidades
      });
      return g.nos.find((n) => n.id === 'B').estado === 'BLOCKED';
    })()],
    ['CLIENTES sai de BLOCKED com o modelo', comTudo.nos.find((n) => n.id === 'CLIENTES').estado !== 'BLOCKED'],
    /* Os quatro estados precisam ser alcançáveis, e nenhum pode ser o padrão. Sem isto, um grafo
       que devolvesse sempre READY teria as sabotagens acima verdes. */
    ['VERIFIED alcançável', est(() => ({ estado: 'VERIFIED', provaDe: 'PRESENCA' })) === 'VERIFIED'],
    ['IN_PROGRESS alcançável', est(() => ({ estado: 'IN_PROGRESS', provaDe: 'PRESENCA' })) === 'IN_PROGRESS'],
    ['READY é o caso sem conclusão', est(() => ({ estado: null })) === 'READY'],
    ['BLOCKED vence conclusão', derivarGrafo({
      features: [{ id: 'FX', wave: 'PX', titulo: 't', entrega: 'e', depende: () => ['falta'], conclusao: () => ({ estado: 'VERIFIED', provaDe: 'PRESENCA' }) }],
      capacidades
    }).nos[0].estado === 'BLOCKED'],
    /* O ponto da correção: concluída NÃO aparece na fronteira executável. */
    ['VERIFIED fora da fronteira', !derivarGrafo({ features: fx(() => ({ estado: 'VERIFIED', provaDe: 'PRESENCA' })), capacidades }).readyFrontier.includes('FX')],
    ['IN_PROGRESS dentro da fronteira', derivarGrafo({ features: fx(() => ({ estado: 'IN_PROGRESS', provaDe: 'PRESENCA' })), capacidades }).readyFrontier.includes('FX')]
  ];
  /* ---- [H-01.4 / R28-07] `INFLACAO-01` precisa MORDER ----
   *
   * A versão anterior não mordia: o probe do revisor trocou uma conclusão por "testes passaram" e o
   * instrumento publicou `ok`. Controle que só passa porque o caso não ocorre não distingue
   * corrigido de não corrigido. Cada caso abaixo é uma conclusão que DEVE derrubar o grafo. */
  const no = (extra) => ({ id: 'N', estado: 'VERIFIED', evidencia: 'x', ...extra });
  const reais = new Set(['bot:unit']);
  const infla = (n, e = reais) => inflacoesDe([n], e);

  /* As assercoes de reprova sao `> 0`, nao `=== 1`: "6/6 PASS" casa com dois padroes da rede
     secundaria, e exigir contagem exata testaria o FORMATO da lista em vez da propriedade. As
     contraprovas continuam `=== 0`, onde a contagem exata E a propriedade. */
  const casosInflacao = [
    ['estado forte SEM provaDe reprova', infla(no({})).length > 0],
    ['provaDe fora da taxonomia reprova', infla(no({ provaDe: 'ACHO_QUE_SIM' })).length > 0],
    ['EXECUCAO sem execucaoRef reprova', infla(no({ provaDe: 'EXECUCAO' })).length > 0],
    ['EXECUCAO com ref inexistente reprova',
      infla(no({ provaDe: 'EXECUCAO', execucaoRef: 'nao:existe' })).length > 0],
    ['EXECUCAO com bundre ilegivel (conjunto vazio) reprova',
      infla(no({ provaDe: 'EXECUCAO', execucaoRef: 'bot:unit' }), new Set()).length > 0],
    /* CONTRAPROVA: sem ela, "reprovar tudo" passaria como rigor. */
    ['CONTRAPROVA: EXECUCAO com ref REAL e aceita',
      infla(no({ provaDe: 'EXECUCAO', execucaoRef: 'bot:unit' })).length === 0],
    ['CONTRAPROVA: PRESENCA honesta e aceita',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'os modulos existem' })).length === 0],
    /* O caso EXATO do R28-07: frase de execucao sem numero nenhum. */
    ['PRESENCA dizendo "testes passaram" reprova',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'os testes passaram' })).length > 0],
    ['PRESENCA dizendo "executado" reprova',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'suite executada com sucesso' })).length > 0],
    ['PRESENCA com "6/6 PASS" reprova',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'billing 6/6 PASS' })).length > 0],
    ['PRESENCA com "exit 0" reprova',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'gate.mjs exit 0' })).length > 0],
    /* R28-07: olhar so `evidencia` deixava o resto do objeto livre. */
    ['inflacao em `restante` tambem e pega, nao so em `evidencia`',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'ok', restante: 'faltam 3/8 suites' })).length > 0],
    /* [H01-REV-07 / H01-DREV-01] O conjunto vem do FILTRO real, nao de um Set montado a mao. Com
       `Set` pre-filtrado, a versao antiga do filtro — que aceitava todo id — passaria neste
       controle. Bundle sintetico com os tres estados que importam. */
    ...(() => {
      const bundleMisto = { execucoes: [
        { id: 'bot:unit', estado: 'PASS', exitCode: 0 },
        { id: 'bot:falhou', estado: 'FAIL', exitCode: 1 },
        { id: 'bot:pulado', estado: 'NAO_EXECUTADA', exitCode: 0 }
      ] };
      const sustentam = execucoesQueSustentam(bundleMisto);
      const ref = (id) => infla(no({ provaDe: 'EXECUCAO', execucaoRef: id }), sustentam);
      return [
        ['o filtro exclui execucao FAIL do conjunto que sustenta',
          !sustentam.has('bot:falhou') && ref('bot:falhou').length > 0],
        ['o filtro exclui NAO_EXECUTADA com exitCode 0',
          !sustentam.has('bot:pulado') && ref('bot:pulado').length > 0],
        ['CONTRAPROVA: execucao APROVADA sustenta',
          sustentam.has('bot:unit') && ref('bot:unit').length === 0],
        ['bundle ausente nao sustenta nada', execucoesQueSustentam(null).size === 0]
      ];
    })(),
    /* [H01-REV-07] A rede secundaria listava tres campos a mao; campo novo ficava livre. */
    ['inflacao em campo NOVO da conclusao tambem e pega',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'ok', detalhe: 'os testes passaram' })).length > 0],
    ['inflacao em campo aninhado tambem e pega',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'ok', extra: { nota: 'suite executada' } })).length > 0],
    ['CONTRAPROVA: campo novo sem afirmacao de execucao nao reprova',
      infla(no({ provaDe: 'PRESENCA', evidencia: 'ok', detalhe: 'modulos presentes' })).length === 0],
    ['estado fraco sem provaDe NAO reprova — so estado forte exige',
      infla({ id: 'N', estado: 'READY' }).length === 0]
  ];
  const inflaFalhos = casosInflacao.filter(([, ok]) => !ok).map(([r]) => r);

  const negFalhos = sabotagens.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('AdmAi Delivery — Feature Graph derivado do estado REAL  [P0 → P1]');
  console.log(`  modelos Prisma observados : ${estadoRepo.prisma.modelos?.length ?? 'UNAVAILABLE'}`);
  console.log(`  RBAC no backend : ${capacidades.rbacNoBackend}   isolamento de tenant : ${capacidades.isolamentoDeTenant}`);
  console.log(`  harness de entrega : ${capacidades.harnessDeEntrega}`);
  console.log('');
  console.log('  VERIFIED — concluída, fora da fronteira executável:');
  for (const n of grafo.nos.filter((x) => x.estado === 'VERIFIED')) {
    console.log(`    ${n.id.padEnd(24)} [${n.wave}]  ${n.evidencia}`);
  }
  console.log('');
  console.log('  IN_PROGRESS — começou e ainda falta escopo:');
  for (const n of grafo.nos.filter((x) => x.estado === 'IN_PROGRESS')) {
    console.log(`    ${n.id.padEnd(24)} [${n.wave}]  ${n.evidencia}`);
    if (n.restante) console.log(`      falta: ${n.restante}`);
  }
  console.log('');
  console.log('  READY — dependências satisfeitas, nada começado:');
  for (const n of grafo.nos.filter((x) => x.estado === 'READY')) {
    console.log(`    ${n.id.padEnd(24)} [${n.wave}]  ${n.titulo}`);
  }
  console.log('');
  console.log('  BLOCKED — com o que falta, item a item:');
  for (const n of grafo.nos.filter((x) => x.estado === 'BLOCKED')) {
    console.log(`    ${n.id.padEnd(24)} [${n.wave}]  ${n.titulo}`);
    for (const f of n.faltando) console.log(`      falta: ${f}`);
  }
  console.log('');
  /* [R27-06] INFLAÇÃO DE EVIDÊNCIA, tratada como CLASSE e não instância a instância.
   *
   * Este grafo observa PRESENÇA: arquivo existe, modelo existe, rota existe. Só que as conclusões
   * afirmavam EXECUÇÃO — `gate.mjs exit 0` porque `EVIDENCE_BUNDLE.json` existe, `6/6 PASS` porque
   * um arquivo de teste está no diretório. O nó do `BILLING_ACCESS_AUDIT` chega a declarar
   * `bloqueiaSe: 'o teste dirigido não executar — escrito não é executado'` e promove a VERIFIED
   * pela existência do arquivo, na linha seguinte. A regra estava escrita ao lado do código que a
   * violava.
   *
   * Corrigir as frases uma a uma repetiria o padrão que seis rodadas apontaram: tratar a instância
   * e deixar o irmão. Isto REPROVA a forma — qualquer conclusão deste grafo que contenha afirmação
   * de execução, hoje ou numa entrada futura, derruba o instrumento. */
  const bundle = (() => {
    const p = `${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`;
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  })();
  const execucoesReais = execucoesQueSustentam(bundle);
  const inflacoes = inflacoesDe(grafo.nos, execucoesReais);

  console.log(`  controles do grafo : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — falhou: ${negFalhos.join('; ')}` : ''));
  console.log(`  INFLACAO-01 (toda conclusão declara a força da observação): ${inflacoes.length ? `${inflacoes.length} violações` : 'ok'}`);
  for (const i of inflacoes) console.log(`    infla: ${i}`);
  console.log('    Regra POSITIVA: estado forte exige provaDe; EXECUCAO exige execucaoRef que exista');
  console.log('    no Evidence Bundle. Este grafo observa PRESENCA — "arquivo existe" nunca e');
  console.log('    "teste passou".');
  console.log(`    A rede secundaria e uma lista de NEGACAO de ${AFIRMACOES_DE_EXECUCAO.length} padroes, INCOMPLETA por`);
  console.log('    construcao: ela reforca, nao garante. Quem sustenta a checagem e o provaDe.');
  console.log(`  INFLACAO-02 (a regra de inflacao MORDE): ${casosInflacao.length - inflaFalhos.length}/${casosInflacao.length}` +
    (inflaFalhos.length ? ` — falhou: ${inflaFalhos.join('; ')}` : ''));

  if (negFalhos.length || inflacoes.length || inflaFalhos.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — grafo não reage ao estado, ou afirma execução não observada');
    return 2;
  }

  console.log(`  READY_FRONTIER (${grafo.readyFrontier.length}) : ${grafo.readyFrontier.join(', ')}`);
  console.log('    derivado: cada dependência é um predicado sobre o schema e o filesystem, não a');
  console.log('      ordem das waves. Por isso P9 pode aparecer READY antes de P2 — e aparece.');
  console.log('    NÃO derivado: prioridade. O grafo diz o que PODE ser feito com segurança agora;');
  console.log('      o que DEVE ser feito primeiro continua sendo decisão de produto.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(recusarDesconhecida(process.argv.slice(2), FLAGS) ?? executar());
}
