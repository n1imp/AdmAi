import { Link, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  MessageSquare,
  Zap,
  ShieldCheck,
  BarChart3,
  Package,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import RodapeLegal from '../components/RodapeLegal.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import { featureAtiva } from '../lib/featureFlags.js';

/**
 * Página pública de apresentação (landing). Exibida em "/" para visitantes não
 * autenticados (ver App.jsx → Home). CTA principal leva ao cadastro do beta.
 *
 * [D4] O WhatsApp é POST_MVP: a landing não pode vendê-lo como funcionalidade PRESENTE.
 * O primeiro recurso e os passos "como funciona" trocam para a experiência real (registro
 * no painel) enquanto a feature está diferida, e voltam junto com a flag — sem redesenho.
 */
const RECURSO_WHATSAPP = {
  Icon: MessageSquare,
  t: 'WhatsApp integrado (em breve)',
  s: 'Em breve: técnicos vão registrar serviços conversando no chat, sem app extra.',
};
const RECURSO_PAINEL = {
  Icon: ClipboardList,
  t: 'Registro rápido no painel',
  s: 'Lance serviços em segundos pelo painel — no computador ou no celular, em campo.',
};

const RECURSOS_FIXOS = [
  {
    Icon: BarChart3,
    t: 'Painel em tempo real',
    s: 'Receita, comissões e ranking de técnicos, atualizados na hora.',
  },
  {
    Icon: Package,
    t: 'Estoque com saldo real',
    s: 'Baixa automática de materiais a cada serviço, com alertas.',
  },
  {
    Icon: Zap,
    t: 'Avaliações automáticas',
    s: 'O cliente recebe a pesquisa de satisfação sozinho, após o serviço.',
  },
  {
    Icon: ShieldCheck,
    t: 'Multi-empresa seguro',
    s: 'Dados isolados por conta, com 2FA e criptografia.',
  },
  {
    Icon: CheckCircle2,
    t: 'Fechamento em PDF',
    s: 'Relatório de período pronto para enviar ao contador.',
  },
];

const PASSOS_WHATSAPP = [
  'O técnico manda "serviço" no WhatsApp e responde uma pergunta por vez.',
  'O serviço é registrado, o estoque baixa e um resumo vai pro grupo.',
  'O dono acompanha tudo pelo painel e recebe o resumo da semana.',
];
const PASSOS_PAINEL = [
  'O técnico lança o serviço pelo painel, em campo, em poucos toques.',
  'O serviço é registrado e o estoque baixa automaticamente.',
  'O dono acompanha tudo pelo painel e recebe o resumo da semana.',
];

export default function Landing() {
  useDocumentHead({ indexavel: true });
  const navigate = useNavigate();
  const irParaBeta = () => navigate('/login?modo=cadastrar');
  const comWhatsapp = featureAtiva('WHATSAPP');
  const RECURSOS = [comWhatsapp ? RECURSO_WHATSAPP : RECURSO_PAINEL, ...RECURSOS_FIXOS];
  const PASSOS = comWhatsapp ? PASSOS_WHATSAPP : PASSOS_PAINEL;

  return (
    <div className="min-h-dvh bg-dark-900 text-white">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="border-b border-dark-600">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
              <KeyRound size={18} className="text-accent-300" strokeWidth={2} />
            </div>
            <span className="font-display font-bold text-lg tracking-wide">
              ADM<span className="text-accent-400">AI</span>
            </span>
          </div>
          <Link
            to="/login"
            className="alvo-toque-linha px-2 text-sm text-muted hover:text-white transition-colors"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-dark-600">
        <div className="absolute inset-0 bg-grid [background-size:32px_32px] opacity-[0.4]" />
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-accent-400/10 blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-6 py-16 lg:py-24">
          <p className="section-label mb-4 flex items-center gap-2">
            <span className="w-6 h-px bg-accent-400 inline-block" /> GESTÃO PARA CHAVEIROS · BETA
          </p>
          <h1 className="font-display text-4xl lg:text-6xl font-bold leading-[1.05] uppercase tracking-tight max-w-2xl">
            Sua operação de chaveiro <span className="text-accent-400">sob controle</span>
          </h1>
          <p className="text-muted mt-5 leading-relaxed max-w-xl text-lg">
            Registre serviços e acompanhe receita, comissões, estoque e avaliações num painel só.
            Feito para quem trabalha em campo.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button onClick={irParaBeta} className="btn-primary sm:w-auto sm:px-8">
              Participar do beta <ArrowRight size={16} />
            </button>
            <Link
              to="/login"
              className="alvo-toque-linha px-2 text-sm text-muted hover:text-white transition-colors"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </section>

      {/* ── Recursos ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
          Tudo que a oficina precisa
        </h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {RECURSOS.map(({ Icon, t, s }) => (
            <div key={t} className="card p-5">
              <div className="w-10 h-10 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center mb-3">
                <Icon size={18} className="text-accent-300" />
              </div>
              <p className="font-medium">{t}</p>
              <p className="text-sm text-muted mt-1 leading-relaxed">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Como funciona ─────────────────────────────────────────────────── */}
      <section className="border-y border-dark-600 bg-dark-950/40">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-display text-2xl font-bold uppercase tracking-tight">
            Como funciona
          </h2>
          <ol className="mt-8 grid md:grid-cols-3 gap-6">
            {PASSOS.map((p, i) => (
              <li key={i} className="relative pl-12">
                <span className="absolute left-0 top-0 w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center font-display font-bold text-accent-300">
                  {i + 1}
                </span>
                <p className="text-muted leading-relaxed">{p}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA beta ──────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight">
          Participe do <span className="text-accent-400">beta fechado</span>
        </h2>
        <p className="text-muted mt-3 max-w-md mx-auto leading-relaxed">
          Estamos abrindo vagas para um grupo pequeno de chaveiros. Crie sua conta e comece a
          registrar serviços hoje.
        </p>
        <button onClick={irParaBeta} className="btn-primary mt-6 sm:w-auto sm:px-8">
          Criar minha conta <ArrowRight size={16} />
        </button>
      </section>

      <RodapeLegal className="border-t border-dark-600" />
    </div>
  );
}
