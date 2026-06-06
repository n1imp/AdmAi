import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QrCode, ClipboardList, BarChart3, BookOpen, X } from 'lucide-react';

const STORAGE_KEY = 'chaveiro_welcome_seen';

const ACOES = [
  { icon: QrCode, texto: 'Conectar o WhatsApp', cor: 'text-accent-300', bg: 'bg-accent-400/10' },
  { icon: ClipboardList, texto: 'Registrar um serviço', cor: 'text-success', bg: 'bg-success/10' },
  { icon: BarChart3, texto: 'Acompanhar no painel', cor: 'text-sky-300', bg: 'bg-sky-400/10' },
];

export default function WelcomeCard() {
  const navigate = useNavigate();
  // Se já foi visto, nasce oculto e não renderiza nada.
  const [visivel, setVisivel] = useState(() => !localStorage.getItem(STORAGE_KEY));

  if (!visivel) return null;

  function dispensar() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisivel(false);
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

        <h2 className="font-display text-xl font-bold text-white pr-8">
          Bem-vindo ao ChaveiroBot 👋
        </h2>
        <p className="text-muted text-sm mt-1">
          Seus serviços e finanças organizados direto do WhatsApp.
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
            onClick={() => navigate('/ajuda')}
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
