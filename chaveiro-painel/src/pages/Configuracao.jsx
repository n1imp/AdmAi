import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Bell, MessageCircle, Users, CreditCard, ShieldCheck } from 'lucide-react';
import api from '../lib/api.js';
import BackHeader from '../components/BackHeader.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { featureAtiva } from '../lib/featureFlags.js';

// Página de configurações no padrão SaaS: conta, segurança, integrações.
// Estoque/Materiais saíram daqui — agora são abas próprias.
// Cards com `to` navegam; cards com `breve: true` ainda serão implementados.
const SECOES = [
  {
    titulo: 'Conta',
    cards: [
      {
        to: '/configuracao/perfil',
        icon: User,
        titulo: 'Perfil',
        sub: 'Nome, e-mail e telefone',
        cor: 'text-sky-300',
        bg: 'bg-sky-400/10',
      },
      {
        to: '/configuracao/seguranca',
        icon: Lock,
        titulo: 'Segurança',
        sub: 'Senha e verificação em duas etapas',
        cor: 'text-accent-300',
        bg: 'bg-accent-400/10',
      },
      /* Notificações está DIFERIDA neste release. O item some junto com a rota — esconder só o
         link deixaria a tela a um deep-link de distância. [SCOPE-F3] */
      ...(featureAtiva('NOTIFICACOES')
        ? [
            {
              to: '/configuracao/notificacoes',
              icon: Bell,
              titulo: 'Notificações',
              sub: 'Alertas de estoque e resumos',
              cor: 'text-indigo-300',
              bg: 'bg-indigo-400/10',
            },
          ]
        : []),
    ],
  },
  {
    titulo: 'Integrações',
    cards: [
      {
        icon: MessageCircle,
        titulo: 'WhatsApp',
        sub: 'Registro e ponto pelo robô',
        cor: 'text-muted',
        bg: 'bg-dark-700',
        breve: true,
      },
    ],
  },
  {
    titulo: 'Plano',
    cards: [
      {
        icon: CreditCard,
        titulo: 'Plano e cobrança',
        sub: 'Assinatura e faturas',
        cor: 'text-muted',
        bg: 'bg-dark-700',
        breve: true,
      },
    ],
  },
];

const CARD_USUARIOS = {
  to: '/configuracao/usuarios',
  icon: Users,
  titulo: 'Usuários',
  sub: 'Gerenciar acessos da equipe',
  cor: 'text-indigo-300',
  bg: 'bg-indigo-400/10',
};

function CardLink({ card, onClick }) {
  const { icon: Icon, titulo, sub, cor, bg, breve } = card;
  return (
    <button
      onClick={onClick}
      className="card flex items-center gap-4 text-left active:scale-[0.98] transition-transform w-full"
    >
      <div
        className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 border border-dark-600 ${bg}`}
      >
        <Icon size={21} className={cor} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white flex items-center gap-2">
          {titulo}
          {breve && <span className="badge text-[9px]">em breve</span>}
        </p>
        <p className="text-muted text-xs mt-0.5">{sub}</p>
      </div>
      <svg
        className="text-muted shrink-0"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

// Toggle/switch no padrão do projeto (mesmo de Notificações).
function Toggle({ ativo, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={ativo}
      /* O botão REAL mede 44px (pseudo-elemento não entra no getBoundingClientRect — a área
         até crescia, mas medida honesta exige o alvo de verdade); o pill continua 48×28 como
         span interno. [SL-02B] */
      className="relative h-11 w-14 flex items-center justify-center shrink-0 disabled:opacity-50"
      aria-label="Alternar"
    >
      <span
        className={`relative block w-12 h-7 rounded-full transition-colors ${ativo ? 'bg-success' : 'bg-dark-600'}`}
      >
        <span
          className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${ativo ? 'left-6' : 'left-1'}`}
        />
      </span>
    </button>
  );
}

// Card de preferência da empresa: exigir aprovação dos serviços dos funcionários.
function AprovacaoServico() {
  const toast = useToast();
  const [ativo, setAtivo] = useState(null); // null = carregando
  const [salvando, setSalvando] = useState(false);

  const [erroCarregar, setErroCarregar] = useState(false);

  useEffect(() => {
    api
      .get('/config/empresa')
      .then(({ data }) => {
        setAtivo(Boolean(data.aprovacaoServico));
        setErroCarregar(false);
      })
      // Antes só um toast: `ativo` ficava null, o switch ficava `disabled` para sempre E
      // renderizava visualmente como DESLIGADO — mentindo sobre o estado real da empresa.
      .catch(() => setErroCarregar(true));
  }, []);

  async function alternar() {
    const novo = !ativo;
    setAtivo(novo); // otimista
    setSalvando(true);
    try {
      await api.patch('/config/empresa', { aprovacaoServico: novo });
    } catch {
      setAtivo(!novo); // reverte
      toast('Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <p className="section-label mb-2 px-1">Operação</p>
      <div className="card flex items-center gap-4">
        <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 border border-dark-600 bg-accent-400/10">
          <ShieldCheck size={21} className="text-accent-300" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">Exigir aprovação dos serviços dos funcionários</p>
          <p className="text-muted text-xs mt-0.5">
            {erroCarregar
              ? 'Não foi possível carregar esta configuração — recarregue a página.'
              : 'Serviços lançados por funcionários ficam pendentes até um gestor aprovar.'}
          </p>
        </div>
        <Toggle ativo={!!ativo} onChange={alternar} disabled={ativo === null || salvando} />
      </div>
    </div>
  );
}

export default function Configuracao() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin, pode } = useAuth();

  const secoes = SECOES.map((s) =>
    s.titulo === 'Conta' && isAdmin ? { ...s, cards: [...s.cards, CARD_USUARIOS] } : s
  );

  function abrir(card) {
    if (card.to) navigate(card.to);
    else toast('Em breve disponível', 'warning');
  }

  return (
    <div className="flex flex-col min-h-full">
      <BackHeader titulo="Configurações" />

      <div className="px-4 pt-3 pb-8 flex flex-col gap-6 lg:max-w-3xl">
        {pode('configuracao', 'editar') && <AprovacaoServico />}
        {secoes.map((secao) => (
          <div key={secao.titulo}>
            <p className="section-label mb-2 px-1">{secao.titulo}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {secao.cards.map((card) => (
                <CardLink key={card.titulo} card={card} onClick={() => abrir(card)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
