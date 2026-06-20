import cron from 'node-cron';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { formatarMoeda } from '../utils/formatar.js';
import { enviarMensagem } from './whatsapp/gateway.js';
import { notificarAdmins } from './notificacao.js';
import { dispararAvaliacoesPendentes } from './avaliacao.js';
import { renovarToken } from './google/oauth.js';
import { listarReviews } from './google/businessClient.js';
import { analisarNovas } from './google/analise.js';
import { env } from '../config/env.js';

const TIMEZONE = 'America/Sao_Paulo';

/**
 * Calcula o intervalo da semana corrente (domingo 00:00 → agora),
 * consistente com o filtro "semana" do dashboard.
 */
function intervaloSemana(agora = new Date()) {
  const inicio = new Date(agora);
  inicio.setHours(0, 0, 0, 0);
  inicio.setDate(inicio.getDate() - inicio.getDay()); // volta ao domingo
  return { inicio, fim: agora };
}

/**
 * Monta o ranking semanal por técnico (receita líquida, nº de serviços)
 * e o destaque do melhor desempenho. Núcleo puro/testável da automação.
 *
 * @returns {Promise<{ texto: string, totalServicos: number, receitaTotal: number, ranking: object[] }>}
 */
export async function gerarResumoSemanal(agora = new Date(), empresaId = null) {
  const { inicio, fim } = intervaloSemana(agora);

  // Sem empresa explícita, usa a primeira (fallback de compatibilidade). O envio
  // por grupo (executarResumoSemanal) sempre passa o empresaId de cada tenant.
  if (!empresaId) {
    empresaId = (await prisma.empresa.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }))?.id ?? null;
  }

  const servicos = await prisma.servico.findMany({
    where: { ...(empresaId ? { empresaId } : {}), criadoEm: { gte: inicio, lte: fim } },
    include: { tecnico: { select: { nome: true } } },
  });

  const porTecnico = {};
  for (const s of servicos) {
    const nome = s.tecnico?.nome ?? 'Sem técnico';
    if (!porTecnico[nome]) porTecnico[nome] = { tecnico: nome, servicos: 0, receitaLiquida: 0 };
    porTecnico[nome].servicos++;
    porTecnico[nome].receitaLiquida += s.valorLiquido;
  }

  const ranking = Object.values(porTecnico).sort((a, b) => b.receitaLiquida - a.receitaLiquida);
  const receitaTotal = servicos.reduce((acc, s) => acc + s.valorLiquido, 0);

  const dataBR = (d) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TIMEZONE }).format(d);

  const linhas = [
    `📊 *RESUMO DA SEMANA*`,
    `🗓️ ${dataBR(inicio)} a ${dataBR(fim)}`,
    ``,
    `📦 Total de serviços: ${servicos.length}`,
    `💵 Receita líquida: ${formatarMoeda(receitaTotal)}`,
  ];

  if (ranking.length > 0) {
    linhas.push(``, `🏆 *Ranking por técnico:*`);
    ranking.forEach((r, i) => {
      const medalha = ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`;
      linhas.push(`${medalha} ${r.tecnico} — ${formatarMoeda(r.receitaLiquida)} (${r.servicos} serv.)`);
    });
    linhas.push(``, `⭐ Destaque: *${ranking[0].tecnico}*`);
  } else {
    linhas.push(``, `Nenhum serviço registrado nesta semana.`);
  }

  return {
    texto: linhas.join('\n'),
    totalServicos: servicos.length,
    receitaTotal,
    ranking,
  };
}

/**
 * Executa o resumo semanal por empresa: para cada empresa com um `grupoJid`
 * configurado, gera o resumo e envia ao grupo pelo robô de número único; em seguida
 * notifica os admins da empresa no painel. Empresas sem grupo são puladas (mas seus
 * admins continuam recebendo a notificação). Tolerante a falhas — uma empresa ou um
 * canal não derruba os demais.
 */
export async function executarResumoSemanal() {
  try {
    // Settings por empresa ficam em EmpresaWhatsapp; só envia ao grupo quem tem um.
    const empresas = await prisma.empresaWhatsapp.findMany({
      where: { grupoJid: { not: null } },
      select: { empresaId: true, grupoJid: true },
    });

    for (const { empresaId, grupoJid } of empresas) {
      try {
        const { texto, totalServicos, receitaTotal, ranking } = await gerarResumoSemanal(new Date(), empresaId);

        if (grupoJid && !grupoJid.includes('xxxxxx')) {
          await enviarMensagem(grupoJid, texto).catch((e) =>
            logger.warn('Falha ao enviar resumo semanal ao grupo', { empresaId, erro: e.message })
          );
        }

        const destaque = ranking[0]?.tecnico;
        await notificarAdmins({
          empresaId,
          tipo: 'resumo',
          titulo: 'Resumo semanal disponível',
          mensagem: `${totalServicos} serviços, ${formatarMoeda(receitaTotal)} líquidos.` +
            (destaque ? ` Destaque: ${destaque}.` : ''),
          link: '/',
        }).catch((e) => logger.warn('Falha ao notificar admins do resumo', { empresaId, erro: e.message }));

        logger.info('resumo_semanal_enviado', { empresaId, totalServicos, receitaTotal });
      } catch (erro) {
        logger.error('Erro ao executar resumo semanal de uma empresa', { empresaId, erro: erro.message });
      }
    }
  } catch (erro) {
    logger.error('Erro ao executar resumo semanal', { erro: erro.message });
  }
}

// ── Retenção LGPD ─────────────────────────────────────────────────────────────
// Anonimiza dados pessoais antigos e limpa sessões de conversa obsoletas. Roda
// sobre TODAS as empresas (manutenção do sistema) — usa o prisma global de propósito.
const RETENCAO_AVALIACAO_DIAS = 180; // após isso, anonimiza a PII do cliente na avaliação
const RETENCAO_SESSAO_DIAS = 7;      // sessões de conversa mais antigas são removidas
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Aplica a política de retenção (LGPD): remove sessões de conversa antigas e
 * anonimiza a PII de avaliações além do período de retenção. Idempotente.
 * @returns {Promise<{ sessoesRemovidas: number, avaliacoesAnonimizadas: number }>}
 */
export async function limparDadosAntigos(agora = new Date()) {
  const corteSessao = new Date(agora.getTime() - RETENCAO_SESSAO_DIAS * UM_DIA_MS);
  const corteAval = new Date(agora.getTime() - RETENCAO_AVALIACAO_DIAS * UM_DIA_MS);
  try {
    const sessoes = await prisma.sessaoConversa.deleteMany({ where: { atualizadoEm: { lt: corteSessao } } });
    const avaliacoes = await prisma.avaliacao.updateMany({
      where: { criadoEm: { lt: corteAval }, clienteTelefone: { not: '' } },
      data: { clienteTelefone: '', clienteNome: null, comentario: null },
    });
    logger.info('limpeza_lgpd', { sessoesRemovidas: sessoes.count, avaliacoesAnonimizadas: avaliacoes.count });
    return { sessoesRemovidas: sessoes.count, avaliacoesAnonimizadas: avaliacoes.count };
  } catch (erro) {
    logger.error('Erro na limpeza LGPD', { erro: erro.message });
    return { sessoesRemovidas: 0, avaliacoesAnonimizadas: 0 };
  }
}

// ── Sincronização das avaliações do Google (a cada 6h) ────────────────────────
// Para cada GoogleConta: renova o token se preciso, lista as avaliações desde o
// último sincronizadoEm, faz upsert por reviewId (só novos) e dispara a análise por
// IA das avaliações ainda não analisadas. Tolerante a falhas por empresa.
export async function sincronizarAvaliacoesGoogle() {
  // Só roda com a integração ligada (com a flag off, listarReviews devolveria mocks).
  if (env.GOOGLE_REVIEWS_ENABLED !== 'true') return { empresas: 0, novas: 0 };

  const contas = await prisma.googleConta.findMany({
    where: { accountId: { not: null }, locationId: { not: null } },
    select: { empresaId: true },
  });
  let totalNovas = 0;
  for (const { empresaId } of contas) {
    try {
      await renovarToken(empresaId);
      // Marca de água: a avaliação mais recente já sincronizada (sync incremental).
      const ultima = await prisma.avaliacaoGoogle.findFirst({
        where: { empresaId },
        orderBy: { criadoEmGoogle: 'desc' },
        select: { criadoEmGoogle: true },
      });
      const { reviews, mock } = await listarReviews(empresaId, { desde: ultima?.criadoEmGoogle ?? null });
      if (mock) continue; // sem credenciais reais — não persiste fixtures
      for (const r of reviews) {
        if (!r.reviewId) continue;
        await prisma.avaliacaoGoogle.upsert({
          where: { reviewId: r.reviewId },
          create: {
            empresaId,
            reviewId: r.reviewId,
            autorNome: r.autorNome ?? null,
            nota: r.nota ?? null,
            comentario: r.comentario ?? null,
            criadoEmGoogle: r.criadoEmGoogle ?? null,
          },
          update: {
            // Atualiza nota/comentário (o autor pode editar a avaliação no Google).
            nota: r.nota ?? null,
            comentario: r.comentario ?? null,
            sincronizadoEm: new Date(),
          },
        });
        totalNovas++;
      }
      // Análise por IA das novas (no-op se ANTHROPIC_API_KEY ausente).
      await analisarNovas(empresaId);
    } catch (erro) {
      logger.warn('Falha na sincronização Google de uma empresa', { empresaId, erro: erro.message });
    }
  }
  if (totalNovas > 0) logger.info('Sync Google concluída', { empresas: contas.length, novas: totalNovas });
  return { empresas: contas.length, novas: totalNovas };
}

/**
 * Registra os jobs agendados. Chamado uma vez no startup do servidor.
 *  - Resumo semanal: todo domingo às 18h (horário de São Paulo).
 *  - Avaliações: a cada 5 min, dispara as solicitações de avaliação vencidas.
 *  - Sync Google: a cada 6h, sincroniza avaliações do Google e roda a análise por IA.
 *  - Retenção LGPD: diariamente às 03:30, anonimiza/limpa dados antigos.
 */
export function iniciarAgendamentos() {
  cron.schedule('0 18 * * 0', executarResumoSemanal, { timezone: TIMEZONE });

  cron.schedule('*/5 * * * *', async () => {
    try {
      await dispararAvaliacoesPendentes();
    } catch (erro) {
      logger.error('Erro ao disparar avaliações pendentes', { erro: erro.message });
    }
  }, { timezone: TIMEZONE });

  cron.schedule('30 3 * * *', limparDadosAntigos, { timezone: TIMEZONE });

  // Sync das avaliações do Google a cada 6h (no-op se a flag estiver desligada).
  cron.schedule('0 */6 * * *', async () => {
    try {
      await sincronizarAvaliacoesGoogle();
    } catch (erro) {
      logger.error('Erro na sincronização Google', { erro: erro.message });
    }
  }, { timezone: TIMEZONE });

  logger.info('Agendamentos iniciados', {
    resumoSemanal: 'domingo 18h ' + TIMEZONE,
    avaliacoes: 'a cada 5 min',
    syncGoogle: 'a cada 6h',
    limpezaLgpd: 'diária 03:30 ' + TIMEZONE,
  });
}
