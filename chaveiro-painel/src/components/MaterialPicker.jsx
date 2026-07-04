import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Plus, Package } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';

// Seletor de materiais do catálogo (GET /materiais) para o formulário de serviço.
//
// Permite buscar por nome e adicionar um ou mais materiais, cada um com uma
// quantidade. Os selecionados aparecem como linhas removíveis.
//
// Contrato com o pai: `value` é o array atual de seleção e `onChange` recebe
// a nova seleção no formato [{ materialId, quantidade, nome }].
export default function MaterialPicker({ value = [], onChange }) {
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    api
      .get('/materiais')
      .then(({ data }) => { if (ativo) setMateriais(Array.isArray(data) ? data : []); })
      .catch(() => { if (ativo) setErro(true); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onClickFora(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, []);

  const idsSelecionados = useMemo(
    () => new Set(value.map((v) => v.materialId)),
    [value]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return materiais
      .filter((m) => !idsSelecionados.has(m.id))
      .filter((m) => (termo ? m.nome.toLowerCase().includes(termo) : true));
  }, [materiais, busca, idsSelecionados]);

  function adicionar(material) {
    onChange([...value, { materialId: material.id, quantidade: 1, nome: material.nome }]);
    setBusca('');
    setAberto(false);
  }

  function remover(materialId) {
    onChange(value.filter((v) => v.materialId !== materialId));
  }

  function alterarQtd(materialId, qtdRaw) {
    // Mantém o texto enquanto digita; normaliza para número >= 0 (vírgula vira ponto).
    const num = parseFloat(String(qtdRaw).replace(',', '.'));
    const quantidade = Number.isFinite(num) && num > 0 ? num : '';
    onChange(value.map((v) => (v.materialId === materialId ? { ...v, quantidade } : v)));
  }

  return (
    <div ref={wrapRef} className="flex flex-col gap-3">
      {/* Busca / dropdown */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          placeholder={carregando ? 'Carregando materiais…' : 'Buscar material do catálogo…'}
          className="input pl-9 pr-4"
          disabled={carregando || erro}
        />

        {aberto && !carregando && !erro && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-dark-800 border border-dark-600 rounded-lg shadow-panel">
            {filtrados.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">
                {materiais.length === 0
                  ? 'Nenhum material cadastrado'
                  : busca
                  ? 'Nenhum material encontrado'
                  : 'Todos os materiais já foram adicionados'}
              </p>
            ) : (
              filtrados.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => adicionar(m)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-dark-700 transition-colors border-b border-dark-700 last:border-0"
                >
                  <Package size={15} className="text-muted shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-sm text-white">{m.nome}</span>
                  {m.precoVenda != null && (
                    <span className="text-xs text-accent-300 tnum shrink-0">{formatarMoeda(m.precoVenda)}</span>
                  )}
                  <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px] shrink-0">{m.unidade}</span>
                  <Plus size={15} className="text-accent-300 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {erro && (
        <p className="text-xs text-danger">Não foi possível carregar o catálogo de materiais.</p>
      )}

      {/* Materiais selecionados */}
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((item) => (
            <div
              key={item.materialId}
              className="flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2"
            >
              <Package size={15} className="text-accent-300 shrink-0" />
              <span className="flex-1 min-w-0 truncate text-sm text-white">{item.nome}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={item.quantidade}
                onChange={(e) => alterarQtd(item.materialId, e.target.value)}
                className="input w-20 py-1.5 text-center tnum"
                aria-label={`Quantidade de ${item.nome}`}
              />
              <button
                type="button"
                onClick={() => remover(item.materialId)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-danger transition-colors shrink-0"
                aria-label={`Remover ${item.nome}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
