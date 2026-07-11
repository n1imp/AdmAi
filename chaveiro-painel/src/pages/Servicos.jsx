import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronUp, Trash2, MapPin, Calendar, User, Phone } from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

const LOCAIS = ['Todos', 'Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

function CardServico({ servico, onDeletar }) {
  const [expandido, setExpandido] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="card animate-fade-in">
      {/* Linha principal — sempre visível */}
      <button className="w-full text-left" onClick={() => setExpandido(!expandido)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-white text-sm truncate">{servico.tecnico.nome}</span>
              <span className="badge bg-dark-700 text-muted border border-dark-600">
                {servico.local}
              </span>
            </div>
            <p className="text-muted text-xs truncate">{servico.descricao}</p>
            <p className="text-xs text-dark-600 mt-0.5 flex items-center gap-1">
              <Calendar size={11} />
              {formatarData(servico.criadoEm)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-display font-bold text-accent-300 text-xl leading-none tnum">
              {formatarMoeda(servico.valorLiquido)}
            </p>
            <p className="text-muted text-xs mt-0.5">líquido</p>
          </div>
        </div>
        <div className="flex justify-end mt-1">
          {expandido ? (
            <ChevronUp size={16} className="text-muted" />
          ) : (
            <ChevronDown size={16} className="text-muted" />
          )}
        </div>
      </button>

      {/* Detalhes expandidos */}
      {expandido && (
        <div className="border-t border-dark-600 mt-3 pt-3 space-y-2 animate-fade-in">
          {servico.endereco && (
            <div className="flex gap-2 text-sm">
              <MapPin size={14} className="text-muted shrink-0 mt-0.5" />
              <p className="text-muted">{servico.endereco}</p>
            </div>
          )}

          {/* Cliente atendido (Fase 3) */}
          {(servico.clienteNome || servico.clienteTelefone) && (
            <div className="flex items-center gap-2 rounded-md bg-dark-700 border border-dark-600 px-3 py-2">
              <User size={14} className="text-accent-300 shrink-0" />
              <span className="text-sm text-white font-medium truncate">{servico.clienteNome ?? 'Cliente'}</span>
              {servico.clienteTelefone && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted tnum">
                  <Phone size={11} /> {servico.clienteTelefone}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
              <p className="kpi-label text-[10px]">Cobrado</p>
              <p className="font-display font-bold text-white text-base tnum">{formatarMoeda(servico.valorCobrado)}</p>
            </div>
            <div className="bg-dark-700 border border-dark-600 rounded-md p-2 text-center">
              <p className="kpi-label text-[10px]">Material</p>
              <p className="font-display font-bold text-white text-base tnum">{formatarMoeda(servico.valorMaterial)}</p>
            </div>
            <div className="bg-accent-400/10 rounded-md p-2 text-center border border-accent-400/20">
              <p className="kpi-label text-[10px] text-accent-300">Líquido</p>
              <p className="font-display font-bold text-accent-300 text-base tnum">{formatarMoeda(servico.valorLiquido)}</p>
            </div>
          </div>

          {servico.material && (
            <p className="text-xs text-muted">
              <span className="text-white font-medium">Material:</span> {servico.material}
            </p>
          )}

          {servico.fotoEvidencia && (
            <a
              href={servico.fotoEvidencia}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <img
                src={servico.fotoEvidencia}
                alt="Foto de evidência do serviço"
                loading="lazy"
                className="w-full max-h-48 object-cover rounded-md border border-dark-600"
              />
              <span className="text-[10px] text-muted mt-1 inline-block">📷 Foto de evidência (toque para ampliar)</span>
            </a>
          )}

          <p className="text-xs text-muted">ID #{servico.id}</p>

          {/* Botão deletar */}
          {!confirmando ? (
            <button
              onClick={() => setConfirmando(true)}
              className="flex items-center gap-1.5 text-danger text-xs mt-2 hover:text-red-300"
            >
              <Trash2 size={14} />
              Remover serviço
            </button>
          ) : (
            <div className="flex items-center gap-3 mt-2">
              <p className="text-danger text-xs flex-1">Confirmar remoção?</p>
              <button
                onClick={() => onDeletar(servico.id)}
                className="text-xs font-semibold text-danger hover:text-red-300"
              >
                Sim, remover
              </button>
              <button
                onClick={() => setConfirmando(false)}
                className="text-xs text-muted hover:text-white"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Servicos() {
  const navigate = useNavigate();
  const toast = useToast();

  const [servicos, setServicos] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(null);

  const [filtroLocal, setFiltroLocal] = useState('Todos');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroEndereco, setFiltroEndereco] = useState('');

  const buscar = useCallback(
    // `guard` permite cancelar os setState após desmontar/refazer o efeito.
    async (cursorParam = null, acumular = false, guard) => {
      const estaAtivo = typeof guard === 'function' ? guard : () => true;
      const params = new URLSearchParams({ limit: '15' });
      if (cursorParam) params.set('cursor', cursorParam);
      if (filtroLocal !== 'Todos') params.set('local', filtroLocal);
      if (filtroTecnico.trim()) params.set('tecnico', filtroTecnico.trim());
      if (filtroEndereco.trim()) params.set('endereco', filtroEndereco.trim());

      try {
        const { data } = await api.get(`/servicos?${params}`);
        if (!estaAtivo()) return;
        setTotal(data.total);
        setServicos((prev) => (acumular ? [...prev, ...data.data] : data.data));
        setCursor(data.nextCursor ?? null);
        setErro(null);
      } catch {
        if (estaAtivo()) setErro('Não foi possível carregar os serviços.');
      } finally {
        if (estaAtivo()) {
          setCarregando(false);
          setCarregandoMais(false);
        }
      }
    },
    [filtroLocal, filtroTecnico, filtroEndereco]
  );

  useEffect(() => {
    let active = true;
    setCarregando(true);
    setCursor(null);
    buscar(null, false, () => active);
    return () => { active = false; };
  }, [buscar]);

  async function carregarMais() {
    if (!cursor) return;
    setCarregandoMais(true);
    await buscar(cursor, true);
  }

  async function deletarServico(id) {
    try {
      await api.delete(`/servicos/${id}`);
      setServicos((prev) => prev.filter((s) => s.id !== id));
      setTotal((t) => t - 1);
      toast('Serviço removido com sucesso', 'success');
    } catch {
      toast('Erro ao remover serviço', 'error');
    }
  }

  const temMais = servicos.length < total;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> REGISTROS</p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Serviços</h1>
          <p className="text-muted text-xs mt-0.5 tnum">
            {total > 0 ? `${total} registro${total !== 1 ? 's' : ''}` : 'Nenhum registro'}
          </p>
        </div>
        <button
          onClick={() => navigate('/servicos/novo')}
          aria-label="Novo serviço"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-accent-400 text-dark-950 font-display font-semibold uppercase tracking-wider text-sm shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)] hover:bg-accent-300 transition-colors"
        >
          <Plus size={18} /> <span className="hidden sm:inline">Novo</span>
        </button>
      </div>

      {/* Filtros por técnico e endereço */}
      <div className="px-4 mb-3 flex flex-col gap-2">
        <input
          type="text"
          placeholder="Filtrar por técnico..."
          value={filtroTecnico}
          onChange={(e) => setFiltroTecnico(e.target.value)}
          className="input py-2 text-sm"
        />
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por endereço..."
            value={filtroEndereco}
            onChange={(e) => setFiltroEndereco(e.target.value)}
            className="input py-2 text-sm pl-9"
          />
        </div>
      </div>

      {/* Chips de local */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-2 mb-1 scrollbar-hide">
        {LOCAIS.map((l) => (
          <button
            key={l}
            onClick={() => setFiltroLocal(l)}
            className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
              filtroLocal === l
                ? 'bg-accent-400 text-dark-950'
                : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={() => buscar(1)} />}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-3">
        {carregando ? (
          <SkeletonLista qtd={6} />
        ) : servicos.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhum serviço encontrado"
            sub="Tente ajustar os filtros ou registre um novo serviço"
            cta={{ label: 'Registrar serviço', to: '/servicos/novo' }}
          />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {servicos.map((s) => (
                <CardServico key={s.id} servico={s} onDeletar={deletarServico} />
              ))}
            </div>

            {temMais && (
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="btn-ghost w-full"
              >
                {carregandoMais ? 'Carregando...' : 'Carregar mais'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
