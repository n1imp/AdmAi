import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import ServicoDetail from '../features/servicos/ServicoDetail.jsx';
import { useServicosInfinita, classificarErro } from '../features/servicos/servicosApi.js';
import { servicoVM } from '../features/servicos/servicosVM.js';

/**
 * Serviços — primeira superfície do novo design system (FR-14, DECISOR 01a04bfb).
 * MASTER_DETAIL: split persistente em xl+ (lista | detalhe sempre alocado); abaixo disso a
 * MESMA rota compõe route-like (selecionar vira tela de detalhe com "Voltar"). `?servico=id`
 * é a seleção canônica nos dois layouts — deep-link/reload resolvem pelo GET /servicos/:id
 * (query própria do detail), nunca pela página carregada da lista. Sem drawer, sem dialog:
 * regiões nomeadas. O wrapper `.adm-shell` marca a página como MIGRADA (sai do poço Aurora).
 */
/* UMA composição por vez (split xl+ OU route-like) — decidida por matchMedia, nunca por CSS
   escondendo DOM duplicado (leitores de tela leriam tudo duas vezes). Sem matchMedia
   (jsdom/ambientes mínimos) cai na composição route-like, a mais segura. */
function useSplitDesktop() {
  const consultar = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches;
  const [split, setSplit] = useState(consultar);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1280px)');
    const ouvir = (e) => setSplit(e.matches);
    mq.addEventListener?.('change', ouvir);
    return () => mq.removeEventListener?.('change', ouvir);
  }, []);
  return split;
}

export default function Servicos() {
  const navigate = useNavigate();
  const { pode } = useAuth();
  const splitDesktop = useSplitDesktop();
  const [searchParams, setSearchParams] = useSearchParams();

  const selecionadoId = searchParams.get('servico') ? Number(searchParams.get('servico')) : null;
  const filtroLocal = searchParams.get('local') || '';
  const [buscaTecnico, setBuscaTecnico] = useState(searchParams.get('tecnico') || '');
  const [tecnicoAplicado, setTecnicoAplicado] = useState(buscaTecnico);

  const filtros = useMemo(
    () => ({
      ...(tecnicoAplicado ? { tecnico: tecnicoAplicado } : {}),
      ...(filtroLocal ? { local: filtroLocal } : {}),
    }),
    [tecnicoAplicado, filtroLocal]
  );

  const consulta = useServicosInfinita(filtros);
  const paginas = consulta.data?.pages ?? [];
  const itens = paginas.flatMap((p) => p?.data ?? []);
  const total = paginas[0]?.total ?? itens.length;
  const temFiltro = Boolean(tecnicoAplicado || filtroLocal);

  /* Locais para os chips derivam dos dados carregados (não inventa taxonomia). */
  const locais = useMemo(() => [...new Set(itens.map((s) => s.local).filter(Boolean))], [itens]);

  const tituloListaRef = useRef(null);

  function mudarParams(mudancas) {
    const prox = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v == null || v === '') prox.delete(k);
      else prox.set(k, String(v));
    }
    setSearchParams(prox);
  }

  const selecionar = (id) => mudarParams({ servico: id });
  /* Back interno seguro: remove a seleção sem depender de haver histórico anterior. */
  const voltarParaLista = () => {
    mudarParams({ servico: null });
    requestAnimationFrame(() => tituloListaRef.current?.focus());
  };

  function aplicarBusca(e) {
    e.preventDefault();
    setTecnicoAplicado(buscaTecnico.trim());
    mudarParams({ tecnico: buscaTecnico.trim() || null, servico: null });
  }

  const aoSairDoDetalhe = () => voltarParaLista();

  const erroLista = consulta.isError ? classificarErro(consulta.error) : null;

  const chip = (vmStatus) => {
    const cor = {
      attention: ['var(--adm-attention)', 'var(--adm-attention-soft)'],
      success: ['var(--adm-success)', 'var(--adm-success-soft)'],
      danger: ['var(--adm-danger)', 'var(--adm-danger-soft)'],
      neutral: ['var(--adm-text-muted)', 'transparent'],
    }[vmStatus.semantica];
    return (
      <span
        style={{
          font: 'var(--adm-label)',
          padding: '2px 8px',
          borderRadius: 'var(--adm-r1)',
          color: cor[0],
          background: cor[1],
          whiteSpace: 'nowrap',
        }}
      >
        {vmStatus.rotulo}
      </span>
    );
  };

  const lista = (
    <section aria-label="Lista de serviços" style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1
            ref={tituloListaRef}
            tabIndex={-1}
            style={{ font: 'var(--adm-page-title)', outline: 'none' }}
          >
            Serviços
          </h1>
          <p
            className="num"
            style={{ font: 'var(--adm-body-compact)', color: 'var(--adm-text-muted)' }}
            aria-live="polite"
          >
            {consulta.isLoading ? 'Carregando…' : `${total} registro${total === 1 ? '' : 's'}`}
          </p>
        </div>
        {pode('servicos', 'criar') && (
          <button
            type="button"
            onClick={() => navigate('/servicos/novo')}
            className="adm-sair"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--adm-accent-text)',
              background: 'var(--adm-accent)',
              borderColor: 'var(--adm-accent)',
              minHeight: 38,
            }}
          >
            <Plus size={16} aria-hidden="true" /> Registrar serviço
          </button>
        )}
      </div>

      <form
        onSubmit={aplicarBusca}
        role="search"
        aria-label="Buscar serviços"
        style={{ display: 'flex', gap: 8, marginBottom: 10 }}
      >
        <input
          type="search"
          value={buscaTecnico}
          onChange={(e) => setBuscaTecnico(e.target.value)}
          placeholder="Buscar por técnico"
          aria-label="Buscar por técnico"
          style={{
            flex: 1,
            minHeight: 38,
            padding: '8px 12px',
            font: 'var(--adm-body)',
            color: 'var(--adm-text)',
            background: 'var(--adm-surface)',
            border: '1px solid var(--adm-border-strong)',
            borderRadius: 'var(--adm-r2)',
          }}
        />
        <button type="submit" className="adm-sair">
          Buscar
        </button>
      </form>

      {locais.length > 1 && (
        <div
          role="group"
          aria-label="Filtrar por local"
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}
        >
          {['', ...locais].map((l) => (
            <button
              key={l || 'todos'}
              type="button"
              onClick={() => mudarParams({ local: l || null, servico: null })}
              className="adm-sair"
              aria-pressed={filtroLocal === l || (!filtroLocal && !l)}
              style={
                (filtroLocal || '') === l
                  ? {
                      background: 'var(--adm-accent-soft)',
                      color: 'var(--adm-accent)',
                      borderColor: 'var(--adm-accent)',
                    }
                  : undefined
              }
            >
              {l || 'Todos'}
            </button>
          ))}
        </div>
      )}

      {consulta.isLoading ? (
        <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="adm-skeleton"
              style={{ height: 'var(--adm-row-compact)' }}
              aria-hidden="true"
            />
          ))}
        </div>
      ) : erroLista ? (
        <div role="alert" style={{ padding: 'var(--adm-s5) 0' }}>
          <p style={{ font: 'var(--adm-body)' }}>Não foi possível carregar os serviços.</p>
          <p
            style={{
              font: 'var(--adm-body-compact)',
              color: 'var(--adm-text-muted)',
              marginTop: 4,
            }}
          >
            {erroLista.mensagem}
          </p>
          <button
            type="button"
            className="adm-sair"
            style={{ marginTop: 12 }}
            onClick={() => consulta.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : itens.length === 0 ? (
        <div style={{ padding: 'var(--adm-s6) 0', textAlign: 'center' }}>
          <p style={{ font: 'var(--adm-body)' }}>Nenhum serviço encontrado</p>
          <p
            style={{
              font: 'var(--adm-body-compact)',
              color: 'var(--adm-text-muted)',
              marginTop: 4,
            }}
          >
            {temFiltro
              ? 'Tente ajustar os filtros ou registre um novo serviço.'
              : 'Registre o primeiro serviço para começar.'}
          </p>
          {pode('servicos', 'criar') && !temFiltro && (
            <button
              type="button"
              className="adm-sair"
              style={{
                marginTop: 12,
                color: 'var(--adm-accent-text)',
                background: 'var(--adm-accent)',
                borderColor: 'var(--adm-accent)',
              }}
              onClick={() => navigate('/servicos/novo')}
            >
              Registrar serviço
            </button>
          )}
        </div>
      ) : (
        <>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              background: 'var(--adm-surface)',
              border: '1px solid var(--adm-border)',
              borderRadius: 'var(--adm-r2)',
            }}
          >
            {itens.map((s) => {
              const vm = servicoVM(s);
              const ativa = selecionadoId === vm.id;
              return (
                <li key={vm.id} style={{ borderTop: '1px solid var(--adm-border)' }}>
                  <button
                    type="button"
                    onClick={() => selecionar(vm.id)}
                    aria-current={ativa ? 'true' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      minHeight: 'var(--adm-row-compact)',
                      padding: '6px 12px',
                      background: ativa ? 'var(--adm-accent-soft)' : 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      font: 'var(--adm-body)',
                      color: 'var(--adm-text)',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {vm.descricao}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          font: 'var(--adm-caption)',
                          color: 'var(--adm-text-faint)',
                        }}
                      >
                        {[vm.tecnicoNome, vm.local].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {chip(vm.status)}
                    <span
                      className="num"
                      style={{
                        font: 'var(--adm-numeric)',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {vm.cobradoRotulo}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {consulta.hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="adm-sair"
                disabled={consulta.isFetchingNextPage}
                onClick={() => consulta.fetchNextPage()}
              >
                {consulta.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );

  const detalhe = (
    <section
      aria-label="Detalhes do serviço"
      style={{
        background: 'var(--adm-surface)',
        border: '1px solid var(--adm-border)',
        borderRadius: 'var(--adm-r2)',
        alignSelf: 'start',
        position: 'sticky',
        top: 'var(--adm-s4)',
        minWidth: 0,
      }}
    >
      {selecionadoId ? (
        <ServicoDetail
          id={selecionadoId}
          decisionContext="colecao"
          onDecidido={aoSairDoDetalhe}
          onRemovido={aoSairDoDetalhe}
        />
      ) : (
        <p
          style={{
            padding: 'var(--adm-s6)',
            font: 'var(--adm-body-compact)',
            color: 'var(--adm-text-muted)',
            textAlign: 'center',
          }}
        >
          Selecione um serviço para ver os detalhes.
        </p>
      )}
    </section>
  );

  return (
    <div
      className="adm-shell"
      style={{ minHeight: '100%', padding: 'var(--adm-s5) var(--adm-s4) var(--adm-s8)' }}
    >
      {splitDesktop ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 430px) 1fr',
            gap: 'var(--adm-s5)',
          }}
        >
          {lista}
          {detalhe}
        </div>
      ) : selecionadoId ? (
        <ServicoDetail
          id={selecionadoId}
          decisionContext="colecao"
          onVoltar={voltarParaLista}
          onDecidido={aoSairDoDetalhe}
          onRemovido={aoSairDoDetalhe}
        />
      ) : (
        lista
      )}
    </div>
  );
}
