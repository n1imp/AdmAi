export function SkeletonCard({ className = '' }) {
  return <div className={`skeleton h-24 ${className}`} />;
}

export function SkeletonKpi() {
  return (
    <div className="card flex flex-col gap-2">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton h-8 w-28 rounded" />
    </div>
  );
}

export function SkeletonServico() {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex justify-between">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
      <div className="skeleton h-3 w-40 rounded" />
      <div className="skeleton h-3 w-32 rounded" />
    </div>
  );
}

export function SkeletonLista({ qtd = 5 }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: qtd }).map((_, i) => (
        <SkeletonServico key={i} />
      ))}
    </div>
  );
}
