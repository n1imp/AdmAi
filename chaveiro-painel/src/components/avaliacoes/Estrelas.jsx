import { Star } from 'lucide-react';

// Linha de 5 estrelas, preenchidas até `nota`.
export default function Estrelas({ nota, size = 14 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size}
          className={n <= (nota ?? 0) ? 'text-warning fill-warning' : 'text-dark-500'}
          strokeWidth={1.5} />
      ))}
    </div>
  );
}
