import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, MapPin, Send } from 'lucide-react';
import Cliente from '../components/avaliacoes/Cliente.jsx';
import Google from '../components/avaliacoes/Google.jsx';
import Solicitacao from '../components/avaliacoes/Solicitacao.jsx';

const ABAS = [
  { value: 'cliente', label: 'Cliente', Icon: Users },
  { value: 'google', label: 'Google', Icon: MapPin },
  { value: 'solicitacao', label: 'Solicitação', Icon: Send },
];

export default function Avaliacoes() {
  const navigate = useNavigate();
  const [aba, setAba] = useState('cliente');

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Voltar"
          className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div>
          <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> FEEDBACK DOS CLIENTES</p>
          <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Avaliações</h1>
        </div>
      </div>

      {/* Sub-abas */}
      <div className="px-4 flex gap-2 mb-3 border-b border-dark-700">
        {ABAS.map(({ value, label, Icon }) => (
          <button key={value} onClick={() => setAba(value)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-display font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
              aba === value ? 'text-accent-300 border-accent-400' : 'text-muted border-transparent hover:text-white'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {aba === 'cliente' && <Cliente />}
        {aba === 'google' && <Google />}
        {aba === 'solicitacao' && <Solicitacao />}
      </div>
    </div>
  );
}
