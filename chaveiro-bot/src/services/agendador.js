import cron from 'node-cron';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { formatarMoeda } from '../utils/formatar.js';
import { enviarMensagem } from './baileys.js';
import { notificarAdmins } from './notificacao.js';
import { dispararAvaliacoesPendentes } from './avaliacao.js';
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

  // Interino (Fase 1): resumo da empresa dona do grupo configurado.
  // Na Fase 2, o agendador roda por empresa (uma instância Evolution por tenant).
  if (!empresaId) {
    const ew = env.GROUP_JID
      ? await prisma.empresaWhatsapp.findFirst({ where: { grupoJid: env.GROUP_JID }, select: { empresaId: true } })
      : null;
    empresaId = ew?.empresaId
      ?? (await prisma.empresa.findFirst({ orderBy: { id: 'asc' }, select: { id: true } }))?.id
      ?? null;
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
 * Executa o resumo semanal: envia ao grupo WhatsApp e notifica os admins no painel.
 * Tolerante a falhas — um canal não derruba o outro.
 */
export async function executarResumoSemanal() {
  try {
    const { texto, totalServicos, receitaTotal, ranking } = await gerarResumoSemanal();

    if (env.GROUP_JID && !env.GROUP_JID.includes('xxxxxx')) {
      await enviarMensagem(env.GROUP_JID, texto).catch((e) =>
        logger.warn('Falha ao enviar resumo semanal ao grupo', { erro: e.message })
      );
    }

    const destaque = ranking[0]?.tecnico;
    await notificarAdmins({
      tipo: 'resumo',
      titulo: 'Resumo semanal disponível',
      mensagem: `${totalServicos} serviços, ${formatarMoeda(receitaTotal)} líquidos.` +
        (destaque ? ` Destaque: ${destaque}.` : ''),
      link: '/',
    }).catch((e) => logger.warn('Falha ao notificar admins do resumo', { erro: e.message }));

    logger.info('resumo_semanal_enviado', { totalServicos, receitaTotal });
  } catch (erro) {
    logger.error('Erro ao executar resumo semanal', { erro: erro.message });
  }
}

/**
 * Registra os jobs agendados. Chamado uma vez no startup do servidor.
 *  - Resumo semanal: todo domingo às 18h (horário de São Paulo).
 *  - Avaliações: a cada 5 min, dispara as solicitações de avaliação vencidas.
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

  logger.info('Agendamentos iniciados', {
    resumoSemanal: 'domingo 18h ' + TIMEZONE,
    avaliacoes: 'a cada 5 min',
  });
}
