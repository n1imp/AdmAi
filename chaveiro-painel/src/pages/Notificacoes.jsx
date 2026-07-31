import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Package,
  CalendarDays,
  ClipboardList,
  Target,
  Info,
  Check,
  Trash2,
  CheckCheck,
} from 'lucide-react';
import api, { formatarData } from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import { useToast } from '../components/Toast.jsx';

// Ícone + cor por tipo de aviso
const TIPOS = {
  estoque_baixo: { icon: Package, cor: 'text-warning', bg: 'bg-warning/10' },
  resumo: { icon: CalendarDays, cor: 'text-sky-300', bg: 'bg-sky-400/10' },
  novo_servico: { icon: ClipboardList, cor: 'text-success', bg: 'bg-success/10' },
  meta: { icon: Target, cor: 'text-indigo-300', bg: 'bg-indigo-400/10' },
  sistema: { icon: Info, cor: 'text-muted', bg: 'bg-dark-700' },
};

// Definição dos toggles de preferência
const PREFERENCIAS = [
  {
    chave: 'estoque_baixo',
    titulo: 'Estoque baixo',
    sub: 'Quando um material atinge o mínimo',
    icon: Package,
    cor: 'text-warning',
    bg: 'bg-warning/10',
  },
  {
    chave: 'resumo',
    titulo: 'Resumo semanal',
    sub: 'Balanço do desempenho da semana',
    icon: CalendarDays,
    cor: 'text-sky-300',
    bg: 'bg-sky-400/10',
  },
  {
    chave: 'novo_servico',
    titulo: 'Novo serviço',
    sub: 'A cada serviço registrado',
    icon: ClipboardList,
    cor: 'text-success',
    bg: 'bg-success/10',
  },
  {
    chave: 'meta',
    titulo: 'Metas',
    sub: 'Quando um técnico bate a meta do mês',
    icon: Target,
    cor: 'text-indigo-300',
    bg: 'bg-indigo-400/10',
  },
];

function Toggle({ ativo, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${ativo ? 'bg-success' : 'bg-dark-600'} disabled:opacity-50`}
      aria-label="Alternar"
    >
      <span
        className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${ativo ? 'left-6' : 'left-1'}`}
      />
    </button>
  );
}

function AbaAvisos() {
  const toast = useToast();
  const navigate = useNavigate();
  const [avisos, setAvisos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    try {
      const { data } = await api.get('/notificacoes');
      setAvisos(data);
    } catch {
      toast('Erro ao carregar avisos', 'error');
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  async function abrir(aviso) {
    if (!aviso.lida) {
      try {
        await api.patch(`/notificacoes/${aviso.id}/lida`);
        setAvisos((prev) => prev.map((a) => (a.id === aviso.id ? { ...a, lida: true } : a)));
      } catch {
        // Avisa, mas segue para o link mesmo assim
        toast('Não foi possível marcar como lida', 'error');
      }
    }
    if (aviso.link) navigate(aviso.link);
  }

  async function remover(e, id) {
    e.stopPropagation();
    try {
      await api.delete(`/notificacoes/${id}`);
      setAvisos((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast('Erro ao remover', 'error');
    }
  }

  async function lerTodas() {
    try {
      await api.post('/notificacoes/ler-todas');
      setAvisos((prev) => prev.map((a) => ({ ...a, lida: true })));
      toast('Todas marcadas como lidas', 'success');
    } catch {
      toast('Erro ao marcar', 'error');
    }
  }

  const temNaoLidas = avisos.some((a) => !a.lida);

  if (carregando)
    return (
      <div className="px-4">
        <SkeletonLista qtd={4} />
      </div>
    );
  if (avisos.length === 0) {
    return (
      <EstadoVazio mensagem="Nenhum aviso" sub="Alertas de estoque e resumos aparecerão aqui" />
    );
  }

  return (
    <div className="px-4 flex flex-col gap-3">
      {temNaoLidas && (
        <button
          onClick={lerTodas}
          className="self-end flex items-center gap-1.5 text-xs font-semibold text-accent-300 hover:text-accent-400 transition-colors"
        >
          <CheckCheck size={14} /> Marcar todas como lidas
        </button>
      )}
      {avisos.map((a) => {
        const cfg = TIPOS[a.tipo] ?? TIPOS.sistema;
        const Icon = cfg.icon;
        return (
          <div
            key={a.id}
            onClick={() => abrir(a)}
            className={`card flex items-start gap-3 cursor-pointer active:scale-[0.99] transition-transform ${a.lida ? 'opacity-60' : ''}`}
          >
            <div
              className={`w-10 h-10 rounded-md border border-dark-600 flex items-center justify-center shrink-0 ${cfg.bg}`}
            >
              <Icon size={19} className={cfg.cor} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white text-sm truncate">{a.titulo}</p>
                {!a.lida && (
                  <span className="w-2 h-2 rounded-full bg-accent-400 shrink-0 animate-pulse-glow" />
                )}
              </div>
              <p className="text-muted text-xs mt-0.5 leading-snug">{a.mensagem}</p>
              <p className="text-muted text-[10px] mt-1">{formatarData(a.criadoEm)}</p>
            </div>
            <button
              onClick={(e) => remover(e, a.id)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-danger transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AbaPreferencias() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(null);
  const [salvando, setSalvando] = useState(null);

  const [erroPrefs, setErroPrefs] = useState(false);

  const carregarPrefs = useCallback(() => {
    setErroPrefs(false);
    api
      .get('/me/notificacoes')
      .then(({ data }) => setPrefs(data))
      // Antes só disparava um toast (some em 3,5s) e `prefs` ficava null para sempre:
      // a aba virava um skeleton permanente, sem erro visível nem forma de tentar de novo.
      .catch(() => setErroPrefs(true));
  }, []);

  useEffect(() => {
    carregarPrefs();
  }, [carregarPrefs]);

  async function alternar(chave) {
    const novo = { ...prefs, [chave]: !prefs[chave] };
    setPrefs(novo); // otimista
    setSalvando(chave);
    try {
      await api.patch('/me/notificacoes', { [chave]: novo[chave] });
    } catch {
      setPrefs((p) => ({ ...p, [chave]: !novo[chave] })); // reverte
      toast('Erro ao salvar', 'error');
    } finally {
      setSalvando(null);
    }
  }

  if (erroPrefs)
    return (
      <div className="px-4">
        <div role="alert" className="card border border-red-500/40 bg-red-500/10 text-sm">
          <p className="text-red-200">Não foi possível carregar suas preferências.</p>
          <button type="button" onClick={carregarPrefs} className="btn-secondary mt-3">
            Tentar de novo
          </button>
        </div>
      </div>
    );

  if (!prefs)
    return (
      <div className="px-4">
        <SkeletonLista qtd={4} />
      </div>
    );

  return (
    <div className="px-4 flex flex-col gap-3">
      <p className="text-muted text-xs px-1">Escolha quais avisos você quer receber.</p>
      {PREFERENCIAS.map(({ chave, titulo, sub, icon: Icon, cor, bg }) => (
        <div key={chave} className="card flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-md border border-dark-600 flex items-center justify-center shrink-0 ${bg}`}
          >
            <Icon size={19} className={cor} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm">{titulo}</p>
            <p className="text-muted text-xs mt-0.5">{sub}</p>
          </div>
          <Toggle
            ativo={!!prefs[chave]}
            onChange={() => alternar(chave)}
            disabled={salvando === chave}
          />
        </div>
      ))}
    </div>
  );
}

export default function Notificacoes() {
  const [aba, setAba] = useState('avisos');

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Notificações" />

      {/* Abas */}
      <div className="px-4 pt-3 pb-4 flex gap-2">
        {[
          { id: 'avisos', label: 'Avisos', icon: Bell },
          { id: 'prefs', label: 'Preferências', icon: Check },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
              aba === id
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {aba === 'avisos' ? <AbaAvisos /> : <AbaPreferencias />}
      </div>
    </div>
  );
}
