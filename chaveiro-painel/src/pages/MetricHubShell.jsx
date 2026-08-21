/**
 * A moldura visual comum aos Metric Hubs.
 *
 * Junto com `useMetricHub`, é o que duas verticais provaram compartilhado: cabeçalho, seletor de
 * período, fronteira de estado, e a ordem dos módulos — Hero, Pulso, Timeline, Recorte, Registros,
 * Confiança, Procedência. Essa ordem não é estética: é a sequência que leva à decisão, e em mobile
 * ela vira exatamente a sequência de rolagem.
 *
 * O que cada métrica traz de seu, por parâmetro: como formatar o valor, a ressalva que o número
 * exige, as colunas do drilldown e as ações do rodapé. Isso fica FORA da moldura de propósito —
 * empurrar para dentro produziria o componente universal que deixa todo Hub igual e ilegível.
 */

import { Link } from 'react-router-dom';
import { ArrowLeft, ListFilter } from 'lucide-react';
import {
  MetricBreakdown, MetricConfidence, MetricHero, MetricLineage, MetricPulse,
  MetricStateBoundary, MetricTimeline
} from '../components/metric/MetricPrimitives.jsx';
import MetricDrilldown from '../components/metric/MetricDrilldown.jsx';

const PERIODOS = [
  ['hoje', 'Hoje'],
  ['semana', 'Semana'],
  ['mes', 'Mês']
];

export default function MetricHubShell({
  titulo, tituloHero, hub, formatarValor = (v) => v, ressalva = null,
  colunasDoDrilldown, acoes = [], rotuloRegistros
}) {
  const {
    periodo, setPeriodo, estado, metrica, serie, janelaTexto, recarregar,
    dimensao, breakdown, carregandoBreakdown, trocarDimensao,
    mostrarRegistros, registros, carregandoRegistros, erroRegistros, abrirRegistros
  } = hub;

  return (
    <div className="px-4 lg:px-0 pb-24 space-y-4">
      <header className="pt-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-slate-200">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar ao painel
        </Link>
        <h1 className="font-display text-2xl font-bold mt-2">{titulo}</h1>
      </header>

      <div className="flex gap-2" role="group" aria-label="Período">
        {PERIODOS.map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            onClick={() => setPeriodo(v)}
            aria-pressed={periodo === v}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              periodo === v
                ? 'border-accent-400 bg-accent-400/10 text-accent-300'
                : 'border-dark-600 text-muted hover:border-accent-400/60'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <MetricStateBoundary estado={estado} motivo={metrica?.reason} onTentarNovamente={recarregar}>
        {metrica && (
          <div className="space-y-4">
            <MetricHero
              nome={tituloHero}
              valor={formatarValor(metrica.value)}
              comparacao={metrica.comparison}
              confianca={metrica.quality}
              janela={janelaTexto}
            />

            {/* A ressalva acompanha o Hero, não o rodapé: quem lê o número precisa ler o limite
                dele no mesmo olhar. */}
            {ressalva && (
              <p className="text-xs text-muted -mt-2 px-1">{ressalva}</p>
            )}

            <MetricPulse
              atual={formatarValor(metrica.value)}
              comparacao={metrica.comparison}
              formatarValor={formatarValor}
            />

            <MetricTimeline pontos={serie?.pontos} semantica={serie?.timeSemantics} />

            <MetricBreakdown
              dimensoes={metrica.allowed?.dimensoes ?? []}
              dimensaoAtiva={dimensao}
              onTrocar={trocarDimensao}
              grupos={breakdown?.grupos}
              carregando={carregandoBreakdown}
              formatarValor={formatarValor}
            />

            <section className="card p-4" aria-labelledby="metric-registros-titulo">
              <h3 id="metric-registros-titulo" className="section-label mb-3">
                <span className="w-5 h-px bg-accent-400" /> REGISTROS
              </h3>
              {!mostrarRegistros ? (
                <button
                  type="button"
                  onClick={abrirRegistros}
                  className="panel-button panel-button--primary inline-flex items-center gap-2"
                  disabled={!metrica.permissions?.canDrillDown}
                >
                  <ListFilter size={16} aria-hidden="true" />
                  {rotuloRegistros}
                </button>
              ) : (
                <MetricDrilldown
                  dados={registros}
                  colunas={colunasDoDrilldown}
                  carregando={carregandoRegistros}
                  erro={erroRegistros}
                  autorizado={metrica.permissions?.canDrillDown}
                />
              )}
              {!metrica.permissions?.canDrillDown && (
                <p className="mt-2 text-xs text-muted">
                  Ver o total e ver os registros são permissões diferentes.
                </p>
              )}
            </section>

            <MetricConfidence estado={metrica.quality?.state} registros={metrica.quality?.recordCount} />

            <MetricLineage
              metricId={metrica.metricId}
              versao={metrica.version}
              janela={janelaTexto}
              lineage={metrica.lineage}
              quality={metrica.quality}
              ressalva={ressalva}
            />

            {acoes.length > 0 && (
              <nav className="flex flex-wrap gap-2" aria-label="Ações">
                {acoes.map((a) => (
                  <Link key={a.para} to={a.para} className="panel-button">{a.rotulo}</Link>
                ))}
              </nav>
            )}
          </div>
        )}
      </MetricStateBoundary>
    </div>
  );
}
