import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Calendar,
  MapPin,
  User,
  CheckCircle,
  Clock,
  XCircle,
  Play,
  CheckCheck,
  Loader,
} from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

// Badge por status do serviço próprio.
const STATUS = {
  ativo: {
    rotulo: 'Aprovado',
    icon: CheckCircle,
    classe: 'bg-success/10 text-success border-success/20',
  },
  // F9/M3: estado transitório "serviço atual" do funcionário (atrás da flag).
  em_andamento: {
    rotulo: 'Em andamento',
    icon: Loader,
    classe: 'bg-accent-400/10 text-accent-300 border-accent-400/20',
  },
  pendente: {
    rotulo: 'Aguardando aprovação',
    icon: Clock,
    classe: 'bg-warning/10 text-warning border-warning/20',
  },
  rejeitado: {
    rotulo: 'Rejeitado',
    icon: XCircle,
    classe: 'bg-danger/10 text-danger border-danger/20',
  },
};

// F7: filtro por status (view de pendências) — os valores casam com `STATUS` acima.
const FILTROS = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'pendente', label: 'Aguardando' },
  { valor: 'ativo', label: 'Aprovados' },
  { valor: 'rejeitado', label: 'Rejeitados' },
];

function BadgeStatus({ status }) {
  const cfg = STATUS[status] ?? STATUS.ativo;
  const Icon = cfg.icon;
  return (
    <span className={`badge inline-flex items-center gap-1 border ${cfg.classe}`}>
      <Icon size={11} /> {cfg.rotulo}
    </span>
  );
}

function CardMeuServico({ servico, acao }) {
  return (
    <div className="card animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <BadgeStatus status={servico.status} />
            <span className="badge bg-dark-700 text-muted border border-dark-600">
              {servico.local}
            </span>
          </div>
          <p className="text-white text-sm font-medium truncate mt-1">{servico.descricao}</p>
          {servico.endereco && (
            <p className="text-muted text-xs mt-1 flex items-center gap-1 truncate">
              <MapPin size={11} className="shrink-0" /> {servico.endereco}
            </p>
          )}
          {servico.clienteNome && (
            <p className="text-muted text-xs mt-0.5 flex items-center gap-1 truncate">
              <User size={11} className="shrink-0" /> {servico.clienteNome}
            </p>
          )}
          <p className="text-xs text-dark-600 mt-1 flex items-center gap-1">
            <Calendar size={11} /> {formatarData(servico.criadoEm)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold text-white text-xl leading-none tnum">
            {formatarMoeda(servico.valorCobrado)}
          </p>
          <p className="text-muted text-[11px] mt-0.5">cobrado</p>
          <p className="text-indigo-300 text-xs mt-1.5 tnum">
            com. {formatarMoeda(servico.comissaoGerada)}
          </p>
        </div>
      </div>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export default function MeusServicos() {
  const navigate = useNavigate();
  const toast = useToast();
  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // F9/M3 (flag SERVICO_ANDAMENTO_ENABLED): "serviço atual" do funcionário. Detectado por
  // feature-probe — o endpoint responde 404 com a flag off, então a UI some por completo.
  const [servicoAtual, setServicoAtual] = useState(null);
  const [m3Disponivel, setM3Disponivel] = useState(false);
  const [acaoId, setAcaoId] = useState(null);

  // Filtro inicial vindo do deep-link (ex.: MeuPainel → ?status=pendente).
  const statusUrl = searchParams.get('status');
  const [filtro, setFiltro] = useState(
    ['pendente', 'ativo', 'rejeitado'].includes(statusUrl) ? statusUrl : 'todos'
  );

  function selecionar(valor) {
    setFiltro(valor);
    setSearchParams(valor === 'todos' ? {} : { status: valor }, { replace: true });
  }

  const contar = (valor) =>
    valor === 'todos' ? servicos.length : servicos.filter((s) => s.status === valor).length;
  const visiveis = filtro === 'todos' ? servicos : servicos.filter((s) => s.status === filtro);

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/me/servicos');
      setServicos(Array.isArray(data) ? data : []);
    } catch {
      setErro('Não foi possível carregar seus serviços.');
    } finally {
      setCarregando(false);
    }
  }, []);

  // Probe do M3: 200 → feature ligada (guarda o serviço atual); 404/403 → desligada (esconde).
  const sincronizarAtual = useCallback(async () => {
    try {
      const { data } = await api.get('/me/servico-atual');
      setM3Disponivel(true);
      setServicoAtual(data?.servico ?? null);
    } catch {
      setM3Disponivel(false);
      setServicoAtual(null);
    }
  }, []);

  useEffect(() => {
    buscar();
    sincronizarAtual();
  }, [buscar, sincronizarAtual]);

  async function iniciar(id) {
    if (acaoId) return;
    setAcaoId(id);
    try {
      const { data } = await api.post(`/servicos/${id}/iniciar`);
      setServicoAtual(data?.servico ?? null);
      await buscar();
      toast('Serviço iniciado', 'success');
    } catch (e) {
      if (e.response?.status === 409) toast('Você já tem um serviço em andamento', 'warning');
      else toast('Não foi possível iniciar o serviço', 'error');
    } finally {
      setAcaoId(null);
    }
  }

  async function concluir(id) {
    if (acaoId) return;
    setAcaoId(id);
    try {
      await api.post(`/servicos/${id}/concluir`);
      setServicoAtual(null);
      await buscar();
      toast('Serviço concluído', 'success');
    } catch {
      toast('Não foi possível concluir o serviço', 'error');
    } finally {
      setAcaoId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <p className="section-label mb-1">
            <span className="w-5 h-px bg-accent-400" /> REGISTROS
          </p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">
            Meus serviços
          </h1>
          <p className="text-muted text-xs mt-0.5 tnum">
            {servicos.length > 0
              ? `${servicos.length} registro${servicos.length !== 1 ? 's' : ''}`
              : 'Nenhum registro'}
          </p>
        </div>
        <button
          onClick={() => navigate('/meus-servicos/novo')}
          aria-label="Registrar serviço"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent-400 text-dark-950 font-display font-semibold uppercase tracking-wider text-sm shadow-[0_0_18px_-6px_rgba(139,92,246,0.6)] hover:bg-accent-300 transition-colors"
        >
          <Plus size={18} /> <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      {/* Serviço atual em andamento (F9/M3) — some com a flag off (m3Disponivel=false) */}
      {m3Disponivel && servicoAtual && (
        <div className="px-4 mb-3">
          <div className="card card-accent bg-gradient-to-br from-accent-400/10 to-dark-800">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="section-label mb-1">
                  <span className="w-5 h-px bg-accent-400" /> SERVIÇO ATUAL
                </p>
                <p className="text-white font-semibold text-sm truncate">
                  {servicoAtual.descricao}
                </p>
                <p className="text-muted text-xs mt-0.5 truncate">
                  {servicoAtual.local}
                  {servicoAtual.iniciadoEm &&
                    ` · iniciado ${formatarData(servicoAtual.iniciadoEm)}`}
                </p>
              </div>
              <button
                onClick={() => concluir(servicoAtual.id)}
                disabled={acaoId === servicoAtual.id}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-success text-dark-950 font-display font-semibold uppercase tracking-wider text-sm hover:bg-success/90 transition-colors disabled:opacity-60 shrink-0"
              >
                <CheckCheck size={18} /> Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtro por status (só quando há registros) */}
      {!carregando && servicos.length > 0 && (
        <div
          className="px-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          role="group"
          aria-label="Filtrar por status"
        >
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => selecionar(f.valor)}
              aria-pressed={filtro === f.valor}
              className={`alvo-toque shrink-0 px-3 rounded-md text-xs font-medium transition-colors border ${
                filtro === f.valor
                  ? 'bg-accent-400 text-dark-950 border-accent-400'
                  : 'bg-dark-700 text-muted border-dark-600 hover:text-white'
              }`}
            >
              {f.label} <span className="tnum opacity-70">({contar(f.valor)})</span>
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-3">
        {carregando ? (
          <SkeletonLista qtd={5} />
        ) : servicos.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhum serviço ainda"
            sub="Registre seu primeiro atendimento no botão acima"
            cta={{ label: 'Registrar serviço', to: '/meus-servicos/novo' }}
          />
        ) : visiveis.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhum serviço neste status"
            sub="Ajuste o filtro acima para ver outros serviços."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {visiveis.map((s) => (
              <CardMeuServico
                key={s.id}
                servico={s}
                acao={
                  m3Disponivel && s.status === 'ativo' && !servicoAtual ? (
                    <button
                      onClick={() => iniciar(s.id)}
                      disabled={acaoId === s.id}
                      className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-md bg-accent-400/10 text-accent-300 border border-accent-400/20 font-display font-semibold uppercase tracking-wide text-xs hover:bg-accent-400/15 transition-colors disabled:opacity-60"
                    >
                      <Play size={14} /> Iniciar serviço
                    </button>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
