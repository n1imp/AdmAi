import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Pencil, Trash2, ImageOff, Upload,
  History, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal,
} from 'lucide-react';
import api, { formatarMoeda, formatarData } from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';

const UNIDADES = ['un', 'm', 'kg', 'l'];

// Lê um File como data URL base64 (para enviar ao endpoint de upload)
function lerArquivoComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ModalMaterial({ material, onClose, onSalvo }) {
  const toast = useToast();
  const editando = !!material?.id;
  const [nome, setNome] = useState(material?.nome ?? '');
  const [descricao, setDescricao] = useState(material?.descricao ?? '');
  const [imagemUrl, setImagemUrl] = useState(material?.imagemUrl ?? '');
  const [unidade, setUnidade] = useState(material?.unidade ?? 'un');
  const [preco, setPreco] = useState(material?.precoUnit != null ? String(material.precoUnit) : '');
  const [precoVenda, setPrecoVenda] = useState(material?.precoVenda != null ? String(material.precoVenda) : '');
  const [minimo, setMinimo] = useState(material?.estoqueMinimo != null ? String(material.estoqueMinimo) : '');
  const [salvando, setSalvando] = useState(false);
  const [enviandoImg, setEnviandoImg] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  async function enviarImagem(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Selecione um arquivo de imagem', 'warning'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('Imagem muito grande (máx. 5MB)', 'warning'); return; }
    setEnviandoImg(true);
    try {
      const dataUrl = await lerArquivoComoDataURL(file);
      const { data } = await api.post('/materiais/upload', { imagem: dataUrl });
      setImagemUrl(data.url);
      toast('Imagem enviada', 'success');
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao enviar imagem', 'error');
    } finally {
      setEnviandoImg(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    const body = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      imagemUrl: imagemUrl.trim() || null,
      unidade,
      precoUnit: preco !== '' ? parseFloat(preco) : null,
      precoVenda: precoVenda !== '' ? parseFloat(precoVenda) : null,
      estoqueMinimo: minimo !== '' ? parseFloat(minimo) : null,
    };
    try {
      if (editando) {
        await api.patch(`/materiais/${material.id}`, body);
        toast('Material atualizado', 'success');
      } else {
        await api.post('/materiais', body);
        toast('Material criado', 'success');
      }
      onSalvo();
      onClose();
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-dark-800 border border-dark-600 rounded-lg p-6 shadow-panel animate-slide-up max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-white uppercase tracking-wide">
            {editando ? 'Editar material' : 'Novo material'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div>
            <label className="kpi-label block mb-2">Nome *</label>
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Fechadura Tetra" autoFocus />
          </div>

          <div>
            <label className="kpi-label block mb-2">Descrição</label>
            <textarea
              className="input min-h-[64px] resize-none"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes do produto (opcional)"
            />
          </div>

          <div>
            <label className="kpi-label block mb-2">Imagem do produto</label>
            <div className="flex items-center gap-3">
              {imagemUrl ? (
                <img
                  src={imagemUrl}
                  alt="Prévia"
                  className="w-16 h-16 rounded-md object-cover border border-dark-600 bg-dark-700 shrink-0"
                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
                  <ImageOff size={20} className="text-muted" />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={enviarImagem} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={enviandoImg}
                  className="btn-ghost flex items-center justify-center gap-2 py-2 text-sm"
                >
                  <Upload size={15} />
                  {enviandoImg ? 'Enviando…' : (imagemUrl ? 'Trocar imagem' : 'Enviar imagem')}
                </button>
                {imagemUrl && (
                  <button
                    type="button"
                    onClick={() => setImagemUrl('')}
                    className="text-xs text-danger hover:text-red-300"
                  >
                    Remover imagem
                  </button>
                )}
              </div>
            </div>
            {/* Alternativa: colar URL externa */}
            <input
              className="input mt-2 text-xs"
              value={imagemUrl}
              onChange={(e) => setImagemUrl(e.target.value)}
              placeholder="ou cole uma URL https://…"
              inputMode="url"
            />
          </div>

          <div>
            <label className="kpi-label block mb-2">Unidade</label>
            <div className="flex gap-2">
              {UNIDADES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors border ${
                    unidade === u
                      ? 'bg-accent-400 text-dark-950 border-accent-400'
                      : 'bg-dark-700 text-muted border-dark-600 hover:text-white'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="kpi-label block mb-2">Custo (R$)</label>
              <input
                className="input" type="number" min="0" step="0.01"
                value={preco} onChange={(e) => setPreco(e.target.value)}
                placeholder="0,00" inputMode="decimal"
              />
            </div>
            <div>
              <label className="kpi-label block mb-2">Venda (R$)</label>
              <input
                className="input" type="number" min="0" step="0.01"
                value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)}
                placeholder="0,00" inputMode="decimal"
              />
            </div>
          </div>

          <div>
            <label className="kpi-label block mb-2">Estoque mínimo (alerta)</label>
            <input
              className="input" type="number" min="0" step="0.01"
              value={minimo} onChange={(e) => setMinimo(e.target.value)}
              placeholder="Sem alerta" inputMode="decimal"
            />
          </div>

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={salvando || !nome.trim()} className="btn-primary flex-1">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Configuração visual/semântica de cada tipo de movimentação
const MOVIMENTOS = {
  entrada: { titulo: 'Adicionar ao estoque', label: 'Quantidade a adicionar', verbo: 'Adicionar', verboGer: 'Adicionando…', cor: 'success' },
  saida:   { titulo: 'Dar saída do estoque', label: 'Quantidade a retirar', verbo: 'Dar saída', verboGer: 'Retirando…', cor: 'danger' },
  ajuste:  { titulo: 'Ajustar saldo', label: 'Saldo correto (substitui o atual)', verbo: 'Ajustar', verboGer: 'Ajustando…', cor: 'amber' },
};

// Modal de movimentação de estoque — entrada, saída ou ajuste
function ModalMovimentacao({ material, tipo, onClose, onSalvo }) {
  const toast = useToast();
  const cfg = MOVIMENTOS[tipo];
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // No ajuste, o técnico informa o saldo desejado; convertemos em entrada/saída.
  function calcularPayload(qtd) {
    if (tipo !== 'ajuste') return { tipo, quantidade: qtd, observacao: observacao.trim() || undefined };
    const atual = material.quantidadeAtual ?? 0;
    const delta = qtd - atual;
    if (delta === 0) return null;
    return {
      tipo: delta > 0 ? 'entrada' : 'saida',
      quantidade: Math.abs(delta),
      observacao: observacao.trim() ? `Ajuste: ${observacao.trim()}` : 'Ajuste manual de saldo',
    };
  }

  async function salvar(e) {
    e.preventDefault();
    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd < 0) return;
    const payload = calcularPayload(qtd);
    if (!payload) { toast('O saldo informado é igual ao atual', 'warning'); return; }
    setSalvando(true);
    try {
      await api.post(`/materiais/${material.id}/movimentacao`, payload);
      toast('Estoque atualizado', 'success');
      onSalvo();
      onClose();
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao movimentar estoque', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded-lg p-6 shadow-panel animate-slide-up">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-bold text-white">{cfg.titulo}</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <p className="text-muted text-sm mb-5">
          {material.nome} · saldo atual <span className="text-white font-medium">{material.quantidadeAtual ?? 0} {material.unidade}</span>
        </p>

        <form onSubmit={salvar} className="flex flex-col gap-4">
          <div>
            <label className="kpi-label block mb-2">{cfg.label} ({material.unidade})</label>
            <input
              className="input" type="number" min="0" step="0.01"
              value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0" inputMode="decimal" autoFocus
            />
          </div>
          <div>
            <label className="kpi-label block mb-2">Observação (opcional)</label>
            <input
              className="input" value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={tipo === 'saida' ? 'Ex: perda, quebra' : 'Ex: compra, contagem'}
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={salvando || quantidade === ''} className="btn-primary flex-1">
              {salvando ? cfg.verboGer : cfg.verbo}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal de histórico de movimentações de um material
function ModalHistorico({ material, onClose }) {
  const [movs, setMovs] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    api.get(`/materiais/${material.id}/movimentacoes`)
      .then(({ data }) => setMovs(data))
      .catch(() => setErro(true));
  }, [material.id]);

  const ICONE = {
    entrada: { Icon: ArrowDownCircle, cor: 'text-success', sinal: '+' },
    saida:   { Icon: ArrowUpCircle, cor: 'text-danger', sinal: '−' },
    ajuste:  { Icon: SlidersHorizontal, cor: 'text-accent-300', sinal: '' },
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-dark-800 border border-dark-600 rounded-lg p-6 shadow-panel animate-slide-up max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-bold text-white">Movimentações</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <p className="text-muted text-sm mb-4">{material.nome}</p>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {erro ? (
            <p className="text-danger text-sm py-6 text-center">Erro ao carregar histórico.</p>
          ) : movs === null ? (
            <SkeletonLista qtd={4} />
          ) : movs.length === 0 ? (
            <EstadoVazio mensagem="Sem movimentações" sub="As entradas e saídas aparecerão aqui" />
          ) : (
            <div className="flex flex-col gap-2">
              {movs.map((m) => {
                const { Icon, cor, sinal } = ICONE[m.tipo] ?? ICONE.ajuste;
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2 border-b border-dark-700 last:border-0">
                    <Icon size={18} className={`${cor} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium capitalize">
                        {m.tipo}
                        {m.origem && m.origem !== 'manual' && (
                          <span className="text-muted font-normal"> · {m.origem}</span>
                        )}
                      </p>
                      <p className="text-muted text-xs">{formatarData(m.criadoEm)}</p>
                      {m.observacao && <p className="text-muted text-xs italic truncate">{m.observacao}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-display font-bold text-sm ${cor}`}>{sinal}{m.quantidade}</p>
                      <p className="text-muted text-[10px]">saldo {m.saldoApos}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalConfirmarDelete({ material, onClose, onConfirmar }) {
  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-dark-800 border border-dark-600 rounded-lg p-6 shadow-panel animate-slide-up">
        <h2 className="font-display text-lg font-bold text-white mb-2">Remover material?</h2>
        <p className="text-muted text-sm mb-6">
          <span className="text-white font-medium">{material.nome}</span> será removido permanentemente.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={onConfirmar}
            className="btn-danger flex-1 py-3"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

function Miniatura({ url, nome }) {
  if (!url) {
    return (
      <div className="w-12 h-12 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
        <ImageOff size={18} className="text-muted" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={nome}
      className="w-12 h-12 rounded-md object-cover border border-dark-600 shrink-0 bg-dark-700"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function Catalogo() {
  const toast = useToast();
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null); // { tipo: 'form'|'delete'|'entrada', material }

  const buscar = useCallback(async () => {
    setErro(null);
    try {
      const { data } = await api.get('/materiais');
      setMateriais(data);
    } catch {
      setErro('Não foi possível carregar os materiais.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { buscar(); }, [buscar]);

  async function confirmarDelete(material) {
    try {
      await api.delete(`/materiais/${material.id}`);
      toast('Material removido', 'success');
      buscar();
    } catch (err) {
      toast(err.response?.data?.erro ?? 'Erro ao remover', 'error');
    } finally {
      setModal(null);
    }
  }

  const filtrados = materiais.filter((m) =>
    m.nome.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Materiais" para="/" />

      <div className="px-4 pt-3 pb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input pl-9 pr-4"
            placeholder="Buscar material…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="flex-1 overflow-y-auto px-4 pb-24 grid gap-3 lg:grid-cols-2 xl:grid-cols-3 content-start">
        {carregando ? (
          <div className="lg:col-span-2 xl:col-span-3"><SkeletonLista qtd={5} /></div>
        ) : filtrados.length === 0 ? (
          <div className="lg:col-span-2 xl:col-span-3">
            <EstadoVazio
              mensagem={busca ? 'Nenhum material encontrado' : 'Nenhum material cadastrado'}
              sub={busca ? 'Tente outro termo de busca' : 'Toque em + para adicionar o primeiro material'}
            />
          </div>
        ) : (
          filtrados.map((m) => (
            <div key={m.id} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Miniatura url={m.imagemUrl} nome={m.nome} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{m.nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">{m.unidade}</span>
                    {m.precoVenda != null && (
                      <span className="text-xs text-accent-300 tnum">{formatarMoeda(m.precoVenda)}</span>
                    )}
                    <span className={`text-xs ${m.estoqueMinimo != null && m.quantidadeAtual <= m.estoqueMinimo ? 'text-danger' : 'text-muted'}`}>
                      saldo {m.quantidadeAtual ?? 0}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setModal({ tipo: 'form', material: m })}
                    className="w-9 h-9 rounded-md flex items-center justify-center bg-dark-700 border border-dark-600 text-muted hover:text-accent-300 hover:border-dark-500 transition-colors"
                    title="Editar material"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setModal({ tipo: 'delete', material: m })}
                    className="w-9 h-9 rounded-md flex items-center justify-center bg-dark-700 border border-dark-600 text-muted hover:text-danger hover:border-dark-500 transition-colors"
                    title="Remover material"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Ações de estoque */}
              <div className="flex gap-2 border-t border-dark-700 pt-2.5">
                <button
                  onClick={() => setModal({ tipo: 'entrada', material: m })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-dark-700 text-success text-xs font-medium hover:bg-dark-600 transition-colors"
                  title="Entrada"
                >
                  <ArrowDownCircle size={14} /> Entrada
                </button>
                <button
                  onClick={() => setModal({ tipo: 'saida', material: m })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-dark-700 text-danger text-xs font-medium hover:bg-dark-600 transition-colors"
                  title="Saída"
                >
                  <ArrowUpCircle size={14} /> Saída
                </button>
                <button
                  onClick={() => setModal({ tipo: 'ajuste', material: m })}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-dark-700 text-accent-300 text-xs font-medium hover:bg-dark-600 transition-colors"
                  title="Ajustar saldo"
                >
                  <SlidersHorizontal size={14} /> Ajuste
                </button>
                <button
                  onClick={() => setModal({ tipo: 'historico', material: m })}
                  className="w-9 flex items-center justify-center py-1.5 rounded-lg bg-dark-700 text-muted hover:text-white hover:bg-dark-600 transition-colors"
                  title="Histórico de movimentações"
                >
                  <History size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setModal({ tipo: 'form', material: null })}
        aria-label="Novo material"
        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 w-14 h-14 rounded-lg bg-accent-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(34,211,238,0.6)] text-dark-950 hover:bg-accent-300 transition-colors z-30 text-2xl font-light"
      >
        +
      </button>

      {modal?.tipo === 'form' && (
        <ModalMaterial material={modal.material} onClose={() => setModal(null)} onSalvo={buscar} />
      )}
      {['entrada', 'saida', 'ajuste'].includes(modal?.tipo) && (
        <ModalMovimentacao
          material={modal.material}
          tipo={modal.tipo}
          onClose={() => setModal(null)}
          onSalvo={buscar}
        />
      )}
      {modal?.tipo === 'historico' && (
        <ModalHistorico material={modal.material} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'delete' && (
        <ModalConfirmarDelete
          material={modal.material}
          onClose={() => setModal(null)}
          onConfirmar={() => confirmarDelete(modal.material)}
        />
      )}
    </div>
  );
}
