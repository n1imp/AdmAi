import { useState, useEffect } from 'react';
import { superficieAtual, avisarMudanca, EVENTO_MUDOU } from '../lib/primeiroAcesso.js';
import { useNavigate } from 'react-router-dom';
import { QrCode, ClipboardList, BarChart3, BookOpen, X, KeyRound } from 'lucide-react';
import { featureAtiva } from '../lib/featureFlags.js';

const STORAGE_KEY = 'admai_welcome_seen';

/* [D4] Com WHATSAPP POST_MVP, "Conectar o WhatsApp" prometeria uma ação que não existe.
   O passo entra só com a feature ligada; sem ela, o onboarding começa por cadastrar a equipe. */
const ACOES = [
  featureAtiva('WHATSAPP')
    ? { icon: QrCode, texto: 'Conectar o WhatsApp', cor: 'text-accent-300', bg: 'bg-accent-400/10' }
    : {
        icon: KeyRound,
        texto: 'Cadastrar sua equipe',
        cor: 'text-accent-300',
        bg: 'bg-accent-400/10',
      },
  { icon: ClipboardList, texto: 'Registrar um serviço', cor: 'text-success', bg: 'bg-success/10' },
  { icon: BarChart3, texto: 'Acompanhar no painel', cor: 'text-sky-300', bg: 'bg-sky-400/10' },
];

export default function WelcomeCard({ onVerTutorial }) {
  const navigate = useNavigate();
  /* Não basta "ainda não foi visto": tem de ser a VEZ dele. Enquanto o consentimento estiver
     pendente, este card fica fora da tela — decidir sobre rastreamento embaixo de um card de
     boas-vindas não é decidir. A ordem mora em `lib/primeiroAcesso.js`. [GAP-UI-02] */
  const [visivel, setVisivel] = useState(() => superficieAtual() === 'boas-vindas');

  /* Reavalia quando o consentimento é resolvido, para o card aparecer logo em seguida em vez de
     exigir recarga da página. */
  useEffect(() => {
    const reavaliar = () => setVisivel(superficieAtual() === 'boas-vindas');
    window.addEventListener(EVENTO_MUDOU, reavaliar);
    return () => window.removeEventListener(EVENTO_MUDOU, reavaliar);
  }, []);

  if (!visivel) return null;

  function dispensar() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisivel(false);
    avisarMudanca();
  }

  return (
    <div className="px-4 mb-4">
      <div className="card-accent bg-gradient-to-br from-accent-400/10 to-dark-800 relative animate-fade-in">
        <button
          onClick={dispensar}
          aria-label="Dispensar"
          className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-white transition-colors"
        >
          <X size={16} />
        </button>

        <h2 className="font-display text-xl font-bold text-white pr-8">Bem-vindo ao AdmAi 👋</h2>
        <p className="text-muted text-sm mt-1">
          {featureAtiva('WHATSAPP')
            ? 'Seus serviços e finanças organizados direto do WhatsApp.'
            : 'Seus serviços e finanças organizados num painel só.'}
        </p>

        <div className="flex flex-col gap-2 mt-4">
          {ACOES.map(({ icon: Icon, texto, cor, bg }) => (
            <div key={texto} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${bg}`}>
                <Icon size={16} className={cor} strokeWidth={1.8} />
              </div>
              <span className="text-white text-sm">{texto}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => (onVerTutorial ? onVerTutorial() : navigate('/ajuda'))}
            className="btn-primary flex items-center justify-center gap-2 flex-1"
          >
            <BookOpen size={16} />
            Ver tutorial
          </button>
          <button onClick={dispensar} className="btn-ghost w-auto px-5">
            Dispensar
          </button>
        </div>
      </div>
    </div>
  );
}
