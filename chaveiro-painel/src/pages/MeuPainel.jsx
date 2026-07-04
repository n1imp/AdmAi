import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, HandCoins, ClipboardList, Target, Fingerprint,
  Plus, Wrench, AlertTriangle, RefreshCw,
} from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { SkeletonKpi } from '../components/Skeleton.jsx';
import ErroBanner from '../components/ErroBanner.jsx';

// Cores semânticas dos KPIs (mesma paleta do Dashboard).
const CORES_KPI = {
  accent: 'text-accent-300 bg-accent-400/10',
  green: 'text-success bg-success/10',
  indigo: 'text-indigo-300 bg-indigo-400/10',
  blue: 'text-sky-300 bg-sky-400/10',
};

function KpiCard({ label, valor, icon: Icon, cor = 'accent' }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${CORES_KPI[cor]}`}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="kpi-label truncate">{label}</p>
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
      <svg className="text-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export default function MeuPainel() {
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/me/metricas');
      setDados(data);
    } catch {
      setErro('Não foi possível carregar suas métricas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

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
            <p className="section-label mb-0.5"><span className="w-5 h-px bg-accent-400" /> MEU PAINEL</p>
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

      {/* Aviso de serviços aguardando aprovação */}
      {!carregando && pendentes > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
            <AlertTriangle size={20} className="text-warning shrink-0" />
            <p className="text-sm text-white font-medium">
              {pendentes} serviço{pendentes !== 1 ? 's' : ''} aguardando aprovação do gestor
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-4">
        {carregando ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonKpi key={i} />)
        ) : dados ? (
          <>
            <div className="col-span-2 card-accent bg-gradient-to-br from-accent-400/10 to-dark-800 flex items-center justify-between">
              <div>
                <p className="kpi-label">Comissão a receber</p>
                <p className="font-display text-4xl font-bold text-white tracking-tight mt-1 tnum">
                  {formatarMoeda(dados.saldoPendente)}
                </p>
                <p className="text-muted text-xs mt-1">aguardando repasse</p>
              </div>
              <div className="w-12 h-12 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center text-accent-300 shrink-0">
                <Wallet size={24} strokeWidth={1.8} />
              </div>
            </div>
            <KpiCard label="Comissão ganha" valor={formatarMoeda(dados.comissaoGanha)} icon={HandCoins} cor="indigo" />
            <KpiCard label="Serviços realizados" valor={dados.totalServicos} icon={ClipboardList} cor="blue" />
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
                  <p className="kpi-label">Meta do mês</p>
                  <p className="font-display text-lg font-bold text-white leading-tight tnum">
                    {formatarMoeda(mes.receitaLiquida)}
                    {temMeta && <span className="text-sm text-muted"> / {formatarMoeda(mes.meta)}</span>}
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
