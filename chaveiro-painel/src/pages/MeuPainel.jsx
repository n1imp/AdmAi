import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Wallet,
  HandCoins,
  ClipboardList,
  Target,
  Fingerprint,
  Plus,
  Wrench,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  DollarSign,
} from 'lucide-react';
import api, { formatarMoeda, formatarDataCurta } from '../lib/api.js';
import { SkeletonKpi } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';

// Cores semânticas dos KPIs (mesma paleta do Dashboard).
const CORES_KPI = {
  accent: 'text-accent-300 bg-accent-400/10',
  green: 'text-success bg-success/10',
  indigo: 'text-indigo-300 bg-indigo-400/10',
  blue: 'text-sky-300 bg-sky-400/10',
};

// F9/M1: período selecionável do desempenho pessoal (consome /me/metricas?periodo=).
const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
];

function GraficoTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-800 border border-dark-500 rounded-md px-3 py-2 text-xs shadow-panel">
      <p className="text-muted mb-1">{formatarDataCurta(label)}</p>
      <p className="text-accent-300 font-semibold tnum">
        Receita: {formatarMoeda(payload[0].value)}
      </p>
    </div>
  );
}

function KpiCard({ label, valor, icon: Icon, cor = 'accent' }) {
  return (
    <div className="card flex items-center gap-3">
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${CORES_KPI[cor]}`}
      >
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        {/* Sem `truncate`: cortar o rótulo esconde QUAL número está sendo mostrado, que é a
            única coisa que o rótulo faz. Quebra em até duas linhas quando não couber —
            os cards da grade esticam juntos, então o alinhamento se mantém. [GAP-UI-03] */}
        <p className="kpi-label line-clamp-2">{label}</p>
        <p className="kpi-value text-2xl mt-0.5">{valor}</p>
      </div>
    </div>
  );
}

// Atalho grande (full-width) para as ações principais do funcionário.
function Atalho({ icon: Icon, titulo, sub, onClick, destaque }) {
  return (
    <button
      onClick={onClick}
      className={`card flex items-center gap-4 text-left active:scale-[0.98] transition-transform w-full ${
        destaque ? 'card-accent bg-gradient-to-br from-accent-400/10 to-dark-800' : ''
      }`}
    >
      <div
        className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 border ${
          destaque
            ? 'bg-accent-400/15 border-accent-400/30 text-accent-300'
            : 'bg-dark-700 border-dark-600 text-accent-300'
        }`}
      >
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{titulo}</p>
        <p className="text-muted text-xs mt-0.5">{sub}</p>
      </div>
      <svg
        className="text-muted shrink-0"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export default function MeuPainel() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [periodo, setPeriodo] = useState('mes');
  // Só o primeiro fetch pinta a tela toda com skeleton; trocar de período faz um
  // refetch "leve" (mantém os dados atuais e apenas esmaece a seção do período).
  const primeiraCarga = useRef(true);

  const buscar = useCallback(
    async (guard) => {
      const ativo = typeof guard === 'function' ? guard : () => true;
      setErro(null);
      if (primeiraCarga.current) setCarregando(true);
      else setCarregandoPeriodo(true);
      try {
        const { data } = await api.get(`/me/metricas?periodo=${periodo}`);
        if (!ativo()) return;
        setDados(data);
      } catch {
        if (ativo()) setErro('Não foi possível carregar suas métricas.');
      } finally {
        if (ativo()) {
          setCarregando(false);
          setCarregandoPeriodo(false);
          primeiraCarga.current = false;
        }
      }
    },
    [periodo]
  );

  useEffect(() => {
    let ativo = true;
    buscar(() => ativo);
    return () => {
      ativo = false;
    };
  }, [buscar]);

  async function atualizarManual() {
    if (atualizando) return;
    setAtualizando(true);
    try {
      await buscar();
    } finally {
      setAtualizando(false);
    }
  }

  const tecnico = dados?.tecnico;
  const mes = dados?.mesAtual;
  const pendentes = dados?.servicosPendentes ?? 0;
  const progresso = mes?.progressoMeta;
  const temMeta = mes?.meta != null;
  const per = dados?.periodo;
  const serie = dados?.serie ?? [];

  return (
    <div className="overflow-y-auto h-full animate-fade-in">
      {/* Header — saudação com nome e foto */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {tecnico?.fotoPerfil ? (
            <img
              src={tecnico.fotoPerfil}
              alt={tecnico.nome}
              className="w-12 h-12 rounded-md object-cover border border-dark-600 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center font-display font-bold text-accent-300 text-lg shrink-0">
              {(tecnico?.nome ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="section-label mb-0.5">
              <span className="w-5 h-px bg-accent-400" /> MEU PAINEL
            </p>
            <h1 className="font-display text-2xl font-bold text-white tracking-wide truncate">
              Olá, {tecnico?.nome?.split(' ')[0] ?? 'técnico'}
            </h1>
          </div>
        </div>
        <button
          onClick={atualizarManual}
          disabled={atualizando}
          aria-label="Atualizar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw size={17} className={atualizando ? 'animate-spin' : ''} />
        </button>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {/* Aviso de serviços aguardando aprovação — leva à view de pendências (F7) */}
      {!carregando && pendentes > 0 && (
        <div className="px-4 mb-4">
          <Link
            to="/meus-servicos?status=pendente"
            className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 hover:bg-warning/15 transition-colors"
          >
            <AlertTriangle size={20} className="text-warning shrink-0" />
            <p className="text-sm text-white font-medium flex-1">
              {pendentes} serviço{pendentes !== 1 ? 's' : ''} aguardando aprovação do gestor
            </p>
            <ChevronRight size={16} className="text-warning shrink-0" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* KPIs */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        {carregando ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} announce={i === 0} />)
        ) : dados ? (
          <>
            <div className="col-span-2 card-accent bg-gradient-to-br from-accent-400/10 to-dark-800 flex items-center justify-between">
              <div>
                <p className="kpi-label">Comissão a receber</p>
                <p className="font-display text-4xl font-bold text-white tracking-tight mt-1 tnum">
                  {formatarMoeda(dados.saldoPendente)}
                </p>
                {/* Mostra a COMPOSIÇÃO, não só o saldo. `saldoPendente` é
                    `comissaoGanha - totalRecebido`: quando nada foi repassado os dois números são
                    iguais, e dois cards de "Comissão" com o mesmo valor lado a lado levam o
                    técnico a somar. Dizer de quanto vem, e quanto já saiu, desfaz a leitura
                    errada sem esconder nenhuma das duas métricas. [GAP-UI-04] */}
                <p className="text-muted text-xs mt-1">
                  {dados.totalRecebido > 0
                    ? `de ${formatarMoeda(dados.comissaoGanha)} — já recebeu ${formatarMoeda(dados.totalRecebido)}`
                    : 'aguardando repasse · nada foi repassado ainda'}
                </p>
              </div>
              <div className="w-12 h-12 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center text-accent-300 shrink-0">
                <Wallet size={24} strokeWidth={1.8} />
              </div>
            </div>
            <KpiCard
              label="Total gerado no período"
              valor={formatarMoeda(dados.comissaoGanha)}
              icon={HandCoins}
              cor="indigo"
            />
            <KpiCard
              label="Serviços realizados"
              valor={dados.totalServicos}
              icon={ClipboardList}
              cor="blue"
            />
          </>
        ) : null}
      </div>

      {/* Meta do mês */}
      {!carregando && mes && (
        <div className="px-4 mb-5">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-md bg-indigo-400/10 border border-indigo-400/20 flex items-center justify-center text-indigo-300 shrink-0">
                  <Target size={18} strokeWidth={1.8} />
                </div>
                <div>
                  {/* O rótulo depende de HAVER meta. O número grande é sempre a receita líquida
                      do mês; chamá-lo de "Meta do mês" sem meta definida afirmava que a meta era
                      o próprio resultado — e o texto logo abaixo dizia que não havia meta. O dado
                      estava certo, o rótulo é que mentia sobre o que ele é. [GAP-UI-04] */}
                  <p className="kpi-label">{temMeta ? 'Meta do mês' : 'Receita líquida do mês'}</p>
                  <p className="font-display text-lg font-bold text-white leading-tight tnum">
                    {formatarMoeda(mes.receitaLiquida)}
                    {temMeta && (
                      <span className="text-sm text-muted"> / {formatarMoeda(mes.meta)}</span>
                    )}
                  </p>
                </div>
              </div>
              {temMeta && progresso != null && (
                <span className="badge bg-accent-400/10 text-accent-300 border-accent-400/20 tnum">
                  {Math.round(progresso)}%
                </span>
              )}
            </div>
            {temMeta ? (
              <div className="h-2.5 rounded-full bg-dark-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-400 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, progresso ?? 0))}%` }}
                />
              </div>
            ) : (
              <p className="text-muted text-xs">Sem meta definida</p>
            )}
          </div>
        </div>
      )}

      {/* Meu desempenho por período (F9/M1) */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="section-label">
            <span className="w-5 h-px bg-accent-400" /> MEU DESEMPENHO
          </p>
          <div className="flex gap-1.5" role="group" aria-label="Período do desempenho">
            {PERIODOS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriodo(p.value)}
                aria-pressed={periodo === p.value}
                className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
                  periodo === p.value
                    ? 'bg-accent-400 text-dark-950'
                    : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {carregando ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonKpi key={i} announce={i === 0} />
            ))}
          </div>
        ) : per ? (
          <div
            className={`transition-opacity ${carregandoPeriodo ? 'opacity-50' : ''}`}
            aria-busy={carregandoPeriodo}
          >
            {/* KPIs do período */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: 'Serviços', valor: per.servicos, icon: ClipboardList, cor: 'blue' },
                {
                  label: 'Receita líquida',
                  valor: formatarMoeda(per.receitaLiquida),
                  icon: TrendingUp,
                  cor: 'accent',
                },
                {
                  label: 'Comissão',
                  valor: formatarMoeda(per.comissao),
                  icon: DollarSign,
                  cor: 'green',
                },
              ].map(({ label, valor, icon: Icon, cor }) => (
                <div key={label} className="card flex flex-col gap-1.5">
                  <div
                    className={`w-8 h-8 rounded-md flex items-center justify-center ${CORES_KPI[cor]}`}
                  >
                    <Icon size={16} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="kpi-label text-[10px] truncate">{label}</p>
                    <p className="font-display font-bold text-white text-base leading-tight tnum truncate">
                      {valor}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Evolução diária: gráfico (decorativo, aria-hidden) + alternativa textual */}
            {per.servicos === 0 ? (
              <EstadoVazio
                mensagem="Nenhum serviço neste período"
                sub="Registre um atendimento para acompanhar seu desempenho."
              />
            ) : serie.length > 1 ? (
              <div className="card">
                <div aria-hidden="true">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#262B34" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="data"
                        tick={{ fill: '#9AA3B2', fontSize: 9 }}
                        tickFormatter={(v) => formatarDataCurta(v)}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: '#9AA3B2', fontSize: 9 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <Tooltip
                        content={<GraficoTooltip />}
                        cursor={{ fill: 'rgba(167,139,250,0.08)' }}
                      />
                      <Bar dataKey="receita" fill="#a78bfa" radius={[3, 3, 0, 0]} name="receita" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="sr-only">
                  Receita líquida por dia no período:{' '}
                  {serie
                    .map((d) => `${formatarDataCurta(d.data)}: ${formatarMoeda(d.receita)}`)
                    .join('; ')}
                  .
                </p>
                <p className="text-center text-xs text-muted mt-2">Receita líquida por dia</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Atalhos */}
      <div className="px-4 pb-8 flex flex-col gap-3 lg:max-w-2xl">
        <p className="section-label px-1">Atalhos</p>
        <Atalho
          icon={Fingerprint}
          titulo="Bater ponto"
          sub="Registrar entrada, almoço e saída"
          onClick={() => navigate('/meu-ponto')}
          destaque
        />
        <Atalho
          icon={Plus}
          titulo="Registrar serviço"
          sub="Lançar um novo atendimento"
          onClick={() => navigate('/meus-servicos/novo')}
        />
        <Atalho
          icon={Wrench}
          titulo="Meus serviços"
          sub="Ver histórico e status"
          onClick={() => navigate('/meus-servicos')}
        />
      </div>
    </div>
  );
}
