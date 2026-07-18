import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { enviarMensagem } from './whatsapp/gateway.js';
import { variantesTelefone } from './parser.js';

/**
 * Avaliação do cliente após a conclusão de um serviço.
 *
 * Fluxo:
 *  1) Ao concluir um serviço com telefone de cliente, agenda-se uma Avaliacao
 *     com `agendadoPara = agora + reviewDelayHoras` (config por empresa).
 *  2) Um cron varre as pendentes vencidas e envia a solicitação (nota 1–5 + link).
 *  3) A resposta do cliente (1–5) é capturada e gravada; o bot agradece.
 *
 * A fila por due-time (em vez de setTimeout) sobrevive a restarts e é simples
 * de escalar — o cron apenas consulta o banco.
 */

const MAX_TENTATIVAS_TEXTO = 8;

/**
 * Agenda a avaliação de um serviço recém-registrado.
 * Idempotente por servicoId (constraint única). Não falha o registro do serviço.
 */
export async function agendarAvaliacao({ empresaId, servicoId, clienteTelefone, clienteNome }) {
  if (!clienteTelefone) return null;
  try {
    const cfg = await prisma.empresaWhatsapp.findUnique({
      where: { empresaId },
      select: { reviewDelayHoras: true },
    });
    const horas = cfg?.reviewDelayHoras ?? 2;
    const agendadoPara = new Date(Date.now() + horas * 3600_000);

    const aval = await prisma.avaliacao.upsert({
      where: { servicoId },
      create: {
        empresaId,
        servicoId,
        clienteTelefone,
        clienteNome: clienteNome ?? null,
        status: 'pendente',
        agendadoPara,
      },
      update: {}, // já existe → mantém
    });
    logger.info('Avaliação agendada', { empresaId, servicoId, agendadoPara });
    return aval;
  } catch (erro) {
    logger.warn('Falha ao agendar avaliação', { empresaId, servicoId, erro: erro.message });
    return null;
  }
}

/**
 * Dispara as avaliações pendentes cujo horário já chegou.
 * Chamado periodicamente pelo cron. Retorna a contagem enviada.
 */
export async function dispararAvaliacoesPendentes(agora = new Date()) {
  const pendentes = await prisma.avaliacao.findMany({
    where: { status: 'pendente', agendadoPara: { lte: agora } },
    take: 50,
  });
  let enviadas = 0;
  for (const aval of pendentes) {
    try {
      const cfg = await prisma.empresaWhatsapp.findUnique({
        where: { empresaId: aval.empresaId },
        select: { reviewLink: true, reviewAtivo: true, reviewTemplate: true },
      });
      // Respeita o toggle por empresa: se a solicitação está desativada, não envia.
      // Marca como "cancelada" para sair da fila e não tentar de novo a cada ciclo.
      if (cfg && cfg.reviewAtivo === false) {
        await prisma.avaliacao.update({
          where: { id: aval.id },
          data: { status: 'cancelada' },
        });
        continue;
      }
      const texto = montarMensagemSolicitacao(
        aval.clienteNome,
        cfg?.reviewLink,
        cfg?.reviewTemplate
      );
      await enviarMensagem(aval.clienteTelefone, texto);
      await prisma.avaliacao.update({
        where: { id: aval.id },
        data: { status: 'enviada', enviadoEm: new Date() },
      });
      enviadas++;
    } catch (erro) {
      logger.warn('Falha ao enviar avaliação', { avaliacaoId: aval.id, erro: erro.message });
      // permanece "pendente" para nova tentativa no próximo ciclo
    }
  }
  if (enviadas > 0)
    logger.info('Avaliações enviadas', { enviadas, totalPendentes: pendentes.length });
  return enviadas;
}

/**
 * Tenta capturar uma resposta de avaliação vinda de um cliente.
 *
 * Modelo de número único: a busca é GLOBAL por telefone (variantes tolerantes ao 9º
 * dígito) — a empresa vem da própria avaliação encontrada, não de um escopo prévio.
 *
 * @param {string} telefone  Telefone do cliente (JID/formatado/dígitos).
 * @param {string} texto     Texto recebido (a possível nota 1–5).
 * @returns {Promise<{capturado:boolean, resposta?:string}>}
 *   capturado=true se o número tinha avaliação aguardando resposta (a msg foi
 *   consumida como nota); resposta = texto a enviar de volta ao cliente.
 */
export async function tentarCapturarResposta(telefone, texto) {
  const variantes = variantesTelefone(telefone);
  if (!variantes.length) return { capturado: false };
  const aval = await prisma.avaliacao.findFirst({
    where: { clienteTelefone: { in: variantes }, status: 'enviada' },
    orderBy: { enviadoEm: 'desc' },
  });
  if (!aval) return { capturado: false };

  const nota = extrairNota(texto);
  if (nota == null) {
    return {
      capturado: true,
      resposta:
        `🙏 Para avaliar, responda com um número de *1 a 5*.\n` + `1 = muito ruim, 5 = excelente.`,
    };
  }

  await prisma.avaliacao.update({
    where: { id: aval.id },
    data: {
      nota,
      status: 'respondida',
      respondidoEm: new Date(),
      comentario: texto.trim().slice(0, 500),
    },
  });
  logger.info('Avaliação respondida', { avaliacaoId: aval.id, nota });

  const agradecimento =
    nota >= 4
      ? `⭐ Muito obrigado pela nota *${nota}*! Ficamos felizes em atender você. 💙`
      : `Obrigado pela sua nota *${nota}*. Sua opinião nos ajuda a melhorar. 🙏`;
  return { capturado: true, resposta: agradecimento };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function montarMensagemSolicitacao(clienteNome, reviewLink, template = null) {
  // Template customizado por empresa: aceita os placeholders {nome} e {link}.
  if (template && template.trim()) {
    return template
      .replaceAll('{nome}', clienteNome ?? '')
      .replaceAll('{link}', reviewLink ?? '')
      .trim();
  }
  const saudacao = clienteNome ? `Olá, ${clienteNome}!` : 'Olá!';
  const linhas = [
    `${saudacao} 👋`,
    `Concluímos seu atendimento e gostaríamos de saber como foi.`,
    ``,
    `*Como você avalia nosso serviço?*`,
    `Responda com um número de *1 a 5* (5 = excelente).`,
  ];
  if (reviewLink) {
    linhas.push(``, `Se puder, deixe também uma avaliação aqui: ${reviewLink} 🙏`);
  }
  return linhas.join('\n');
}

/** Extrai uma nota 1–5 de um texto (aceita "5", "nota 5", "5 estrelas", "⭐⭐⭐"). */
function extrairNota(texto) {
  const t = (texto ?? '').trim();
  // número isolado 1–5
  const m = t.match(/\b([1-5])\b/);
  if (m) return parseInt(m[1]);
  // estrelas emoji
  const estrelas = (t.match(/⭐|★/g) || []).length;
  if (estrelas >= 1 && estrelas <= 5) return estrelas;
  return null;
}

export const _internal = { extrairNota, montarMensagemSolicitacao, MAX_TENTATIVAS_TEXTO };
