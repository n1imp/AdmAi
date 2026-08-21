/**
 * EOS V2 — Tool Router.
 *
 * Regra oficial: usar a fonte de evidencia MAIS BARATA que ofereca precisao
 * suficiente. Nenhuma ferramenta e obrigatoria; nenhuma e proibida por
 * preconceito. A escolha e justificada por custo medido.
 *
 * Medicoes que sustentam as regras (TOOL_COST_REGISTRY.md):
 *   Grep, simbolo distintivo (MODELOS_ESCOPADOS): 481 B, 0% ruido
 *   Grep, simbolo comum (registrar): 1.816 B, 93% ruido
 *   Grep, simbolo curto (pode):      6.937 B, 84% ruido
 *   ctx7 docs (Prisma transactions):  5.332 B, dirigido
 */

/** Um simbolo e "distintivo" quando sua forma ja o torna improvavel em prosa. */
export function symbolDistinctiveness(symbol) {
  const s = String(symbol);
  let score = 0;
  if (/^[A-Z0-9_]{6,}$/.test(s)) score += 3;          // CONSTANTE_SCREAMING
  if (/[a-z][A-Z]/.test(s)) score += 2;                // camelCase
  if (/^[A-Z][a-z]/.test(s)) score += 1;               // PascalCase
  if (s.length >= 12) score += 2;
  else if (s.length >= 8) score += 1;
  if (s.includes('_') || s.includes('$')) score += 1;
  if (s.length <= 5) score -= 2;                       // 'pode', 'db'
  if (/^(pode|get|set|is|do|run|new|add)$/i.test(s)) score -= 2;
  return score;
}

export const DISTINCTIVE_THRESHOLD = 3;

/**
 * Decide a ferramenta para uma necessidade de evidencia.
 * Entrada: { need, symbol?, library?, scope? }
 */
export function routeTool(q) {
  const need = q.need;

  if (need === 'externalLibraryBehavior') {
    return {
      tool: 'context7',
      reason: 'comportamento de biblioteca de terceiro e sensivel a versao; memoria do modelo e insuficiente',
      rejected: [{ tool: 'serena', why: 'nao conhece codigo externo ao repo' },
                 { tool: 'grep', why: 'a lib nao esta no repo' }]
    };
  }

  // MEDIDO 2026-08-08, e corrigiu a regra anterior: Grep e Serena nao competem
  // pela mesma pergunta. Grep responde "onde e usado"; Serena responde "onde e
  // definido", com kind e faixa de linhas.
  //
  //   simbolo              Grep (usos)          Serena (definicao)
  //   MODELOS_ESCOPADOS    481 B, 3 hits, 0%    241 B, Constant, tenant.js:23-33
  //   registrar          1.816 B, 93% ruido     240 B, Function, auditoria.js:3-29
  //   pode               6.937 B, 84% ruido     240 B, Function, permissoes.js:131-135
  if (need === 'symbolDefinition') {
    return {
      tool: 'serena',
      serenaTool: 'find_symbol',
      reason: 'definicao com kind e faixa de linhas; medido em ~240 B, menor que Grep ate para simbolo distintivo',
      rejected: [{ tool: 'grep', why: 'devolve ocorrencias textuais, nao a definicao' }]
    };
  }

  if (need === 'symbolUsages') {
    const d = symbolDistinctiveness(q.symbol);
    if (d >= DISTINCTIVE_THRESHOLD) {
      return {
        tool: 'grep',
        distinctiveness: d,
        reason: `simbolo distintivo (score ${d}): 481 B medidos com 0% de ruido, e cobre todos os usos`,
        rejected: [{ tool: 'serena', why: 'sem ganho: o ruido do Grep ja e nulo aqui' }]
      };
    }
    return {
      tool: 'serena',
      serenaTool: 'find_referencing_symbols',
      distinctiveness: d,
      reason: `simbolo curto/comum (score ${d}): Grep devolve 84-93% de falso positivo`,
      rejected: [{ tool: 'grep', why: 'ruido medido inviabiliza a leitura' }]
    };
  }

  if (need === 'remoteState') {
    return { tool: 'gh', reason: 'dado que so existe no remoto', rejected: [{ tool: 'git', why: 'nao alcanca o remoto' }] };
  }
  if (need === 'localRepoState') {
    return { tool: 'git', reason: 'estado local; sem rede', rejected: [{ tool: 'gh', why: 'rede desnecessaria' }] };
  }
  if (need === 'staticSecurity') {
    return { tool: 'semgrep', reason: 'mesmos rulesets do CI; relatorio medido em 2.679 B' };
  }
  if (need === 'renderedUI') {
    return { tool: 'playwright', reason: 'exige renderizacao real (viewport, a11y, multi-browser)',
             rejected: [{ tool: 'e2eHarness', why: 'nao cobre viewport nem a11y renderizada' }] };
  }
  if (need === 'flowE2E') {
    return { tool: 'e2eHarness', reason: 'harness proprio ja cobre papeis e mocks, e e mais barato',
             rejected: [{ tool: 'playwright', why: 'custo maior sem ganho para este caso' }] };
  }
  if (need === 'schemaTruth') {
    return { tool: 'repoFiles', reason: 'prisma/schema.prisma e a fonte de verdade versionada',
             rejected: [{ tool: 'supabaseMcp', why: 'banco nao acrescenta quando a pergunta e sobre estrutura' }] };
  }

  return { tool: 'native', reason: 'resolvivel por Read/Grep/Glob/git nativos — caso mais comum' };
}
