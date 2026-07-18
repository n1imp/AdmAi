import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function BackHeader({ titulo, para = '/configuracao' }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-1">
      <button
        onClick={() => navigate(para)}
        aria-label="Voltar"
        className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center text-muted hover:text-accent-300 hover:border-dark-500 transition-colors shrink-0"
      >
        <ChevronLeft size={20} />
      </button>
      <h1 className="font-display text-2xl font-bold text-white uppercase tracking-wide">
        {titulo}
      </h1>
    </div>
  );
}
