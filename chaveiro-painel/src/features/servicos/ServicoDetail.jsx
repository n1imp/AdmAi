import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import api from '../../lib/api.js';
import {
  useServico,
  useAprovarServico,
  useRejeitarServico,
  useDeletarServico,
  classificarErro,
} from './servicosApi.js';
import { servicoVM } from './servicosVM.js';

/* [SEC-HB-02] Evidência autenticada: <img src> não manda Authorization — baixa via api
   (Bearer) e exibe como blob com revoke no cleanup. URL legada pública renderiza direto.
   (Mecanismo preservado da superfície anterior; uma única apresentação — DECISOR §ii.) */
function ImagemEvidencia({ url }) {
  const protegida = url.startsWith('/api/');
  const [src, setSrc] = useState(protegida ? null : url);
  useEffect(() => {
    if (!protegida) return undefined;
    let vivo = true;
    let objeto;
    api
      .get(url.replace(/^\/api/, ''), { responseType: 'blob' })
      .then((r) => {
        if (!vivo) return;
        objeto = URL.createObjectURL(r.data);
        setSrc(objeto);
      })
      .catch(() => {});
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [url, protegida]);

  if (!src) return null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', marginTop: 8 }}
    >
      <img
        src={src}
        alt="Foto de evidência do serviço"
        loading="lazy"
        style={{
          width: '100%',
          maxHeight: 240,
          objectFit: 'cover',
          borderRadius: 'var(--adm-r2)',
          border: '1px solid var(--adm-border)',
        }}
      />
    </a>
  );
}

/**
 * Detalhe de Serviço — componente ÚNICO das duas superfícies (DECISOR 01a04bfb §ii/§v).
 * Decomposição vinculante por significado: identidade+estado → atendimento → técnico
 * responsável → valores (dl tabular, não KPI-cards) → decisão → ações secundárias → zona de
 * perigo. Regras: 1 chip semântico (o status); `aprovadoPor` cru NUNCA vira identidade
 * (mostra estado+data); seção ausente não renderiza vazia; nenhuma transição futura.
 *
 * props:
 *  - id: resolve via query própria (deep-link NÃO depende da página carregada da lista)
 *  - servicoDaFila: dados já disponíveis (fila de aprovações — quem tem `aprovacoes.ver`
 *    sem `servicos.ver` decide com o que a fila entrega; GET /:id não é requisito oculto)
 *  - decisionContext: 'fila' | 'colecao' (prioridade das ações de decisão)
 *  - onVoltar: back interno seguro (remove `servico` da URL sem depender de histórico)
 *  - onDecidido / onRemovido: a superfície decide o pós (limpar seleção, foco)
 */
export default function ServicoDetail({
  id,
  servicoDaFila = null,
  decisionContext = 'colecao',
  onVoltar,
  onDecidido,
  onRemovido,
}) {
  const { pode } = useAuth();
  const toast = useToast();
  const podeVerServicos = pode('servicos', 'ver');
  const consulta = useServico(podeVerServicos && servicoDaFila == null ? id : null);
  const dto = servicoDaFila ?? consulta.data;
  const vm = servicoVM(dto);

  const aprovar = useAprovarServico();
  const rejeitar = useRejeitarServico();
  const deletar = useDeletarServico();
  const decidindo = aprovar.isPending || rejeitar.isPending;

  const [confirmando, setConfirmando] = useState(null); // 'aprovar' | 'rejeitar' | 'remover'

  /* Foco no título quando o detalhe aparece (list-details: MS Learn/OutSystems — ADOPTED). */
  const tituloRef = useRef(null);
  useEffect(() => {
    if (vm) tituloRef.current?.focus();
  }, [vm?.id]);

  async function decidir(acao) {
    const mutacao = acao === 'aprovar' ? aprovar : rejeitar;
    try {
      await mutacao.mutateAsync(vm.id);
      toast(acao === 'aprovar' ? 'Serviço aprovado' : 'Serviço rejeitado', 'success');
      setConfirmando(null);
      onDecidido?.(vm.id, acao);
    } catch (e) {
      const erro = classificarErro(e);
      /* 409 = fila obsoleta: alguém já decidiu. A invalidação do layer refaz as queries. */
      toast(
        erro.classe === 'CONFLICT'
          ? 'Este serviço já foi decidido por outra pessoa.'
          : erro.mensagem,
        'error'
      );
      setConfirmando(null);
    }
  }

  async function remover() {
    try {
      await deletar.mutateAsync(vm.id);
      toast('Serviço removido com sucesso', 'success');
      setConfirmando(null);
      onRemovido?.(vm.id);
    } catch (e) {
      toast(classificarErro(e).mensagem, 'error');
      setConfirmando(null);
    }
  }

  if (servicoDaFila == null && consulta.isLoading) {
    return (
      <div aria-busy="true" style={{ padding: 'var(--adm-s5)' }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="adm-skeleton"
            style={{ height: 16, marginBottom: 12, width: `${80 - i * 15}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }
  if (servicoDaFila == null && consulta.isError) {
    const erro = classificarErro(consulta.error);
    return (
      <div role="alert" style={{ padding: 'var(--adm-s5)' }}>
        <p style={{ font: 'var(--adm-body)' }}>{erro.mensagem}</p>
        {erro.classe !== 'NOT_FOUND' && (
          <button
            type="button"
            className="adm-sair"
            style={{ marginTop: 12 }}
            onClick={() => consulta.refetch()}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }
  if (!vm) return null;

  const podeDecidir = vm.aguardandoDecisao && pode('aprovacoes', 'aprovar');
  const podeRemover = pode('servicos', 'deletar');
  const semantCor = {
    attention: 'var(--adm-attention)',
    success: 'var(--adm-success)',
    danger: 'var(--adm-danger)',
    neutral: 'var(--adm-text-muted)',
  };
  const semantFundo = {
    attention: 'var(--adm-attention-soft)',
    success: 'var(--adm-success-soft)',
    danger: 'var(--adm-danger-soft)',
    neutral: 'transparent',
  };

  const linhaDl = (rotulo, valor, numerico = false) =>
    valor == null || valor === '' ? null : (
      <div
        key={rotulo}
        style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0' }}
      >
        <dt style={{ font: 'var(--adm-body-compact)', color: 'var(--adm-text-muted)' }}>
          {rotulo}
        </dt>
        <dd
          className={numerico ? 'num' : undefined}
          style={{
            font: 'var(--adm-body-compact)',
            textAlign: 'right',
            fontVariantNumeric: numerico ? 'tabular-nums' : undefined,
          }}
        >
          {valor}
        </dd>
      </div>
    );

  return (
    <article
      aria-label="Detalhes do serviço"
      style={{
        padding: 'var(--adm-s5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--adm-s5)',
      }}
    >
      {/* identidade + estado */}
      <header>
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            className="adm-navitem"
            style={{
              padding: '4px 0',
              marginBottom: 8,
              background: 'none',
              border: 0,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Voltar para serviços
          </button>
        )}
        <h2
          ref={tituloRef}
          tabIndex={-1}
          style={{ font: 'var(--adm-page-title)', outline: 'none' }}
        >
          {vm.descricao}
        </h2>
        <p
          style={{ font: 'var(--adm-caption)', color: 'var(--adm-text-faint)', marginTop: 2 }}
          className="num"
        >
          Serviço #{vm.id} · {vm.criadoEmRotulo}
        </p>
        <span
          className="num"
          style={{
            display: 'inline-block',
            marginTop: 8,
            padding: '2px 8px',
            borderRadius: 'var(--adm-r1)',
            font: 'var(--adm-label)',
            color: semantCor[vm.status.semantica],
            background: semantFundo[vm.status.semantica],
          }}
        >
          {vm.status.rotulo}
        </span>
      </header>

      {/* atendimento / operacional */}
      <section aria-label="Atendimento">
        <h3 style={{ font: 'var(--adm-component-title)', marginBottom: 4 }}>Atendimento</h3>
        <dl style={{ margin: 0 }}>
          {linhaDl('Local', vm.local)}
          {linhaDl('Endereço', vm.endereco)}
          {linhaDl('Cliente', vm.clienteNome)}
          {linhaDl('Telefone', vm.clienteTelefone, true)}
          {linhaDl('Material (descrição)', vm.material)}
        </dl>
        {vm.fotoEvidencia && <ImagemEvidencia url={vm.fotoEvidencia} />}
      </section>

      {/* técnico responsável — RelatedResource do caso REAL Serviço→Técnico */}
      {vm.tecnicoNome && (
        <section aria-label="Técnico responsável">
          <h3 style={{ font: 'var(--adm-component-title)', marginBottom: 4 }}>
            Técnico responsável
          </h3>
          {vm.tecnicoId && podeVerServicos && pode('tecnicos', 'ver') ? (
            <Link
              to={`/tecnicos/${vm.tecnicoId}`}
              style={{ font: 'var(--adm-body)', color: 'var(--adm-accent)' }}
            >
              {vm.tecnicoNome}
            </Link>
          ) : (
            <p style={{ font: 'var(--adm-body)' }}>{vm.tecnicoNome}</p>
          )}
        </section>
      )}

      {/* valores — dl compacta tabular (não KPI cards) */}
      <section aria-label="Valores">
        <h3 style={{ font: 'var(--adm-component-title)', marginBottom: 4 }}>Valores</h3>
        <dl style={{ margin: 0, borderTop: '1px solid var(--adm-border)' }}>
          {linhaDl('Cobrado', vm.cobradoRotulo, true)}
          {linhaDl('Material', vm.materialRotulo, true)}
          {linhaDl('Líquido', vm.liquidoRotulo, true)}
        </dl>
      </section>

      {/* decisão — estado da aprovação; ação quando aplicável (next-best-action §iv) */}
      {(!vm.aguardandoDecisao && vm.aprovadoEmRotulo) || podeDecidir ? (
        <section aria-label="Decisão">
          <h3 style={{ font: 'var(--adm-component-title)', marginBottom: 4 }}>Decisão</h3>
          {vm.aguardandoDecisao ? (
            podeDecidir && (
              <div>
                {confirmando === 'aprovar' || confirmando === 'rejeitar' ? (
                  <div
                    role="group"
                    aria-label="Confirmar decisão"
                    style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <p style={{ font: 'var(--adm-body-compact)', flex: 1, minWidth: 180 }}>
                      {confirmando === 'aprovar'
                        ? 'Aprovar este serviço? A decisão baixa estoque e entra na repartição.'
                        : 'Rejeitar este serviço?'}
                    </p>
                    <button
                      type="button"
                      disabled={decidindo}
                      onClick={() => decidir(confirmando)}
                      className="adm-sair"
                      style={
                        confirmando === 'rejeitar'
                          ? { color: 'var(--adm-danger)', borderColor: 'var(--adm-danger)' }
                          : {
                              color: 'var(--adm-accent-text)',
                              background: 'var(--adm-accent)',
                              borderColor: 'var(--adm-accent)',
                            }
                      }
                    >
                      {decidindo
                        ? 'Enviando…'
                        : confirmando === 'aprovar'
                          ? 'Sim, aprovar'
                          : 'Sim, rejeitar'}
                    </button>
                    <button
                      type="button"
                      disabled={decidindo}
                      onClick={() => setConfirmando(null)}
                      className="adm-sair"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmando('aprovar')}
                      className="adm-sair"
                      style={{
                        color: 'var(--adm-accent-text)',
                        background: 'var(--adm-accent)',
                        borderColor: 'var(--adm-accent)',
                      }}
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando('rejeitar')}
                      className="adm-sair"
                      style={{ color: 'var(--adm-danger)', borderColor: 'var(--adm-danger)' }}
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <p style={{ font: 'var(--adm-body-compact)', color: 'var(--adm-text-muted)' }}>
              {vm.status.rotulo} em {vm.aprovadoEmRotulo}
            </p>
          )}
        </section>
      ) : null}

      {/* ações secundárias — navegação contextual */}
      {decisionContext === 'colecao' && vm.aguardandoDecisao && pode('aprovacoes', 'ver') && (
        <section aria-label="Ações">
          <Link
            to={`/aprovacoes?servico=${vm.id}`}
            style={{ font: 'var(--adm-body-compact)', color: 'var(--adm-accent)' }}
          >
            Ver na fila de aprovações
          </Link>
        </section>
      )}

      {/* zona de perigo — isolada ao final */}
      {podeRemover && decisionContext === 'colecao' && (
        <section
          aria-label="Zona de perigo"
          style={{ borderTop: '1px solid var(--adm-border)', paddingTop: 'var(--adm-s4)' }}
        >
          {confirmando === 'remover' ? (
            <div
              role="group"
              aria-label="Confirmar remoção"
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <p
                style={{
                  font: 'var(--adm-body-compact)',
                  color: 'var(--adm-danger)',
                  flex: 1,
                  minWidth: 160,
                }}
              >
                Confirmar remoção?
              </p>
              <button
                type="button"
                disabled={deletar.isPending}
                onClick={remover}
                className="adm-sair"
                style={{
                  color: 'var(--adm-accent-text)',
                  background: 'var(--adm-danger)',
                  borderColor: 'var(--adm-danger)',
                }}
              >
                {deletar.isPending ? 'Removendo…' : 'Sim, remover'}
              </button>
              <button
                type="button"
                disabled={deletar.isPending}
                onClick={() => setConfirmando(null)}
                className="adm-sair"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando('remover')}
              className="adm-sair"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--adm-danger)',
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Remover serviço
            </button>
          )}
        </section>
      )}
    </article>
  );
}
