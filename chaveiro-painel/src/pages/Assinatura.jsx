import { useEffect, useState } from 'react';
import { CreditCard, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import BackHeader from '../components/BackHeader.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import api, { formatarData } from '../lib/api.js';

/**
 * Superfície MÍNIMA de billing — decisão do usuário (2026-08-23).  [SL-10]
 *
 * O backend já existia inteiro (checkout, portal, status, webhook, paywall); o que faltava era
 * QUALQUER tela: o card do hub dizia "em breve" sobre uma capacidade montada e verificada.
 * Esta página só consome os três endpoints existentes — zero lógica de cobrança nova:
 *   GET  /billing/status   → { status, trialFimEm, periodoFimEm, canceladoEm }
 *   POST /billing/checkout → { url }  (admin)
 *   POST /billing/portal   → { url }  (admin)
 *
 * A AÇÃO segue o estado: sem vínculo no Stripe (sem plano, cancelada, trial de cadastro) →
 * checkout (assinar); assinatura viva no Stripe → portal (cartão, troca de plano, cancelar).
 * Os endpoints de ação são adminOnly no backend; para os demais papéis a
 * página mostra o status e diz com quem falar — nunca um botão que retornaria 403.
 */
const MOTIVOS = {
  sem_plano: {
    Icone: AlertTriangle,
    tom: 'text-warning',
    titulo: 'Nenhuma assinatura ativa',
    detalhe: () => 'Sua empresa ainda não tem um plano. Assine para manter o acesso ao painel.',
    acao: 'assinar',
  },
  /* trialing tem DUAS origens com ações opostas, e o discriminador é determinístico:
     `periodoFimEm` só é escrito pelo webhook do Stripe (billing.js:136). Ausente = trial de
     cadastro, sem customer — o portal responderia 400 e "cobrança automática" seria mentira
     (não há cartão); a saída é ASSINAR. Presente = trial gerido pelo Stripe — checkout aqui
     criaria uma SEGUNDA assinatura; a saída é o portal. */
  trialing: {
    Icone: Clock,
    tom: 'text-accent-300',
    titulo: 'Período de teste',
    detalhe: (a) => {
      const ate = a.trialFimEm ? ` até ${formatarData(a.trialFimEm)}` : '';
      return a.periodoFimEm
        ? `Teste${ate}. Depois disso, a cobrança começa automaticamente.`
        : `Teste gratuito${ate}. Assine para continuar usando o painel depois dessa data.`;
    },
    acao: (a) => (a.periodoFimEm ? 'portal' : 'assinar'),
  },
  active: {
    Icone: CheckCircle2,
    tom: 'text-success',
    titulo: 'Assinatura ativa',
    detalhe: (a) =>
      a.periodoFimEm ? `Próxima renovação em ${formatarData(a.periodoFimEm)}.` : 'Tudo em dia.',
    acao: 'portal',
  },
  past_due: {
    Icone: AlertTriangle,
    tom: 'text-danger',
    titulo: 'Pagamento atrasado',
    detalhe: () =>
      'A última cobrança falhou. Atualize a forma de pagamento para não perder o acesso.',
    acao: 'portal',
  },
  unpaid: {
    Icone: AlertTriangle,
    tom: 'text-danger',
    titulo: 'Pagamento pendente',
    detalhe: () => 'Há cobranças em aberto. Regularize a forma de pagamento no portal.',
    acao: 'portal',
  },
  incomplete: {
    Icone: AlertTriangle,
    tom: 'text-warning',
    titulo: 'Assinatura incompleta',
    detalhe: () => 'O primeiro pagamento não foi concluído. Finalize no portal de cobrança.',
    acao: 'portal',
  },
  canceled: {
    Icone: AlertTriangle,
    tom: 'text-warning',
    titulo: 'Assinatura cancelada',
    detalhe: (a) =>
      a.periodoFimEm
        ? `O acesso continua até ${formatarData(a.periodoFimEm)}. Assine de novo para não interromper.`
        : 'Assine novamente para voltar a usar o painel.',
    acao: 'assinar',
  },
};

/* Status que o backend conheça e esta página não: mostra o fato cru e oferece o portal —
   nunca esconde o estado nem inventa uma tradução. */
const MOTIVO_DESCONHECIDO = (status) => ({
  Icone: AlertTriangle,
  tom: 'text-warning',
  titulo: `Status: ${status}`,
  detalhe: () => 'Estado incomum de cobrança. O portal mostra os detalhes.',
  acao: 'portal',
});

export default function Assinatura() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [assinatura, setAssinatura] = useState(null);
  const [erro, setErro] = useState(false);
  const [agindo, setAgindo] = useState(false);

  useEffect(() => {
    api
      .get('/billing/status')
      .then((r) => setAssinatura(r.data))
      .catch(() => setErro(true));
  }, []);

  async function abrirStripe(endpoint) {
    setAgindo(true);
    try {
      const r = await api.post(endpoint);
      window.location.assign(r.data.url);
    } catch {
      toast('Não foi possível abrir a cobrança. Tente de novo.', 'error');
      setAgindo(false);
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      <BackHeader titulo="Assinatura" />

      <div className="px-4 pt-3 pb-8 lg:max-w-xl">
        {erro ? (
          <div className="card p-6 text-center">
            <p className="text-muted text-sm">Não foi possível carregar o status da assinatura.</p>
          </div>
        ) : !assinatura ? (
          <div className="card p-6 flex items-center justify-center" aria-label="Carregando">
            <Loader2 size={24} className="text-accent-300 animate-spin" />
          </div>
        ) : (
          <StatusCard
            assinatura={assinatura}
            isAdmin={isAdmin}
            agindo={agindo}
            onAssinar={() => abrirStripe('/billing/checkout')}
            onPortal={() => abrirStripe('/billing/portal')}
          />
        )}
      </div>
    </div>
  );
}

function StatusCard({ assinatura, isAdmin, agindo, onAssinar, onPortal }) {
  const motivo = MOTIVOS[assinatura.status] ?? MOTIVO_DESCONHECIDO(assinatura.status);
  const { Icone, tom, titulo, detalhe } = motivo;
  const acao = typeof motivo.acao === 'function' ? motivo.acao(assinatura) : motivo.acao;

  return (
    <div className="card p-6 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center shrink-0">
          <Icone size={20} className={tom} />
        </div>
        <div>
          <h2 className="font-display font-bold text-white uppercase tracking-wide">{titulo}</h2>
          <p className="text-muted text-sm mt-1">{detalhe(assinatura)}</p>
        </div>
      </div>

      {isAdmin ? (
        <button
          onClick={acao === 'assinar' ? onAssinar : onPortal}
          disabled={agindo}
          className="btn-primary"
        >
          {agindo ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CreditCard size={16} strokeWidth={2} />
          )}
          {acao === 'assinar' ? 'Assinar' : 'Gerenciar assinatura'}
        </button>
      ) : (
        <p className="text-muted text-xs">
          Somente o administrador da empresa pode alterar a assinatura.
        </p>
      )}
    </div>
  );
}
