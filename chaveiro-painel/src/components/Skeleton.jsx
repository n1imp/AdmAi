export function SkeletonCard({ announce = true, className = '' }) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-label={announce ? 'Carregando' : undefined}
      aria-busy={announce ? 'true' : undefined}
      aria-hidden={announce ? undefined : 'true'}
      className={`skeleton h-24 ${className}`}
    />
  );
}

export function SkeletonKpi({ announce = false }) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-label={announce ? 'Carregando indicadores' : undefined}
      aria-busy={announce ? 'true' : undefined}
      aria-hidden={announce ? undefined : 'true'}
      className="card flex flex-col gap-2"
    >
      <div aria-hidden="true">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-8 w-28 rounded mt-2" />
      </div>
    </div>
  );
}

export function SkeletonServico({ announce = true }) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-label={announce ? 'Carregando serviço' : undefined}
      aria-busy={announce ? 'true' : undefined}
      aria-hidden={announce ? undefined : 'true'}
      className="card flex flex-col gap-2"
    >
      <div className="flex justify-between">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
      <div className="skeleton h-3 w-40 rounded" />
      <div className="skeleton h-3 w-32 rounded" />
    </div>
  );
}

export function SkeletonLista({ qtd = 5, announce = true }) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-label={announce ? 'Carregando lista' : undefined}
      aria-busy={announce ? 'true' : undefined}
      aria-hidden={announce ? undefined : 'true'}
      className="flex flex-col gap-3"
    >
      {Array.from({ length: qtd }).map((_, i) => (
        <SkeletonServico key={i} announce={false} />
      ))}
    </div>
  );
}
