import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Search, X, Plus, Package } from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';

// Seletor de materiais do catálogo (GET /materiais) para o formulário de serviço.
//
// Combobox acessível (padrão ARIA APG): o input tem role="combobox" com
// aria-expanded/aria-controls/aria-activedescendant; o dropdown é um listbox e
// cada item é uma option. Setas movem a opção ativa, Enter adiciona e Escape
// fecha devolvendo o foco ao input.
//
// Contrato com o pai (inalterado): `value` é o array atual de seleção e
// `onChange` recebe a nova seleção no formato [{ materialId, quantidade, nome }].
export default function MaterialPicker({ value = [], onChange }) {
  const [materiais, setMateriais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listaRef = useRef(null);

  const baseId = useId().replaceAll(':', '');
  const listboxId = `${baseId}-listbox`;
  const optionId = (id) => `${baseId}-opt-${id}`;

  useEffect(() => {
    let ativoEfeito = true;
    setCarregando(true);
    setErro(false);
    api
      .get('/materiais')
      .then(({ data }) => {
        if (ativoEfeito) setMateriais(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (ativoEfeito) setErro(true);
      })
      .finally(() => {
        if (ativoEfeito) setCarregando(false);
      });
    return () => {
      ativoEfeito = false;
    };
  }, [tentativa]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    function onClickFora(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickFora);
    return () => document.removeEventListener('mousedown', onClickFora);
  }, []);

  const idsSelecionados = useMemo(() => new Set(value.map((v) => v.materialId)), [value]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return materiais
      .filter((m) => !idsSelecionados.has(m.id))
      .filter((m) => (termo ? m.nome.toLowerCase().includes(termo) : true));
  }, [materiais, busca, idsSelecionados]);

  // Mantém o índice ativo dentro dos limites da lista filtrada (que muda ao digitar).
  const ativoSeguro = filtrados.length ? Math.min(ativo, filtrados.length - 1) : -1;
  const listaVisivel = aberto && !carregando && !erro;

  // Rola a opção ativa para dentro da área visível do listbox.
  useEffect(() => {
    if (!listaVisivel || ativoSeguro < 0) return;
    listaRef.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [listaVisivel, ativoSeguro]);

  function adicionar(material) {
    if (!material) return;
    onChange([...value, { materialId: material.id, quantidade: 1, nome: material.nome }]);
    setBusca('');
    setAberto(false);
    setAtivo(0);
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

  function onBuscaChange(e) {
    setBusca(e.target.value);
    setAberto(true);
    setAtivo(0);
  }

  function onBuscaKeyDown(e) {
    if (carregando || erro) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!aberto) setAberto(true);
        else setAtivo((i) => Math.min(i + 1, filtrados.length - 1));
        break;
      case 'ArrowUp':
        if (!aberto) break;
        e.preventDefault();
        setAtivo((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        if (!aberto) break;
        e.preventDefault();
        setAtivo(0);
        break;
      case 'End':
        if (!aberto) break;
        e.preventDefault();
        setAtivo(filtrados.length - 1);
        break;
      case 'Enter':
        if (aberto && ativoSeguro >= 0) {
          e.preventDefault();
          adicionar(filtrados[ativoSeguro]);
        }
        break;
      case 'Escape':
        if (aberto) {
          e.preventDefault();
          e.stopPropagation();
          setAberto(false);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div ref={wrapRef} className="flex flex-col gap-3">
      {/* Busca / combobox */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Buscar material do catálogo"
          aria-expanded={listaVisivel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            listaVisivel && ativoSeguro >= 0 ? optionId(filtrados[ativoSeguro].id) : undefined
          }
          value={busca}
          onChange={onBuscaChange}
          onFocus={() => setAberto(true)}
          onKeyDown={onBuscaKeyDown}
          placeholder={carregando ? 'Carregando materiais…' : 'Buscar material do catálogo…'}
          className="input pl-9 pr-4"
          disabled={carregando || erro}
        />

        {listaVisivel && (
          <ul
            ref={listaRef}
            id={listboxId}
            role="listbox"
            aria-label="Materiais do catálogo"
            className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-dark-800 border border-dark-600 rounded-lg shadow-panel list-none"
          >
            {filtrados.length === 0 ? (
              <li role="presentation" className="px-3 py-3 text-sm text-muted">
                {materiais.length === 0
                  ? 'Nenhum material cadastrado'
                  : busca
                    ? 'Nenhum material encontrado'
                    : 'Todos os materiais já foram adicionados'}
              </li>
            ) : (
              filtrados.map((m, i) => {
                const selecionado = i === ativoSeguro;
                return (
                  <li
                    key={m.id}
                    id={optionId(m.id)}
                    role="option"
                    aria-selected={selecionado}
                    data-ativo={selecionado || undefined}
                    // Mantém o foco no input (padrão combobox): impede o blur do mousedown.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => adicionar(m)}
                    className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-dark-700 last:border-0 transition-colors ${
                      selecionado ? 'bg-dark-700' : ''
                    }`}
                  >
                    <Package size={15} className="text-muted shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-sm text-white">{m.nome}</span>
                    {m.precoVenda != null && (
                      <span className="text-xs text-accent-300 tnum shrink-0">
                        {formatarMoeda(m.precoVenda)}
                      </span>
                    )}
                    <span className="badge bg-dark-700 text-muted border border-dark-600 text-[10px] shrink-0">
                      {m.unidade}
                    </span>
                    <Plus size={15} className="text-accent-300 shrink-0" />
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {erro && (
        <p className="text-xs text-danger flex items-center gap-2">
          Não foi possível carregar o catálogo de materiais.
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="underline text-accent-300 hover:text-accent-400"
          >
            Tentar novamente
          </button>
        </p>
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
                className="w-11 h-11 rounded-md flex items-center justify-center text-muted hover:text-danger transition-colors shrink-0"
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
