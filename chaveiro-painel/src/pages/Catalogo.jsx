import { useState, useEffect, useCallback } from 'react';
import {
  Search, Pencil, Trash2, ImageOff,
  History, ArrowDownCircle, ArrowUpCircle, SlidersHorizontal,
} from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  ModalMaterial,
  ModalMovimentacao,
  ModalHistorico,
  ModalConfirmarDelete,
} from './CatalogoModais.jsx';

function Miniatura({ url, nome }) {
  const [falhou, setFalhou] = useState(false);
  // Sem URL ou imagem quebrada: mostra o placeholder (mantém o tamanho do slot).
  if (!url || falhou) {
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
      onError={() => setFalhou(true)}
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
    setCarregando(true);
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
        className="fixed bottom-24 lg:bottom-8 right-4 lg:right-8 w-14 h-14 rounded-lg bg-accent-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)] text-dark-950 hover:bg-accent-300 transition-colors z-30 text-2xl font-light"
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
