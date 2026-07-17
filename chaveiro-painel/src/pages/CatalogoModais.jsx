import { useState, useEffect, useRef } from 'react';
import { ImageOff, Upload, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal } from 'lucide-react';
import api, { formatarData } from '../lib/api.js';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import { Overlay } from '../components/ui/index.js';
import { useToast } from '../components/Toast.jsx';

// Modais de Materiais/Estoque extraídos de Catalogo.jsx (mantém a página < 500 linhas).
// Todos apoiados no primitive acessível Overlay.

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

export function ModalMaterial({ material, onClose, onSalvo }) {
  const toast = useToast();
  const editando = !!material?.id;
  const [nome, setNome] = useState(material?.nome ?? '');
  const [descricao, setDescricao] = useState(material?.descricao ?? '');
  const [imagemUrl, setImagemUrl] = useState(material?.imagemUrl ?? '');
  const [unidade, setUnidade] = useState(material?.unidade ?? 'un');
  const [preco, setPreco] = useState(material?.precoUnit != null ? String(material.precoUnit) : '');
  const [precoVenda, setPrecoVenda] = useState(
    material?.precoVenda != null ? String(material.precoVenda) : ''
  );
  const [minimo, setMinimo] = useState(
    material?.estoqueMinimo != null ? String(material.estoqueMinimo) : ''
  );
  const [salvando, setSalvando] = useState(false);
  const [enviandoImg, setEnviandoImg] = useState(false);
  const fileRef = useRef(null);

  async function enviarImagem(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Selecione um arquivo de imagem', 'warning');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Imagem muito grande (máx. 5MB)', 'warning');
      return;
    }
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
    <Overlay
      open
      onClose={onClose}
      title={editando ? 'Editar material' : 'Novo material'}
      size="sm"
    >
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div>
          <label className="kpi-label block mb-2">Nome *</label>
          <input
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Fechadura Tetra"
            autoFocus
          />
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
                onError={(e) => {
                  e.currentTarget.style.opacity = '0.3';
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
                <ImageOff size={20} className="text-muted" />
              </div>
            )}
            <div className="flex-1 flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={enviarImagem}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={enviandoImg}
                className="btn-ghost flex items-center justify-center gap-2 py-2 text-sm"
              >
                <Upload size={15} />
                {enviandoImg ? 'Enviando…' : imagemUrl ? 'Trocar imagem' : 'Enviar imagem'}
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
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="kpi-label block mb-2">Venda (R$)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={precoVenda}
              onChange={(e) => setPrecoVenda(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
            />
          </div>
        </div>

        <div>
          <label className="kpi-label block mb-2">Estoque mínimo (alerta)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            placeholder="Sem alerta"
            inputMode="decimal"
          />
        </div>

        <div className="flex gap-3 mt-1">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !nome.trim()} className="btn-primary flex-1">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// Configuração visual/semântica de cada tipo de movimentação
const MOVIMENTOS = {
  entrada: {
    titulo: 'Adicionar ao estoque',
    label: 'Quantidade a adicionar',
    verbo: 'Adicionar',
    verboGer: 'Adicionando…',
    cor: 'success',
  },
  saida: {
    titulo: 'Dar saída do estoque',
    label: 'Quantidade a retirar',
    verbo: 'Dar saída',
    verboGer: 'Retirando…',
    cor: 'danger',
  },
  ajuste: {
    titulo: 'Ajustar saldo',
    label: 'Saldo correto (substitui o atual)',
    verbo: 'Ajustar',
    verboGer: 'Ajustando…',
    cor: 'amber',
  },
};

// Modal de movimentação de estoque — entrada, saída ou ajuste
export function ModalMovimentacao({ material, tipo, onClose, onSalvo }) {
  const toast = useToast();
  const cfg = MOVIMENTOS[tipo];
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  // No ajuste, o técnico informa o saldo desejado; convertemos em entrada/saída.
  function calcularPayload(qtd) {
    if (tipo !== 'ajuste')
      return { tipo, quantidade: qtd, observacao: observacao.trim() || undefined };
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
    if (!payload) {
      toast('O saldo informado é igual ao atual', 'warning');
      return;
    }
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
    <Overlay open onClose={onClose} title={cfg.titulo} size="sm">
      <p className="text-muted text-sm mb-5">
        {material.nome} · saldo atual{' '}
        <span className="text-white font-medium">
          {material.quantidadeAtual ?? 0} {material.unidade}
        </span>
      </p>

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div>
          <label className="kpi-label block mb-2">
            {cfg.label} ({material.unidade})
          </label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            autoFocus
          />
        </div>
        <div>
          <label className="kpi-label block mb-2">Observação (opcional)</label>
          <input
            className="input"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={tipo === 'saida' ? 'Ex: perda, quebra' : 'Ex: compra, contagem'}
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || quantidade === ''}
            className="btn-primary flex-1"
          >
            {salvando ? cfg.verboGer : cfg.verbo}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// Modal de histórico de movimentações de um material
export function ModalHistorico({ material, onClose }) {
  const [movs, setMovs] = useState(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/materiais/${material.id}/movimentacoes`)
      .then(({ data }) => {
        if (active) setMovs(data);
      })
      .catch(() => {
        if (active) setErro(true);
      });
    return () => {
      active = false;
    };
  }, [material.id]);

  const ICONE = {
    entrada: { Icon: ArrowDownCircle, cor: 'text-success', sinal: '+' },
    saida: { Icon: ArrowUpCircle, cor: 'text-danger', sinal: '−' },
    ajuste: { Icon: SlidersHorizontal, cor: 'text-accent-300', sinal: '' },
  };

  return (
    <Overlay open onClose={onClose} title="Movimentações" description={material.nome} size="sm">
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
                <div
                  key={m.id}
                  className="flex items-center gap-3 py-2 border-b border-dark-700 last:border-0"
                >
                  <Icon size={18} className={`${cor} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium capitalize">
                      {m.tipo}
                      {m.origem && m.origem !== 'manual' && (
                        <span className="text-muted font-normal"> · {m.origem}</span>
                      )}
                    </p>
                    <p className="text-muted text-xs">{formatarData(m.criadoEm)}</p>
                    {m.observacao && (
                      <p className="text-muted text-xs italic truncate">{m.observacao}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-display font-bold text-sm ${cor}`}>
                      {sinal}
                      {m.quantidade}
                    </p>
                    <p className="text-muted text-[10px]">saldo {m.saldoApos}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Overlay>
  );
}

export function ModalConfirmarDelete({ material, onClose, onConfirmar }) {
  return (
    <Overlay open onClose={onClose} title="Remover material?" size="sm">
      <p className="text-muted text-sm mb-6">
        <span className="text-white font-medium">{material.nome}</span> será removido
        permanentemente.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="btn-ghost flex-1">
          Cancelar
        </button>
        <button onClick={onConfirmar} className="btn-danger flex-1 py-3">
          Remover
        </button>
      </div>
    </Overlay>
  );
}
