/**
 * T-BILL-07 — backfill de Assinatura para empresas pré-paywall.  [F6-05 · Gate 5 re-escopado]
 *
 * POR QUE EXISTE
 *   O paywall (middlewares/assinatura.js) trata ausência de Assinatura como SEM acesso (402
 *   SEM_ASSINATURA, fail-closed) — correto para dado novo, mas empresas criadas ANTES do
 *   paywall ficariam trancadas no deploy. Este script dá a cada uma um registro determinável.
 *
 * POLÍTICA É DECISÃO DE NEGÓCIO (D2) — por isso é parâmetro, nunca default silencioso:
 *   --politica trial-novo         trialing até agora+TRIAL_DIAS (justo para quem já usava;
 *                                 todo mundo ganha o mesmo período a partir da virada)
 *   --politica trial-do-cadastro  trialing até criadoEm+TRIAL_DIAS (historicamente honesto;
 *                                 empresas antigas podem cair direto no paywall)
 *
 * SEGURANÇA DE OPERAÇÃO
 *   Dry-run é o DEFAULT: sem --aplicar o banco não é tocado e o relatório sai igual.
 *   Idempotente: só cria onde NÃO existe Assinatura (skipDuplicates + where explícito).
 *   EXECUÇÃO EM PRODUÇÃO É D2 — exige autorização explícita do usuário (contrato, Gate 5).
 *
 * Uso:  node scripts/backfill-assinaturas.mjs [--politica trial-novo] [--aplicar]
 */
import { prisma } from '../src/db/prisma.js';
import { TRIAL_DIAS } from '../src/services/billing.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const POLITICAS = new Set(['trial-novo', 'trial-do-cadastro']);

export function trialFimPara(politica, criadoEm, agora = new Date()) {
  const base = politica === 'trial-do-cadastro' ? criadoEm : agora;
  return new Date(base.getTime() + TRIAL_DIAS * DIA_MS);
}

export async function levantarPendentes(db = prisma) {
  // Empresas cujo empresaId NÃO aparece em Assinatura — o estado que o paywall trata como 402.
  const empresas = await db.empresa.findMany({
    select: { id: true, nome: true, criadoEm: true, assinatura: { select: { id: true } } },
    orderBy: { id: 'asc' },
  });
  return empresas.filter((e) => !e.assinatura);
}

export async function aplicarBackfill(pendentes, politica, db = prisma, agora = new Date()) {
  const linhas = pendentes.map((e) => ({
    empresaId: e.id,
    status: 'trialing',
    trialFimEm: trialFimPara(politica, e.criadoEm, agora),
  }));
  // createMany + skipDuplicates: se uma assinatura nasceu entre o levantamento e a aplicação
  // (cadastro concorrente), a linha dela é ignorada — nunca sobrescrevemos estado existente.
  const r = await db.assinatura.createMany({ data: linhas, skipDuplicates: true });
  return r.count;
}

async function principal() {
  const argv = process.argv.slice(2);
  const aplicar = argv.includes('--aplicar');
  const iPol = argv.indexOf('--politica');
  const politica = iPol >= 0 ? argv[iPol + 1] : 'trial-novo';
  if (!POLITICAS.has(politica)) {
    console.error(`Política inválida: ${politica}. Use: ${[...POLITICAS].join(' | ')}`);
    process.exit(2);
  }

  const agora = new Date();
  const pendentes = await levantarPendentes();
  console.log(`Empresas sem Assinatura: ${pendentes.length}`);
  for (const e of pendentes) {
    const fim = trialFimPara(politica, e.criadoEm, agora);
    const vencido = fim <= agora ? '  << trial já VENCIDO nesta política' : '';
    console.log(
      `  #${e.id} ${JSON.stringify(e.nome)} criada=${e.criadoEm.toISOString().slice(0, 10)} ` +
        `-> trialing até ${fim.toISOString().slice(0, 10)}${vencido}`
    );
  }

  if (!aplicar) {
    console.log(`\nDRY-RUN (default): nada foi escrito. Política: ${politica}.`);
    console.log('Para aplicar: --aplicar (produção exige autorização explícita — Gate 5/D2).');
    return;
  }
  const criadas = await aplicarBackfill(pendentes, politica, prisma, agora);
  console.log(`\nAPLICADO: ${criadas} assinatura(s) criada(s) com política ${politica}.`);
}

// Só roda como CLI; importado (testes) não executa nada.
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() ?? '')) {
  principal()
    .catch((e) => {
      console.error('Backfill falhou:', e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
