import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw,
  TrendingUp,
  Wrench,
  Wallet,
  ClipboardList,
  Target,
  Percent,
  HandCoins,
} from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { KpiCard, CardSatisfacao } from './DashboardParts.jsx';
import DashboardWidgets from './DashboardWidgets.jsx';
import { SkeletonKpi } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import WelcomeCard from '../components/WelcomeCard.jsx';
import { startTour } from '../components/TourGuide.jsx';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'custom', label: 'Período' },
];

// KpiCard, TooltipMoeda, Variacao e CardSatisfacao vivem em ./DashboardParts.jsx;
// os widgets de gráfico e a personalização (F4d) em ./DashboardWidgets.jsx.

function hojeISO() {
  return new Date().toLocaleDateString('en-CA');
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState('mes');
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [dados, setDados] = useState(null);
  const [satisfacao, setSatisfacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);

  const customInvalido = periodo === 'custom' && (!inicio || !fim || inicio > fim);

  // `guard` permite que o efeito cancele os setState após desmontar/refazer.
  // Chamadas via onClick/pull-to-refresh passam outros args — ignorados aqui.
  const buscar = useCallback(
    async (guard) => {
      const estaAtivo = typeof guard === 'function' ? guard : () => true;
      if (periodo === 'custom' && (!inicio || !fim || inicio > fim)) return;
      setErro(null);
      try {
        const params = new URLSearchParams({ periodo });
        if (periodo === 'custom') {
          params.set('inicio', inicio);
          params.set('fim', fim);
        }
        const [dash, aval] = await Promise.all([
          api.get(`/dashboard?${params}`),
          api.get('/avaliacoes').catch(() => ({ data: null })),
        ]);
        if (!estaAtivo()) return;
        setDados(dash.data);
        setSatisfacao(aval.data?.resumo ?? null);
      } catch (e) {
        if (estaAtivo()) setErro('Não foi possível carregar os dados.');
      } finally {
        if (estaAtivo()) setCarregando(false);
      }
    },
    [periodo, inicio, fim]
  );

  useEffect(() => {
    let active = true;
    setCarregando(true);
    buscar(() => active);
    return () => {
      active = false;
    };
  }, [buscar]);

  // Auto-start do tour de onboarding na primeira visita ao Painel.
  // Espera os KPIs renderizarem (carregando=false) para que os alvos existam no
  // DOM; startTour respeita o flag `chaveiro_tour_done`, então não insiste.
  useEffect(() => {
    if (carregando) return;
    const t = setTimeout(() => startTour({ navigate }), 600);
    return () => clearTimeout(t);
  }, [carregando, navigate]);

  const { containerRef, isRefreshing } = usePullToRefresh(buscar);
  const comp = dados?.comparativo ?? {};

  // Atualização manual com trava anti duplo-clique (evita fetch em paralelo).
  async function atualizarManual() {
    if (atualizando) return;
    setAtualizando(true);
    try {
      await buscar();
    } finally {
      setAtualizando(false);
    }
  }
  const ocupado = atualizando || isRefreshing;

  return (
    <div ref={containerRef} className="overflow-y-auto h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="section-label mb-1">
            <span className="w-5 h-px bg-accent-400" /> VISÃO GERAL
          </p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">
            Painel
          </h1>
        </div>
        <button
          onClick={atualizarManual}
          disabled={ocupado}
          aria-label="Atualizar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={17} className={ocupado ? 'animate-spin' : ''} />
        </button>
      </div>

      {ocupado && (
        <div className="flex justify-center pb-3">
          <div className="flex items-center gap-2 text-accent-300 text-xs">
            <RefreshCw size={14} className="animate-spin" /> Atualizando...
          </div>
        </div>
      )}

      {/* Cartão de boas-vindas (dispensável, some após o primeiro uso) */}
      <div data-tour="welcome">
        <WelcomeCard onVerTutorial={() => startTour({ force: true, navigate })} />
      </div>

      {/* Seletor de período */}
      <div data-tour="periodos" className="px-4 flex gap-2 mb-4 flex-wrap">
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`px-4 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wider transition-all ${
              periodo === p.value
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'custom' && (
        <div className="px-4 mb-4">
          <div className="card flex flex-col gap-3 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="kpi-label text-[10px] mb-1 block">Início</label>
                <input
                  type="date"
                  value={inicio}
                  max={fim || undefined}
                  onChange={(e) => setInicio(e.target.value)}
                  className="input py-2 text-sm w-full"
                />
              </div>
              <div className="flex-1">
                <label className="kpi-label text-[10px] mb-1 block">Fim</label>
                <input
                  type="date"
                  value={fim}
                  min={inicio || undefined}
                  max={hojeISO()}
                  onChange={(e) => setFim(e.target.value)}
                  className="input py-2 text-sm w-full"
                />
              </div>
            </div>
            {customInvalido && (
              <p className="text-danger text-xs">
                A data inicial deve ser anterior ou igual à final.
              </p>
            )}
          </div>
        </div>
      )}

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {/* Destaque: Lucro + margem | Satisfação (lado a lado no desktop) */}
      {!carregando && dados && (
        <div className="px-4 mb-4 grid gap-3 lg:grid-cols-2">
          <div className="card-accent bg-gradient-to-br from-accent-400/10 to-dark-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="kpi-label">Lucro do período</p>
                <p className="font-display text-4xl font-bold text-white tracking-tight mt-1 tnum">
                  {formatarMoeda(dados.lucro)}
                </p>
                <p className="text-muted text-xs mt-1">após material e comissões</p>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center gap-1 bg-accent-400/15 text-accent-300 rounded-md px-3 py-1.5 border border-accent-400/20">
                  <Percent size={14} />
                  <span className="font-display text-xl font-bold tnum">{dados.margemLucro}%</span>
                </div>
                <p className="text-muted text-[10px] mt-1 uppercase tracking-wider">margem</p>
              </div>
            </div>
          </div>

          {/* Card de satisfação (avaliações dos clientes) */}
          <CardSatisfacao resumo={satisfacao} />
        </div>
      )}

      {/* KPIs */}
      <div data-tour="kpis" className="px-4 grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} announce={i === 0} />)
        ) : dados ? (
          <>
            <KpiCard
              label="Receita Bruta"
              valor={formatarMoeda(dados.receitaBruta)}
              icon={TrendingUp}
              cor="accent"
            />
            <KpiCard
              label="Receita Líquida"
              valor={formatarMoeda(dados.receitaLiquida)}
              hubEm="/metricas/faturamento-liquido"
              icon={Wallet}
              cor="green"
              variacao={comp.receitaLiquida}
            />
            <KpiCard
              label="Custo Material"
              valor={formatarMoeda(dados.totalMaterial)}
              icon={Wrench}
              cor="red"
            />
            <KpiCard
              label="Comissões"
              valor={formatarMoeda(dados.totalComissao)}
              icon={HandCoins}
              cor="indigo"
            />
            <KpiCard
              label="Serviços"
              valor={dados.totalServicos}
              icon={ClipboardList}
              cor="blue"
              variacao={comp.totalServicos}
              hubEm="/metricas/servicos-concluidos"
            />
            <KpiCard
              label="Ticket Médio"
              valor={formatarMoeda(dados.ticketMedio)}
              icon={Target}
              cor="accent"
              variacao={comp.ticketMedio}
            />
          </>
        ) : null}
      </div>

      {/* F4c/F4d: painéis (gráficos) do Dono, reordenáveis/ocultáveis com persistência local */}
      {dados && <DashboardWidgets dados={dados} />}
    </div>
  );
}
