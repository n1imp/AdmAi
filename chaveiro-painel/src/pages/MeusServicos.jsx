import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { useMeusServicos, classificarErro } from '../features/servicos/servicosApi.js';
import { servicoVM } from '../features/servicos/servicosVM.js';

const TABS = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'pendente', rotulo: 'Aguardando' },
  { valor: 'ativo', rotulo: 'Aprovados' },
  { valor: 'rejeitado', rotulo: 'Rejeitados' },
];

/**
 * Meus serviços (funcionário) — mesma arquitetura da coleção de Serviços (prova de
 * alavancagem dos patterns): application layer + VM + estados completos + foundations light.
 * Preservados da superfície anterior: tabs por status com deep-link `?status=` (F7) e o
 * bloco F9/M3 COMPLETO (flag SERVICO_ANDAMENTO_ENABLED, detectada por feature-probe: o
 * endpoint /me/servico-atual responde 404 com a flag off e a UI some por completo —
 * "Iniciar serviço" nos aprovados, banner SERVIÇO ATUAL com "Concluir", 409 explicado).
 */
export default function MeusServicos() {
  const navigate = useNavigate();
  const toast = useToast();
  const { podeProprio } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusUrl = searchParams.get('status');
  /* Filtro em ESTADO (inicializado do deep-link) + espelhado na URL — preservado da
     superfície anterior: o clique responde imediatamente, a URL segue compartilhável. */
  const [tab, setTab] = useState(TABS.some((t) => t.valor === statusUrl) ? statusUrl : 'todos');

  const consulta = useMeusServicos();
  const todos = Array.isArray(consulta.data) ? consulta.data : [];
  const itens = tab === 'todos' ? todos : todos.filter((s) => s.status === tab);
  const erro = consulta.isError ? classificarErro(consulta.error) : null;

  /* F9/M3: probe do serviço atual — 200 liga a feature; 404/403 desliga por completo. */
  const [servicoAtual, setServicoAtual] = useState(null);
  const [m3Disponivel, setM3Disponivel] = useState(false);
  const [acaoId, setAcaoId] = useState(null);

  const sincronizarAtual = useCallback(async () => {
    try {
      const { data } = await api.get('/me/servico-atual');
      setM3Disponivel(true);
      setServicoAtual(data?.servico ?? null);
    } catch {
      setM3Disponivel(false);
      setServicoAtual(null);
    }
  }, []);
  useEffect(() => {
    sincronizarAtual();
  }, [sincronizarAtual]);

  async function iniciar(id) {
    if (acaoId) return;
    setAcaoId(id);
    try {
      const { data } = await api.post(`/servicos/${id}/iniciar`);
      setServicoAtual(data?.servico ?? null);
      await consulta.refetch();
      toast('Serviço iniciado', 'success');
    } catch (e) {
      if (e.response?.status === 409) toast('Você já tem um serviço em andamento', 'warning');
      else toast('Não foi possível iniciar o serviço', 'error');
    } finally {
      setAcaoId(null);
    }
  }

  async function concluir(id) {
    if (acaoId) return;
    setAcaoId(id);
    try {
      await api.post(`/servicos/${id}/concluir`);
      setServicoAtual(null);
      await consulta.refetch();
      toast('Serviço concluído', 'success');
    } catch {
      toast('Não foi possível concluir o serviço', 'error');
    } finally {
      setAcaoId(null);
    }
  }

  function trocarTab(valor) {
    setTab(valor);
    setSearchParams(valor === 'todos' ? {} : { status: valor }, { replace: true });
  }

  const chipCor = {
    attention: ['var(--adm-attention)', 'var(--adm-attention-soft)'],
    success: ['var(--adm-success)', 'var(--adm-success-soft)'],
    danger: ['var(--adm-danger)', 'var(--adm-danger-soft)'],
    neutral: ['var(--adm-accent)', 'var(--adm-accent-soft)'],
  };

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Meus serviços" para="/" />
      <div
        className="adm-shell flex-1 overflow-y-auto px-4 pb-8"
        style={{ background: 'var(--adm-canvas)' }}
      >
        {/* F9/M3: banner do serviço em andamento */}
        {m3Disponivel && servicoAtual && (
          <div
            style={{
              margin: '12px 0',
              border: '1px solid var(--adm-accent)',
              background: 'var(--adm-accent-soft)',
              borderRadius: 'var(--adm-r2)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{ display: 'block', font: 'var(--adm-label)', color: 'var(--adm-accent)' }}
              >
                SERVIÇO ATUAL
              </span>
              <span
                style={{
                  display: 'block',
                  font: 'var(--adm-body)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {servicoAtual.descricao}
              </span>
            </span>
            <button
              type="button"
              className="adm-sair"
              disabled={acaoId != null}
              onClick={() => concluir(servicoAtual.id)}
              style={{
                color: 'var(--adm-accent-text)',
                background: 'var(--adm-accent)',
                borderColor: 'var(--adm-accent)',
              }}
            >
              Concluir
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '12px 0',
            flexWrap: 'wrap',
          }}
        >
          <div
            role="group"
            aria-label="Filtrar por status"
            style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}
          >
            {TABS.map((t) => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={tab === t.valor}
                onClick={() => trocarTab(t.valor)}
                className="adm-sair"
                style={
                  tab === t.valor
                    ? {
                        background: 'var(--adm-accent-soft)',
                        color: 'var(--adm-accent)',
                        borderColor: 'var(--adm-accent)',
                      }
                    : undefined
                }
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          {podeProprio('registrar_servico') && (
            <button
              type="button"
              onClick={() => navigate('/meus-servicos/novo')}
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

        {consulta.isLoading ? (
          <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="adm-skeleton"
                style={{ height: 'var(--adm-row-comfortable)' }}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : erro ? (
          <div role="alert" style={{ padding: 'var(--adm-s5) 0' }}>
            <p style={{ font: 'var(--adm-body)' }}>{erro.mensagem}</p>
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
            <p style={{ font: 'var(--adm-body)' }}>
              {tab === 'todos' ? 'Nenhum serviço ainda' : 'Nenhum serviço neste status.'}
            </p>
            <p
              style={{
                font: 'var(--adm-body-compact)',
                color: 'var(--adm-text-muted)',
                marginTop: 4,
              }}
            >
              {tab === 'todos'
                ? 'Registre o primeiro serviço do seu dia.'
                : 'Troque de aba para ver os demais registros.'}
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
            {itens.map((s) => {
              const vm = servicoVM(s);
              const cor = chipCor[vm.status.semantica];
              const podeIniciar = m3Disponivel && s.status === 'ativo' && !servicoAtual;
              return (
                <li
                  key={vm.id}
                  style={{
                    borderTop: '1px solid var(--adm-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 'var(--adm-row-comfortable)',
                    padding: '8px 12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 160 }}>
                    <span
                      style={{
                        display: 'block',
                        font: 'var(--adm-body)',
                        color: 'var(--adm-text)',
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
                      {[vm.local, vm.criadoEmRotulo].filter(Boolean).join(' · ')}
                    </span>
                  </span>
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
                    {vm.status.rotulo}
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
                  {podeIniciar && (
                    <button
                      type="button"
                      className="adm-sair"
                      disabled={acaoId != null}
                      onClick={() => iniciar(vm.id)}
                    >
                      Iniciar serviço
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
