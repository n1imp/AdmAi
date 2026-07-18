import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  SlidersHorizontal,
  MapPin,
  Calendar,
  User,
  Phone,
  Trash2,
  Maximize2,
  ArrowLeft,
} from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import {
  Overlay,
  Field,
  Button,
  Surface,
  Row,
  PageHeader,
  FeedbackState,
} from '../components/ui/index.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import { useToast } from '../components/Toast.jsx';

const LOCAIS = ['Todos', 'Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

// L4: linha confortável, sem card por linha. Cada linha é um disparador de diálogo
// (aria-haspopup="dialog") que abre o drawer com o resumo do serviço.
function LinhaServico({ servico, onAbrir }) {
  return (
    <Row
      onClick={() => onAbrir(servico.id)}
      aria-haspopup="dialog"
      aria-label={`Abrir serviço de ${servico.tecnico?.nome ?? 'técnico'}, ${servico.local}, ${formatarMoeda(
        servico.valorLiquido
      )} líquido`}
      className="last:!border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-white text-sm truncate">
            {servico.tecnico?.nome ?? 'Sem técnico'}
          </span>
          <span className="badge bg-dark-700 text-muted border border-dark-600 shrink-0">
            {servico.local}
          </span>
          {servico.status && servico.status !== 'aprovado' && (
            <span className="badge bg-warning/15 text-warning border border-warning/30 shrink-0 capitalize">
              {servico.status}
            </span>
          )}
        </div>
        <p className="text-muted text-xs truncate">{servico.descricao}</p>
        <p className="text-[11px] text-dark-500 mt-0.5 flex items-center gap-1 tnum">
          <Calendar size={11} /> {formatarData(servico.criadoEm)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-display font-bold text-accent-300 text-lg leading-none tnum">
          {formatarMoeda(servico.valorLiquido)}
        </p>
        <p className="text-muted text-[11px] mt-0.5">líquido</p>
      </div>
    </Row>
  );
}

function ValorBox({ rotulo, valor, destaque = false }) {
  return (
    <div
      className={`rounded-md p-2 text-center border ${
        destaque ? 'bg-accent-400/10 border-accent-400/20' : 'bg-dark-700 border-dark-600'
      }`}
    >
      <p className={`kpi-label text-[10px] ${destaque ? 'text-accent-300' : ''}`}>{rotulo}</p>
      <p
        className={`font-display font-bold text-base tnum ${destaque ? 'text-accent-300' : 'text-white'}`}
      >
        {formatarMoeda(valor)}
      </p>
    </div>
  );
}

// Conteúdo do Overlay. O mesmo componente serve o drawer (resumo) e a variante
// tela-cheia (detalhe): a diferença é `modoDetalhe`, que revela os campos extras
// e troca "Expandir" por "Voltar".
function DetalheServico({ servico, modoDetalhe, onExpandir, onRecolher, onDeletar }) {
  const [confirmando, setConfirmando] = useState(false);

  if (!servico) {
    return (
      <FeedbackState
        state="empty"
        title="Serviço indisponível"
        description="Este serviço não está na página atual da lista. Feche o painel e use “Carregar mais” para encontrá-lo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 text-white">
      <div className="flex items-center gap-2">
        {modoDetalhe ? (
          <Button variant="ghost" size="small" onClick={onRecolher}>
            <ArrowLeft size={16} /> Voltar
          </Button>
        ) : (
          <Button variant="secondary" size="small" onClick={onExpandir}>
            <Maximize2 size={16} /> Expandir
          </Button>
        )}
        <span className="badge bg-dark-700 text-muted border border-dark-600 ml-auto">
          {servico.local}
        </span>
      </div>

      <div>
        <p className="section-label mb-1">TÉCNICO</p>
        <p className="text-white font-semibold">{servico.tecnico?.nome ?? 'Não informado'}</p>
        <p className="text-muted text-xs mt-1 flex items-center gap-1 tnum">
          <Calendar size={12} /> {formatarData(servico.criadoEm)}
        </p>
      </div>

      {servico.descricao && (
        <div>
          <p className="section-label mb-1">DESCRIÇÃO</p>
          <p className="text-muted text-sm">{servico.descricao}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <ValorBox rotulo="Cobrado" valor={servico.valorCobrado} />
        <ValorBox rotulo="Material" valor={servico.valorMaterial} />
        <ValorBox rotulo="Líquido" valor={servico.valorLiquido} destaque />
      </div>

      {modoDetalhe && (
        <div className="flex flex-col gap-3 border-t border-dark-600 pt-3">
          {servico.endereco && (
            <div className="flex gap-2 text-sm">
              <MapPin size={15} className="text-muted shrink-0 mt-0.5" />
              <p className="text-muted">{servico.endereco}</p>
            </div>
          )}
          {(servico.clienteNome || servico.clienteTelefone) && (
            <div className="flex items-center gap-2 rounded-md bg-dark-700 border border-dark-600 px-3 py-2">
              <User size={15} className="text-accent-300 shrink-0" />
              <span className="text-sm text-white font-medium truncate">
                {servico.clienteNome ?? 'Cliente'}
              </span>
              {servico.clienteTelefone && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted tnum">
                  <Phone size={12} /> {servico.clienteTelefone}
                </span>
              )}
            </div>
          )}
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
                className="w-full max-h-60 object-cover rounded-md border border-dark-600"
              />
            </a>
          )}
          <p className="text-xs text-muted">ID #{servico.id}</p>
        </div>
      )}

      {!confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="flex items-center gap-1.5 text-danger text-sm hover:text-red-300 self-start"
        >
          <Trash2 size={15} /> Remover serviço
        </button>
      ) : (
        <div className="flex items-center gap-3 border-t border-dark-600 pt-3">
          <p className="text-danger text-sm flex-1">Confirmar remoção?</p>
          <Button variant="danger" size="small" onClick={() => onDeletar(servico.id)}>
            Sim, remover
          </Button>
          <Button variant="ghost" size="small" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Servicos() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [servicos, setServicos] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState(null);

  const [filtroLocal, setFiltroLocal] = useState('Todos');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroEndereco, setFiltroEndereco] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const buscaRef = useRef(null);

  // DT4: o estado do detalhe vive na URL (sem novas rotas). A lista nunca é
  // desmontada, então filtros e posição de scroll são preservados.
  const servicoParam = searchParams.get('servico');
  const modoDetalhe = searchParams.get('detalhe') === '1';
  const servicoSelecionado = useMemo(
    () => servicos.find((s) => String(s.id) === servicoParam) ?? null,
    [servicos, servicoParam]
  );

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
    return () => {
      active = false;
    };
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
      return true;
    } catch {
      toast('Erro ao remover serviço', 'error');
      return false;
    }
  }

  function recarregar() {
    setErro(null);
    setCarregando(true);
    buscar(null, false);
  }

  // DT4: transições sempre com push, para o "Voltar" do navegador reverter
  // lista ← drawer ← página.
  function abrirServico(id) {
    setSearchParams({ servico: String(id) });
  }
  function expandirServico() {
    if (servicoParam) setSearchParams({ servico: servicoParam, detalhe: '1' });
  }
  function recolherServico() {
    if (servicoParam) setSearchParams({ servico: servicoParam });
  }
  function fecharServico() {
    setSearchParams({});
  }
  async function removerEFechar(id) {
    if (await deletarServico(id)) fecharServico();
  }

  // FI4: Escape dentro do painel de filtros recolhe e devolve o foco à busca.
  function onFiltrosKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setFiltrosAbertos(false);
      buscaRef.current?.focus();
    }
  }

  const filtrosAtivos = (filtroLocal !== 'Todos' ? 1 : 0) + (filtroEndereco.trim() ? 1 : 0);
  const temMais = servicos.length < total;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="REGISTROS"
        title="Serviços"
        subtitle={total > 0 ? `${total} registro${total !== 1 ? 's' : ''}` : 'Nenhum registro'}
        actions={
          <Button variant="primary" size="small" onClick={() => navigate('/servicos/novo')}>
            <Plus size={18} /> Novo serviço
          </Button>
        }
      />

      {/* FI4: busca sempre visível + painel de filtros avançados recolhível */}
      <div className="px-4 flex flex-col gap-2">
        <Field
          ref={buscaRef}
          type="search"
          label="Buscar por técnico"
          value={filtroTecnico}
          onChange={(e) => setFiltroTecnico(e.target.value)}
          placeholder="Nome do técnico…"
        />
        <div>
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            aria-controls="servicos-filtros-avancados"
            className="inline-flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
          >
            <SlidersHorizontal size={15} />
            Filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ''}
          </button>
        </div>
        <div
          id="servicos-filtros-avancados"
          hidden={!filtrosAbertos}
          onKeyDown={onFiltrosKeyDown}
          className="flex flex-col gap-3 pt-1"
        >
          <Field
            type="search"
            label="Endereço"
            value={filtroEndereco}
            onChange={(e) => setFiltroEndereco(e.target.value)}
            placeholder="Buscar por endereço…"
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="kpi-label mb-1">Local</legend>
            <div className="flex gap-2 flex-wrap">
              {LOCAIS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={filtroLocal === l}
                  onClick={() => setFiltroLocal(l)}
                  className={`px-3 py-1.5 rounded-md text-xs font-display font-semibold uppercase tracking-wide transition-all ${
                    filtroLocal === l
                      ? 'bg-accent-400 text-dark-950'
                      : 'bg-dark-700 text-muted border border-dark-600 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-3">
        {erro ? (
          <FeedbackState
            state="error"
            announce
            title="Não foi possível carregar os serviços."
            action={
              <Button variant="secondary" size="small" onClick={recarregar}>
                Tentar novamente
              </Button>
            }
          />
        ) : carregando ? (
          <SkeletonLista qtd={6} />
        ) : servicos.length === 0 ? (
          <FeedbackState
            state="empty"
            title="Nenhum serviço encontrado"
            description="Tente ajustar os filtros ou registre um novo serviço."
            action={
              <Button variant="primary" size="small" onClick={() => navigate('/servicos/novo')}>
                Registrar serviço
              </Button>
            }
          />
        ) : (
          <>
            <Surface className="overflow-hidden">
              {servicos.map((s) => (
                <LinhaServico key={s.id} servico={s} onAbrir={abrirServico} />
              ))}
            </Surface>

            {temMais && (
              <Button
                variant="ghost"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="w-full"
              >
                {carregandoMais ? 'Carregando...' : 'Carregar mais'}
              </Button>
            )}
          </>
        )}
      </div>

      {/* DT4 + O-02: mesmo Overlay para drawer e detalhe tela-cheia (só muda a
          className/variante). O Overlay restaura o foco à linha de origem. */}
      <Overlay
        open={Boolean(servicoParam)}
        onClose={modoDetalhe ? recolherServico : fecharServico}
        initialFocus="dialog"
        showCloseButton={!modoDetalhe}
        variant={modoDetalhe ? 'fullscreen' : undefined}
        title={
          servicoSelecionado
            ? `Serviço de ${servicoSelecionado.tecnico?.nome ?? 'técnico'}`
            : 'Serviço'
        }
      >
        <DetalheServico
          servico={servicoSelecionado}
          modoDetalhe={modoDetalhe}
          onExpandir={expandirServico}
          onRecolher={recolherServico}
          onDeletar={removerEFechar}
        />
      </Overlay>
    </div>
  );
}
