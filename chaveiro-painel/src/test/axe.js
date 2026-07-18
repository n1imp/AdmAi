// Acessibilidade automatizada (axe-core) para os testes do painel — F9/M6 (fase B).
//
// jsdom NAO computa layout nem cor: as regras `color-contrast` (precisa de cor real) e
// `region` (landmark; ruido em teste de componente isolado) dao falso-positivo aqui, entao
// ficam desligadas por padrao. Adotamos o axe-core direto (sem o wrapper vitest-axe) com um
// helper fino proprio, conforme o plano da fase.
//
// Uso:
//   const v = violacoesRelevantes(await checarA11y(container));
//   expect(v, formatarViolacoes(v)).toHaveLength(0);
import axe from 'axe-core';

const REGRAS_JSDOM_OFF = {
  'color-contrast': { enabled: false },
  region: { enabled: false },
};

/** Roda o axe-core num container renderizado e devolve as violacoes encontradas. */
export async function checarA11y(container, { rules = {}, ...resto } = {}) {
  const { violations } = await axe.run(container, {
    rules: { ...REGRAS_JSDOM_OFF, ...rules },
    resultTypes: ['violations'],
    ...resto,
  });
  return violations;
}

/** Filtra so o que importa num gate inicial: violacoes serias e criticas. */
export function violacoesRelevantes(violations) {
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

/** Mensagem legivel das violacoes (usada como descricao do expect ao falhar). */
export function formatarViolacoes(violations) {
  if (!violations.length) return 'sem violacoes';
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} - ${v.nodes.length} no(s)`)
    .join('\n');
}
