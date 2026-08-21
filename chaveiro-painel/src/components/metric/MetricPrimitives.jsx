/**
 * Primitivos analíticos compartilhados dos Metric Hubs.
 *
 * O QUE ESTES COMPONENTES NÃO FAZEM
 *   Não calculam. Não contam, não comparam, não decidem confiança, não filtram e não decidem
 *   permissão. Tudo isso pertence à Metric Foundation e chega pronto no contrato da resposta.
 *   Se a aritmética aparecesse aqui, existiriam duas definições da métrica — e a que o usuário vê
 *   seria a não verificada.
 *
 * POR QUE PRIMITIVOS E NÃO UM COMPONENTE UNIVERSAL
 *   `<UniversalMetricComponent config={300Campos} />` deixa todo Hub idêntico e ilegível. O que se
 *   compartilha é o VOCABULÁRIO analítico — herói, pulso, linha do tempo, recorte, confiança,
 *   procedência. A composição é de cada métrica, porque cada pergunta de negócio é diferente.
 *
 * ACESSIBILIDADE — a regra O-11 já praticada no repositório
 *   Gráfico recebe `aria-hidden` e vem acompanhado de ALTERNATIVA TEXTUAL. O gráfico é a leitura
 *   rápida; a tabela é o dado. Quem usa leitor de tela não recebe menos informação, recebe a mesma
 *   por outro caminho.
 */

import { useId } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { ArrowDown, ArrowRight, ArrowUp, Info, Minus } from 'lucide-react';
import FeedbackState from '../ui/FeedbackState.jsx';

/** Paleta Aurora, a mesma de `DashboardWidgets.jsx` — uma linguagem visual, não duas. */
export const CORES_METRICA = ['#a78bfa', '#38bdf8', '#2dd4bf', '#6ee7b7', '#fcd34d', '#f472b6'];

/* ------------------------------------------------------------------ *
 * Fronteira de estado
 * ------------------------------------------------------------------ */

/**
 * Traduz os estados do contrato em superfície visível — cada um com saída determinística e
 * nenhum skeleton eterno.
 *
 * `INSUFFICIENT_DATA` **não** é erro e **não** é zero: é uma resposta legítima que carrega o
 * motivo. Mostrar `0` ali seria a interface afirmando uma medida que a Foundation recusou fazer,
 * e é justamente contra isso que a regra existe desde a camada de cálculo.
 */
export function MetricStateBoundary({ estado, motivo, onTentarNovamente, children }) {
  if (estado === 'VALUE') return children;

  const comum = { announce: true, compact: true };
  if (estado === 'LOADING') {
    return <FeedbackState {...comum} state="loading" title="Calculando" description="Buscando os dados do período." />;
  }
  if (estado === 'FORBIDDEN') {
    return (
      <FeedbackState
        {...comum}
        state="permission-denied"
        title="Sem acesso a esta métrica"
        description="Seu perfil não tem permissão para ver este indicador. Fale com o responsável pela conta."
      />
    );
  }
  if (estado === 'INSUFFICIENT_DATA') {
    return (
      <FeedbackState
        {...comum}
        state="empty"
        icon={<Info size={26} />}
        title="Dados insuficientes para medir"
        description={motivo || 'Não há dados suficientes no período para calcular este indicador com segurança.'}
      />
    );
  }
  if (estado === 'NOT_APPLICABLE') {
    return (
      <FeedbackState
        {...comum}
        state="empty"
        title="Indicador ainda não disponível"
        description="Este indicador depende de dados que o sistema ainda não registra."
      />
    );
  }
  if (estado === 'EMPTY') {
    return <FeedbackState {...comum} state="empty" title="Nenhum serviço no período" description="Ajuste o período para ver outros resultados." />;
  }
  /* UNAVAILABLE e ERROR são falha de medição — e não podem se disfarçar de "não há dados". */
  return (
    <FeedbackState
      {...comum}
      state="error"
      title="Não foi possível calcular agora"
      description="Isto é uma falha ao buscar o dado, não ausência de dado."
      action={
        onTentarNovamente ? (
          <button type="button" className="panel-button panel-button--primary" onClick={onTentarNovamente}>
            Tentar novamente
          </button>
        ) : null
      }
    />
  );
}

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */

const DIRECAO = {
  SUBIU: { Icone: ArrowUp, classe: 'text-emerald-400', texto: 'aumento' },
  CAIU: { Icone: ArrowDown, classe: 'text-rose-400', texto: 'queda' },
  ESTAVEL: { Icone: Minus, classe: 'text-muted', texto: 'estável' },
  SEM_BASE: { Icone: ArrowRight, classe: 'text-muted', texto: 'sem base de comparação' }
};

/**
 * O número que responde a pergunta principal, com o contexto que o torna interpretável.
 *
 * A direção é comunicada por ÍCONE + PALAVRA além da cor — `aumento`/`queda` aparecem no texto
 * acessível. Cor sozinha não comunica estado para quem não a distingue.
 */
export function MetricHero({ nome, valor, unidade = '', comparacao, confianca, janela }) {
  const d = DIRECAO[comparacao?.direcao] ?? DIRECAO.SEM_BASE;
  const { Icone } = d;
  const pct = comparacao?.variacaoPercentual;

  return (
    <section className="card-accent p-5" aria-labelledby="metric-hero-titulo">
      <h2 id="metric-hero-titulo" className="kpi-label">{nome}</h2>
      <p className="kpi-value mt-2">
        {valor}
        {unidade && <span className="text-lg text-muted ml-1">{unidade}</span>}
      </p>

      {comparacao && (
        <p className={`mt-2 flex items-center gap-1.5 text-sm ${d.classe}`}>
          <Icone size={16} aria-hidden="true" />
          <span>
            {pct === null || pct === undefined
              ? 'Sem base de comparação no período anterior'
              : `${pct > 0 ? '+' : ''}${pct}% de ${d.texto} vs. período anterior`}
          </span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {janela && <span>{janela}</span>}
        {confianca && <MetricConfidence estado={confianca.state} registros={confianca.recordCount} compacto />}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Pulse
 * ------------------------------------------------------------------ */

/** Os quatro números da comparação, lado a lado. Sem base, diz isso — não inventa percentual. */
export function MetricPulse({ atual, comparacao, formatarValor = (v) => v }) {
  const sinal = comparacao && comparacao.variacaoAbsoluta > 0 ? '+' : '';
  const itens = [
    ['Período atual', atual],
    ['Período anterior', comparacao ? formatarValor(comparacao.valorAnterior) : '—'],
    /* O sinal viaja no texto, não só na cor: `+`/`−` é lido por quem não distingue verde de
       vermelho e por quem usa leitor de tela. */
    ['Variação absoluta', comparacao ? `${sinal}${formatarValor(comparacao.variacaoAbsoluta)}` : '—'],
    ['Variação percentual', comparacao?.variacaoPercentual == null ? 'sem base' : `${sinal}${comparacao.variacaoPercentual}%`]
  ];
  return (
    <section className="card p-4" aria-labelledby="metric-pulse-titulo">
      <h3 id="metric-pulse-titulo" className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> PULSO
      </h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {itens.map(([rotulo, v]) => (
          <div key={rotulo}>
            <dt className="kpi-label">{rotulo}</dt>
            <dd className="text-lg font-semibold tnum mt-0.5">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * Série temporal. O gráfico é `aria-hidden` e a tabela abaixo carrega o mesmo dado — regra O-11.
 * Dia sem valor aparece como zero porque a Foundation o preenche: omiti-lo desenharia continuidade
 * onde houve queda a zero.
 */
export function MetricTimeline({ pontos, semantica }) {
  const idTabela = useId();
  if (!pontos?.length) return null;
  const dados = pontos.map((p) => ({ dia: p.dia.slice(5), valor: p.valor ?? 0 }));

  return (
    <section className="card p-4" aria-labelledby="metric-timeline-titulo">
      <h3 id="metric-timeline-titulo" className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> LINHA DO TEMPO
      </h3>

      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dados} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Line type="monotone" dataKey="valor" stroke={CORES_METRICA[0]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Alternativa textual: o gráfico não é a única representação do dado. */}
      <details className="mt-3">
        <summary className="text-xs text-muted cursor-pointer">Ver os valores da série em tabela</summary>
        <table className="mt-2 w-full text-sm" id={idTabela}>
          <caption className="sr-only">Valores por dia no período selecionado</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="py-1">Dia</th>
              <th scope="col" className="py-1">Serviços</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.dia} className="border-t border-dark-600">
                <td className="py-1">{p.dia}</td>
                <td className="py-1 tnum">{p.valor ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {semantica && <p className="mt-2 text-xs text-muted">{semantica}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Breakdown
 * ------------------------------------------------------------------ */

/**
 * Recorte por dimensão. As dimensões vêm do contrato — o frontend nunca inventa nome de campo, e
 * o backend revalida o que chegar.
 */
export function MetricBreakdown({ dimensoes, dimensaoAtiva, onTrocar, grupos, carregando, formatarValor = (v) => v }) {
  return (
    <section className="card p-4" aria-labelledby="metric-breakdown-titulo">
      <h3 id="metric-breakdown-titulo" className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> QUEM CONTRIBUIU
      </h3>

      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Escolher dimensão do recorte">
        {dimensoes.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onTrocar(d === dimensaoAtiva ? null : d)}
            aria-pressed={d === dimensaoAtiva}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              d === dimensaoAtiva
                ? 'border-accent-400 bg-accent-400/10 text-accent-300'
                : 'border-dark-600 text-muted hover:border-accent-400/60'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {carregando && <FeedbackState state="loading" compact announce title="Recortando" description="Agrupando os dados." />}

      {!carregando && dimensaoAtiva && grupos?.length > 0 && (
        <>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={Math.min(grupos.length, 8) * 40 + 20}>
              <BarChart data={grupos.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis type="category" dataKey="rotulo" width={90} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                <Bar dataKey="valor" fill={CORES_METRICA[1]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 divide-y divide-dark-600">
            {grupos.map((g) => (
              <li key={g.chave} className="flex justify-between py-1.5 text-sm">
                <span>{g.rotulo}</span>
                <span className="tnum font-semibold">{formatarValor(g.valor)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {!carregando && dimensaoAtiva && grupos?.length === 0 && (
        <FeedbackState state="empty" compact title="Nada a recortar" description="Não há dados para esta dimensão no período." />
      )}
      {!carregando && !dimensaoAtiva && (
        <p className="text-sm text-muted">Escolha uma dimensão para ver o recorte.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Confiança e procedência
 * ------------------------------------------------------------------ */

const CONFIANCA = {
  HIGH: { rotulo: 'Alta', classe: 'text-emerald-400 border-emerald-400/40' },
  MEDIUM: { rotulo: 'Média', classe: 'text-amber-300 border-amber-300/40' },
  LOW: { rotulo: 'Baixa', classe: 'text-orange-400 border-orange-400/40' },
  INSUFFICIENT: { rotulo: 'Insuficiente', classe: 'text-rose-400 border-rose-400/40' }
};

/**
 * Estado de confiança — determinístico, vindo da Foundation. O frontend NÃO calcula score próprio
 * e não inventa percentual: "96% de confiança" sem metodologia é número com aparência de medida.
 */
export function MetricConfidence({ estado, registros, compacto = false }) {
  const c = CONFIANCA[estado] ?? CONFIANCA.INSUFFICIENT;
  const texto = `Confiança ${c.rotulo}${registros != null ? ` · ${registros} registros` : ''}`;
  if (compacto) {
    return <span className={`px-2 py-0.5 rounded-full border text-[11px] ${c.classe}`}>{texto}</span>;
  }
  return (
    <section className="card p-4" aria-labelledby="metric-confianca-titulo">
      <h3 id="metric-confianca-titulo" className="section-label mb-2">
        <span className="w-5 h-px bg-accent-400" /> CONFIANÇA DO DADO
      </h3>
      <p className={`inline-block px-2 py-0.5 rounded-full border text-xs ${c.classe}`}>{texto}</p>
    </section>
  );
}

/** Procedência: de qual contrato, versão, janela, filtros e quantos registros o número saiu. */
export function MetricLineage({ metricId, versao, janela, lineage, quality, ressalva = null }) {
  return (
    <section className="card p-4" aria-labelledby="metric-lineage-titulo">
      <h3 id="metric-lineage-titulo" className="section-label mb-3">
        <span className="w-5 h-px bg-accent-400" /> COMO ESTE NÚMERO FOI CALCULADO
      </h3>
      <dl className="space-y-2 text-sm">
        <Linha rotulo="Indicador" valor={`${metricId} · v${versao}`} />
        <Linha rotulo="Fórmula" valor={lineage?.formula} />
        <Linha rotulo="Granularidade" valor={lineage?.grain} />
        <Linha rotulo="Período" valor={janela} />
        <Linha rotulo="Filtros aplicados" valor={(lineage?.appliedFilters ?? []).join(' · ')} />
        <Linha rotulo="Origem" valor={(lineage?.sourceEntities ?? []).join(', ')} />
        <Linha rotulo="Registros considerados" valor={quality?.recordCount} />
        <Linha rotulo="Semântica de tempo" valor={lineage?.timeSemantics} />
        {/* O que o número NÃO considera é parte da procedência: uma definição financeira parcial
            apresentada sem o limite convida a leitura errada. */}
        <Linha rotulo="Limite da definição" valor={ressalva} />
      </dl>
    </section>
  );
}

function Linha({ rotulo, valor }) {
  if (valor === null || valor === undefined || valor === '') return null;
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2">
      <dt className="kpi-label pt-0.5">{rotulo}</dt>
      <dd className="text-slate-200">{valor}</dd>
    </div>
  );
}
