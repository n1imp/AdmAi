import { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ServicoDetail from '../features/servicos/ServicoDetail.jsx';
import { usePendentes, classificarErro } from '../features/servicos/servicosApi.js';
import { servicoVM } from '../features/servicos/servicosVM.js';
import { useSplitDesktop } from '../features/servicos/useSplitDesktop.js';

/**
 * Aprovações — capability PRÓPRIA nos MESMOS patterns de Serviços (DECISOR 01a04bfb §v).
 * A fila é GET /servicos/pendentes (consulta derivada; aprovação não é entidade). O detalhe
 * é o ServicoDetail compartilhado em `decisionContext="fila"`, alimentado pelos DADOS DA
 * PRÓPRIA FILA — quem tem `aprovacoes.ver` sem `servicos.ver` decide sem GET /:id oculto.
 * Seleção canônica `/aprovacoes?servico=id`. Pós-decisão: seleção limpa e foco volta ao
 * cabeçalho da fila (NUNCA auto-seleciona o próximo). Deep-link obsoleto → mensagem amigável.
 * MASTER_DETAIL (DDR-2; Revisor 01a04c56): split persistente em xl+; abaixo disso o detalhe
 * é PROMOVIDO a tela própria (fila OU decisão no DOM, nunca ambas — como em Serviços).
 */
export default function Aprovacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const splitDesktop = useSplitDesktop();
  const selecionadoId = searchParams.get('servico') ? Number(searchParams.get('servico')) : null;

  const fila = usePendentes();
  const pendentes = Array.isArray(fila.data) ? fila.data : [];
  const selecionado = pendentes.find((s) => s.id === selecionadoId) ?? null;

  const tituloRef = useRef(null);

  function selecionar(id) {
    const prox = new URLSearchParams(searchParams);
    if (id == null) prox.delete('servico');
    else prox.set('servico', String(id));
    setSearchParams(prox);
  }

  const voltarParaFila = () => {
    selecionar(null);
    requestAnimationFrame(() => tituloRef.current?.focus());
  };

  const aoDecidir = voltarParaFila;

  const erro = fila.isError ? classificarErro(fila.error) : null;

  const secaoFila = (
    <section aria-label="Fila de aprovações" style={{ minWidth: 0 }}>
      <h1 ref={tituloRef} tabIndex={-1} style={{ font: 'var(--adm-page-title)', outline: 'none' }}>
        Aprovações
      </h1>
      <p
        className="num"
        style={{
          font: 'var(--adm-body-compact)',
          color: 'var(--adm-text-muted)',
          marginBottom: 12,
        }}
        aria-live="polite"
      >
        {fila.isLoading ? 'Carregando…' : `${pendentes.length} aguardando decisão`}
      </p>

      {fila.isLoading ? (
        <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="adm-skeleton"
              style={{ height: 'var(--adm-row-compact)' }}
              aria-hidden="true"
            />
          ))}
        </div>
      ) : erro ? (
        <div role="alert">
          <p style={{ font: 'var(--adm-body)' }}>{erro.mensagem}</p>
          <button
            type="button"
            className="adm-sair"
            style={{ marginTop: 12 }}
            onClick={() => fila.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : pendentes.length === 0 ? (
        <div style={{ padding: 'var(--adm-s6) 0' }}>
          <p style={{ font: 'var(--adm-body)' }}>
            Fila vazia — nenhum serviço aguardando aprovação.
          </p>
          <p
            style={{
              font: 'var(--adm-body-compact)',
              color: 'var(--adm-text-muted)',
              marginTop: 4,
            }}
          >
            Novos registros de serviço chegam aqui para decisão.
          </p>
        </div>
      ) : (
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
          {pendentes.map((s) => {
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
                      {[vm.tecnicoNome, vm.criadoEmRotulo].filter(Boolean).join(' · ')}
                    </span>
                  </span>
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
      )}
    </section>
  );

  const secaoDecisao = (
    <section
      aria-label="Decisão do serviço"
      style={{
        background: 'var(--adm-surface)',
        border: '1px solid var(--adm-border)',
        borderRadius: 'var(--adm-r2)',
        alignSelf: 'start',
        minWidth: 0,
      }}
    >
      {selecionado ? (
        <ServicoDetail
          servicoDaFila={selecionado}
          decisionContext="fila"
          onDecidido={aoDecidir}
          onVoltar={splitDesktop ? undefined : voltarParaFila}
          rotuloVoltar="Voltar para a fila"
        />
      ) : selecionadoId && !fila.isLoading ? (
        /* Deep-link para serviço que saiu da fila: sem 404 cru. */
        <div style={{ padding: 'var(--adm-s6)' }}>
          <p
            style={{ font: 'var(--adm-body-compact)', color: 'var(--adm-text-muted)' }}
            role="status"
          >
            Este serviço não está mais aguardando aprovação.
          </p>
          {!splitDesktop && (
            <button
              type="button"
              className="adm-sair"
              style={{ marginTop: 12 }}
              onClick={voltarParaFila}
            >
              Voltar para a fila
            </button>
          )}
        </div>
      ) : (
        <p
          style={{
            padding: 'var(--adm-s6)',
            font: 'var(--adm-body-compact)',
            color: 'var(--adm-text-muted)',
            textAlign: 'center',
          }}
        >
          Selecione um serviço da fila para revisar e decidir.
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
            gap: 'var(--adm-s5)',
            gridTemplateColumns: 'minmax(300px, 400px) 1fr',
          }}
        >
          {secaoFila}
          {secaoDecisao}
        </div>
      ) : selecionadoId != null ? (
        secaoDecisao
      ) : (
        secaoFila
      )}
    </div>
  );
}
