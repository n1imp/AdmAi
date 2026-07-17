import { Children, isValidElement, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

// Wizard multi-etapas reutilizável.
//
// Uso:
//   <Wizard etapas={["Dados", "Vínculo", "Acesso", "Confirmação"]}
//           podeAvancar={(i) => boolean}
//           onConcluir={async () => { ... }}
//           concluindo={salvando}
//           rotuloConcluir="Cadastrar técnico">
//     <Etapa1 />
//     <Etapa2 />
//     ...
//   </Wizard>
//
// Cada filho direto é uma etapa. A barra de progresso, os botões Voltar/Próximo
// e o botão final de conclusão são gerenciados aqui. `podeAvancar(indice)` é
// consultado para habilitar o botão "Próximo" (e o "Concluir" na última etapa).
export default function Wizard({
  etapas = [],
  children,
  podeAvancar = () => true,
  onConcluir,
  concluindo = false,
  rotuloConcluir = 'Concluir',
  onCancelar,
}) {
  const passos = Children.toArray(children).filter(isValidElement);
  const total = passos.length;
  const [indice, setIndice] = useState(0);

  const ehUltima = indice === total - 1;
  const habilitado = podeAvancar(indice);

  function voltar() {
    if (indice === 0) {
      onCancelar?.();
      return;
    }
    setIndice((i) => Math.max(0, i - 1));
  }

  function proximo() {
    if (!habilitado) return;
    if (ehUltima) {
      onConcluir?.();
      return;
    }
    setIndice((i) => Math.min(total - 1, i + 1));
  }

  const rotulos = etapas.length === total ? etapas : passos.map((_, i) => `Etapa ${i + 1}`);

  return (
    <div className="flex flex-col gap-5">
      {/* Barra de progresso por etiquetas */}
      <div>
        <div className="flex items-center gap-1.5">
          {rotulos.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < indice ? 'bg-success' : i === indice ? 'bg-accent-400' : 'bg-dark-700'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-accent-300 text-xs font-display font-semibold uppercase tracking-wide">
            {rotulos[indice]}
          </p>
          <p className="text-muted text-xs tnum">
            Etapa {indice + 1} de {total}
          </p>
        </div>
      </div>

      {/* Conteúdo da etapa atual */}
      <div className="min-h-[120px] animate-fade-in" key={indice}>
        {passos[indice]}
      </div>

      {/* Navegação */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={voltar}
          disabled={concluindo}
          className="btn-ghost flex-1 flex items-center justify-center gap-1.5"
        >
          <ChevronLeft size={16} />
          {indice === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        <button
          type="button"
          onClick={proximo}
          disabled={!habilitado || concluindo}
          className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ehUltima ? (
            <>
              {concluindo ? 'Salvando…' : rotuloConcluir}
              {!concluindo && <Check size={16} />}
            </>
          ) : (
            <>
              Próximo <ChevronRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
