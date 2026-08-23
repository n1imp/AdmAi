/**
 * Escopo de identidade Aurora — INCONDICIONAL desde SL-09 ("Aurora em tudo", decisão do
 * usuário em 2026-08-23). A prop `active` que preservava a fronteira PUBLIC_SURFACES foi
 * removida junto com a fronteira: capacidade morta no dono do escopo era a fronteira
 * sobrevivendo por contrato (achado da revisão de lote, thread 01a02e9b).
 */
export default function PanelScope({ children }) {
  return (
    <div className="panel-ui" data-ui="panel" data-panel-scope="contents">
      {children}
    </div>
  );
}
