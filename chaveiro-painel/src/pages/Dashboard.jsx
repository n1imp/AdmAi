import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, Wrench, Wallet, ClipboardList,
  Target, Percent, HandCoins, MapPin, Star,
} from 'lucide-react';
import api, { formatarMoeda, formatarDataCurta } from '../lib/api.js';
import { SkeletonKpi } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import WelcomeCard from '../components/WelcomeCard.jsx';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
  { value: 'custom', label: 'Período' },
];

// Paleta técnica para o gráfico de locais (ciano + tons frios/quentes de apoio)
const CORES_LOCAL = ['#22D3EE', '#818CF8', '#34D399', '#FBBF24', '#F87171', '#2DD4BF'];

// Cores semânticas dos KPIs no tema Industrial Técnico
const CORES_KPI = {
  accent: 'text-accent-300 bg-accent-400/10',
  green: 'text-success bg-success/10',
  red: 'text-danger bg-danger/10',
  indigo: 'text-indigo-300 bg-indigo-400/10',
  blue: 'text-sky-300 bg-sky-400/10',
};

function Variacao({ valor }) {
  if (valor == null) return null;
  const positivo = valor >= 0;
  const Icon = positivo ? TrendingUp : TrendingDown;
  const cor = positivo ? 'text-success' : 'text-danger';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${cor}`}>
      <Icon size={12} strokeWidth={2.2} />
      {Math.abs(valor)}%
    </span>
  );
}

function KpiCard({ label, valor, icon: Icon, cor = 'accent', variacao }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${CORES_KPI[cor]}`}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="kpi-label truncate">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="kpi-value text-2xl mt-0.5">{valor}</p>
          {variacao !== undefined && <Variacao valor={variacao} />}
        </div>
      </div>
    </div>
  );
}

function TooltipMoeda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-500 rounded-md px-3 py-2 text-xs shadow-panel">
      {label != null && <p className="text-muted mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold tnum">
          {formatarMoeda(p.value)}
        </p>
      ))}
    </div>
  );
}

function hojeISO() {
  return new Date().toLocaleDateString('en-CA');
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState('mes');
  const [inicio, setInicio] = useState(hojeISO());
  const [fim, setFim] = useState(hojeISO());
  const [dados, setDados] = useState(null);
  const [satisfacao, setSatisfacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const customInvalido = periodo === 'custom' && (!inicio || !fim || inicio > fim);

  const buscar = useCallback(async () => {
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
      setDados(dash.data);
      setSatisfacao(aval.data?.resumo ?? null);
    } catch (e) {
      setErro('Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
    }
  }, [periodo, inicio, fim]);

  useEffect(() => {
    setCarregando(true);
    buscar();
  }, [buscar]);

  const { containerRef, isRefreshing } = usePullToRefresh(buscar);
  const comp = dados?.comparativo ?? {};

  return (
    <div ref={containerRef} className="overflow-y-auto h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> VISÃO GERAL</p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Painel</h1>
        </div>
        <button
          onClick={buscar}
          aria-label="Atualizar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors"
        >
          <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {isRefreshing && (
        <div className="flex justify-center pb-3">
          <div className="flex items-center gap-2 text-accent-300 text-xs">
            <RefreshCw size={14} className="animate-spin" /> Atualizando...
          </div>
        </div>
      )}

      {/* Cartão de boas-vindas (dispensável, some após o primeiro uso) */}
      <WelcomeCard />

      {/* Seletor de período */}
      <div className="px-4 flex gap-2 mb-4 flex-wrap">
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
                <input type="date" value={inicio} max={fim || undefined}
                  onChange={(e) => setInicio(e.target.value)} className="input py-2 text-sm w-full" />
              </div>
              <div className="flex-1">
                <label className="kpi-label text-[10px] mb-1 block">Fim</label>
                <input type="date" value={fim} min={inicio || undefined} max={hojeISO()}
                  onChange={(e) => setFim(e.target.value)} className="input py-2 text-sm w-full" />
              </div>
            </div>
            {customInvalido && (
              <p className="text-danger text-xs">A data inicial deve ser anterior ou igual à final.</p>
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
      <div className="px-4 grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {carregando ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)
        ) : dados ? (
          <>
            <KpiCard label="Receita Bruta" valor={formatarMoeda(dados.receitaBruta)} icon={TrendingUp} cor="accent" />
            <KpiCard label="Receita Líquida" valor={formatarMoeda(dados.receitaLiquida)} icon={Wallet} cor="green" variacao={comp.receitaLiquida} />
            <KpiCard label="Custo Material" valor={formatarMoeda(dados.totalMaterial)} icon={Wrench} cor="red" />
            <KpiCard label="Comissões" valor={formatarMoeda(dados.totalComissao)} icon={HandCoins} cor="indigo" />
            <KpiCard label="Serviços" valor={dados.totalServicos} icon={ClipboardList} cor="blue" variacao={comp.totalServicos} />
            <KpiCard label="Ticket Médio" valor={formatarMoeda(dados.ticketMedio)} icon={Target} cor="accent" variacao={comp.ticketMedio} />
          </>
        ) : null}
      </div>

      {/* Gráficos: técnicos + (local | evolução) responsivos */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:px-4">
        {/* Ranking de técnicos */}
        {dados?.porTecnico?.length > 0 && (
          <div className="px-4 lg:px-0 mb-6">
            <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> DESEMPENHO POR TÉCNICO</h2>
            <div className="card p-3 mb-3">
              <ResponsiveContainer width="100%" height={dados.porTecnico.length * 48 + 20}>
                <BarChart layout="vertical" data={dados.porTecnico} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fill: '#9AA3B2', fontSize: 10 }}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <YAxis dataKey="tecnico" type="category" tick={{ fill: '#E6E9EF', fontSize: 11, fontWeight: 600 }}
                    width={70} axisLine={false} tickLine={false} />
                  <Tooltip content={<TooltipMoeda />} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
                  <Bar dataKey="receitaLiquida" fill="#22D3EE" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2">
              {dados.porTecnico.map((t) => (
                <div key={t.tecnico} className="card flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{t.tecnico}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted tnum">
                      <span>{t.servicos} serv.</span>
                      <span>tkt {formatarMoeda(t.ticketMedio)}</span>
                      <span className="text-indigo-300">com. {formatarMoeda(t.comissao)}</span>
                    </div>
                  </div>
                  <span className="badge bg-accent-400/10 text-accent-300 border-accent-400/20 shrink-0 tnum">
                    {t.percentualReceita}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          {/* Distribuição por local */}
          {dados?.porLocal?.length > 0 && (
            <div className="px-4 lg:px-0 mb-6">
              <h2 className="section-label mb-3"><MapPin size={14} className="text-accent-300" /> RECEITA POR LOCAL</h2>
              <div className="card p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={dados.porLocal} dataKey="receita" nameKey="local" cx="50%" cy="50%"
                      innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {dados.porLocal.map((entry, i) => (
                        <Cell key={entry.local} fill={CORES_LOCAL[i % CORES_LOCAL.length]} stroke="#15181F" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<TooltipMoeda />} />
                    <Legend formatter={(value) => <span className="text-xs text-muted">{value}</span>} iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Evolução diária */}
          {dados?.evolucaoDiaria?.length > 1 && (
            <div className="px-4 lg:px-0 mb-6">
              <h2 className="section-label mb-3"><span className="w-5 h-px bg-accent-400" /> EVOLUÇÃO DIÁRIA</h2>
              <div className="card p-3">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={dados.evolucaoDiaria} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#262B34" strokeDasharray="3 3" />
                    <XAxis dataKey="data" tick={{ fill: '#9AA3B2', fontSize: 10 }}
                      tickFormatter={(v) => formatarDataCurta(v)} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#9AA3B2', fontSize: 10 }}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<TooltipMoeda />} />
                    <Line type="monotone" dataKey="receita" stroke="#22D3EE" strokeWidth={2}
                      dot={false} activeDot={{ r: 4, fill: '#22D3EE' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Card de satisfação dos clientes (média + distribuição 1–5)
function CardSatisfacao({ resumo }) {
  const media = resumo?.media;
  const total = resumo?.total ?? 0;
  return (
    <div className="card flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="kpi-label flex items-center gap-1.5"><Star size={12} className="text-warning" /> Satisfação</p>
          {total > 0 ? (
            <p className="font-display text-4xl font-bold text-white tracking-tight mt-1 tnum">
              {media?.toFixed(1)}<span className="text-lg text-muted">/5</span>
            </p>
          ) : (
            <p className="font-display text-2xl font-bold text-muted mt-2">Sem avaliações</p>
          )}
          {total > 0 && <p className="text-muted text-xs mt-1">{total} avaliação{total !== 1 ? 'ões' : ''} respondida{total !== 1 ? 's' : ''}</p>}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={16}
                className={n <= Math.round(media) ? 'text-warning fill-warning' : 'text-dark-500'}
                strokeWidth={1.5} />
            ))}
          </div>
        )}
      </div>
      {/* Mini distribuição */}
      {total > 0 && (
        <div className="mt-3 flex items-end gap-1.5 h-10">
          {(resumo.distribuicao ?? []).map((d) => {
            const max = Math.max(1, ...resumo.distribuicao.map((x) => x.quantidade));
            const h = Math.max(8, (d.quantidade / max) * 100);
            return (
              <div key={d.nota} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-accent-400/70 rounded-sm" style={{ height: `${h}%` }} title={`${d.quantidade}`} />
                <span className="text-[9px] text-muted">{d.nota}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
