// CONTROLE NEGATIVO DO GATE CI (Ciclo 3) — commit TEMPORÁRIO em branch tmp/, PR fechado sem
// merge e branch deletada ao fim. eval() dispara react-doctor/no-eval (severidade error).
export default function RdGateNegControl() {
  // eslint-disable-next-line no-eval
  const computado = eval('2 + 2');
  return <span data-x={computado}>controle negativo do gate</span>;
}
