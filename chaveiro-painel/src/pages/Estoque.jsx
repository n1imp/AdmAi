import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { SkeletonLista } from '../components/Skeleton.jsx';
import EstadoVazio from '../components/EstadoVazio.jsx';
import ErroBanner from '../components/ErroBanner.jsx';
import { useToast } from '../components/Toast.jsx';
import { Overlay } from '../components/ui/index.js';

const PERIODOS = [
  { label: '7d', valor: 7 },
  { label: '30d', valor: 30 },
  { label: '90d', valor: 90 },
];

function ModalEstoqueMinimo({ material, onClose, onSalvo }) {
  const toast = useToast();
  const [valor, setValor] = useState(
    material.estoqueMinimo != null ? String(material.estoqueMinimo) : ''
  );
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.patch(`/materiais/${material.id}`, {
        estoqueMinimo: valor !== '' ? parseFloat(valor) : null,
      });
      toast('Estoque mínimo atualizado', 'success');
      onSalvo();
      onClose();
    } catch {
      toast('Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Overlay open onClose={onClose} title="Estoque mínimo" description={material.nome} size="sm">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div>
          <label className="kpi-label block mb-2">
            Quantidade em {material.unidade} (deixe vazio para desativar o alerta)
          </label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Sem alerta"
            inputMode="decimal"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn-primary flex-1">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export default function Estoque() {
  const [periodo, setPeriodo] = useState(30);
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);

  const buscar = useCallback(async () => {
    setErro(null);
    setCarregando(true);
    try {
      const { data } = await api.get(`/estoque?periodo=${periodo}`);
      setMateriais(data);
    } catch {
      setErro('Não foi possível carregar o estoque.');
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  const comAlerta = materiais.filter((m) => m.alerta);

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Estoque" para="/mais" />

      {/* Seletor de período */}
      <div className="px-4 pt-3 pb-3 flex gap-2">
        {PERIODOS.map(({ label, valor }) => (
          <button
            key={valor}
            onClick={() => setPeriodo(valor)}
            className={`alvo-toque px-4 rounded-md text-sm font-display font-semibold uppercase tracking-wide transition-colors border ${
              periodo === valor
                ? 'bg-accent-400 text-dark-950 border-accent-400'
                : 'bg-dark-700 text-muted border-dark-600 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Banner de alertas */}
      {!carregando && comAlerta.length > 0 && (
        <div className="mx-4 mb-3 flex items-center gap-3 bg-warning/10 border border-warning/20 rounded-md px-4 py-3">
          <AlertTriangle size={18} className="text-warning shrink-0" />
          <p className="text-warning text-sm font-medium tnum">
            {/* Plural de "material" é "materiais" (troca -al por -ais), não "materialis". */}
            {comAlerta.length} materia{comAlerta.length > 1 ? 'is' : 'l'} com alerta de reposição
          </p>
        </div>
      )}

      {erro && <ErroBanner mensagem={erro} onRetry={buscar} />}

      <div className="flex-1 overflow-y-auto px-4 pb-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3 content-start">
        {carregando ? (
          <div className="lg:col-span-2 xl:col-span-3">
            <SkeletonLista qtd={5} />
          </div>
        ) : materiais.length === 0 ? (
          <div className="lg:col-span-2 xl:col-span-3">
            <EstadoVazio
              mensagem="Nenhum material cadastrado"
              sub="Cadastre materiais na aba Materiais e dê entrada no estoque"
              cta={{ label: 'Ver catálogo de materiais', to: '/materiais' }}
            />
          </div>
        ) : (
          materiais.map((m) => (
            <button
              key={m.id}
              onClick={() => setEditando(m)}
              className="card flex items-center gap-3 text-left w-full active:scale-[0.98] transition-transform hover:border-dark-500"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{m.nome}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted">
                  <span>
                    Saldo:{' '}
                    <span className={`font-medium ${m.alerta ? 'text-danger' : 'text-white'}`}>
                      {m.quantidadeAtual ?? 0} {m.unidade}
                    </span>
                  </span>
                  <span>
                    consumo {m.consumoPeriodo ?? 0} {m.unidade}
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                {m.alerta ? (
                  <span className="badge bg-warning/15 text-warning border-warning/30 flex items-center gap-1">
                    <AlertTriangle size={11} />
                    Repor
                  </span>
                ) : m.estoqueMinimo == null ? (
                  <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px]">
                    sem alerta
                  </span>
                ) : (
                  <span className="badge bg-success/10 text-success border border-success/20 text-[10px]">
                    OK · mín {m.estoqueMinimo} {m.unidade}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {editando && (
        <ModalEstoqueMinimo
          material={editando}
          onClose={() => setEditando(null)}
          onSalvo={buscar}
        />
      )}
    </div>
  );
}
