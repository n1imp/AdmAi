export default function PanelScope({ active = true, children }) {
  if (!active) return children;

  return (
    <div className="panel-ui" data-ui="panel" data-panel-scope="contents">
      {children}
    </div>
  );
}
