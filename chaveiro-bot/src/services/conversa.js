import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { converterValor } from './parser.js';

/**
 * Máquina de estados da conversa privada de registro de serviço.
 *
 * Fluxo: o técnico manda "serviço" no privado do robô → o bot pergunta um campo
 * por vez, valida cada resposta, e ao final confirma e registra o serviço,
 * postando o resumo no grupo da empresa.
 *
 * Comandos globais (em qualquer passo):
 *   - "cancelar" → encerra a sessão sem registrar
 *   - "voltar"   → retorna ao passo anterior
 *
 * Estado persistido em SessaoConversa (sobrevive a restart / escala horizontal).
 * A sessão expira após INATIVIDADE_MIN minutos sem interação.
 */

const INATIVIDADE_MIN = 30;
const GATILHO = /^\s*servi[çc]o\s*$/i;

/**
 * Normaliza um telefone brasileiro para o formato que a Evolution aceita ao
 * enviar mensagens: "55" + DDD (2) + número (8 ou 9 dígitos).
 * Aceita entradas com DDD (10/11 dígitos) ou já com o 55 (12/13 dígitos).
 * @returns {string|null} número normalizado ou null se inválido
 */
export function normalizarTelefoneBR(txt) {
  const d = String(txt ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return '55' + d;           // DDD + número
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d; // já com 55
  return null;
}

// Opções de "Local" como menu numerado.
const LOCAIS = ['Casa do cliente', 'Contrato', 'Ponto da loja', 'Outro'];

// ── Definição dos passos ──────────────────────────────────────────────────────
// Cada passo: id, pergunta(dados), validar(texto) → { ok, valor?, erro? }, campo.
const PASSOS = [
  {
    id: 'local',
    pergunta: () =>
      `📍 *Qual o local do serviço?*\nResponda com o número:\n` +
      LOCAIS.map((l, i) => `${i + 1}. ${l}`).join('\n'),
    validar: (txt) => {
      const n = parseInt(txt.trim());
      if (n >= 1 && n <= LOCAIS.length) return { ok: true, valor: LOCAIS[n - 1] };
      // aceita também o nome digitado
      const achado = LOCAIS.find((l) => l.toLowerCase() === txt.trim().toLowerCase());
      if (achado) return { ok: true, valor: achado };
      return { ok: false, erro: `Escolha um número de 1 a ${LOCAIS.length}.` };
    },
  },
  {
    id: 'endereco',
    pergunta: () => `🏠 *Qual o endereço?*\n(ou digite "N/A" se não se aplica)`,
    validar: (txt) => {
      const t = txt.trim();
      return { ok: true, valor: t.toUpperCase() === 'N/A' ? null : t };
    },
  },
  {
    id: 'descricao',
    pergunta: () => `🔧 *O que foi feito?*\nDescreva o serviço.`,
    validar: (txt) => {
      const t = txt.trim();
      if (t.length < 3) return { ok: false, erro: 'Descreva com um pouco mais de detalhe.' };
      return { ok: true, valor: t };
    },
  },
  {
    id: 'material',
    pergunta: () =>
      `🧰 *Usou algum material?*\nInforme nome e quantidade (ex.: "Fechadura Tetra x2").\n` +
      `Digite "Nenhum" se não usou.`,
    validar: (txt) => {
      const t = txt.trim();
      return { ok: true, valor: t.toLowerCase() === 'nenhum' ? null : t };
    },
  },
  {
    id: 'valorCobrado',
    pergunta: () => `💰 *Quanto foi cobrado do cliente?*\nEx.: 150 ou 150,00`,
    validar: (txt) => {
      const v = converterValor(txt);
      if (v <= 0) return { ok: false, erro: 'Informe um valor maior que zero (ex.: 150).' };
      return { ok: true, valor: v };
    },
  },
  {
    id: 'clienteNome',
    pergunta: () => `🙋 *Qual o nome do cliente atendido?*`,
    validar: (txt) => {
      const t = txt.trim();
      if (t.length < 2) return { ok: false, erro: 'Informe o nome do cliente.' };
      return { ok: true, valor: t };
    },
  },
  {
    id: 'clienteTelefone',
    pergunta: () =>
      `📱 *Qual o telefone do cliente?*\n` +
      `(com DDD — usaremos para pedir a avaliação depois)`,
    validar: (txt) => {
      const tel = normalizarTelefoneBR(txt);
      if (!tel) {
        return { ok: false, erro: 'Telefone inválido. Envie com DDD, ex.: 11999990000.' };
      }
      return { ok: true, valor: tel };
    },
  },
  {
    id: 'foto',
    pergunta: () => `📷 *Envie a foto do serviço* (evidência).\nOu digite "pular" se não tiver.`,
    aceitaImagem: true,
    validar: (txt, imagemUrl) => {
      if (imagemUrl) return { ok: true, valor: imagemUrl };
      if (txt && txt.trim().toLowerCase() === 'pular') return { ok: true, valor: null };
      return { ok: false, erro: 'Envie uma foto ou digite "pular".' };
    },
  },
  {
    id: 'confirmar',
    pergunta: (d) => montarResumoConfirmacao(d),
    validar: (txt) => {
      const t = txt.trim().toLowerCase();
      if (['sim', 's', 'confirmar', 'ok', 'confirmo'].includes(t)) return { ok: true, valor: 'sim' };
      if (['nao', 'não', 'n', 'cancelar'].includes(t)) return { ok: true, valor: 'nao' };
      return { ok: false, erro: 'Responda *sim* para confirmar ou *não* para cancelar.' };
    },
  },
];

const IDX = Object.fromEntries(PASSOS.map((p, i) => [p.id, i]));

function montarResumoConfirmacao(d) {
  const linhas = [
    `📋 *Confira o serviço:*`,
    `📍 Local: ${d.local}`,
    d.endereco ? `🏠 Endereço: ${d.endereco}` : null,
    `🔧 Serviço: ${d.descricao}`,
    d.material ? `🧰 Material: ${d.material}` : `🧰 Material: Nenhum`,
    `💰 Cobrado: R$ ${Number(d.valorCobrado).toFixed(2).replace('.', ',')}`,
    `🙋 Cliente: ${d.clienteNome}`,
    `📱 Telefone: ${d.clienteTelefone}`,
    d.foto ? `📷 Foto: anexada` : `📷 Foto: nenhuma`,
    ``,
    `Está tudo certo? Responda *sim* para registrar ou *não* para cancelar.`,
  ].filter(Boolean);
  return linhas.join('\n');
}

/** Detecta se o texto é o gatilho de início de fluxo ("serviço"). */
export function ehGatilho(texto) {
  return GATILHO.test(texto ?? '');
}

/** Carrega a sessão ativa (não expirada) de um JID na empresa. */
export async function carregarSessao(empresaId, jid) {
  const s = await prisma.sessaoConversa.findUnique({
    where: { empresaId_jid: { empresaId, jid } },
  });
  if (!s) return null;
  const limite = Date.now() - INATIVIDADE_MIN * 60_000;
  if (new Date(s.atualizadoEm).getTime() < limite) {
    await prisma.sessaoConversa.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s;
}

async function salvarSessao(empresaId, jid, tecnicoId, estadoAtual, dadosParciais) {
  return prisma.sessaoConversa.upsert({
    where: { empresaId_jid: { empresaId, jid } },
    create: { empresaId, jid, tecnicoId, estadoAtual, dadosParciais },
    update: { estadoAtual, dadosParciais, tecnicoId },
  });
}

async function encerrarSessao(empresaId, jid) {
  await prisma.sessaoConversa.deleteMany({ where: { empresaId, jid } }).catch(() => {});
}

/**
 * Processa UMA mensagem inbound no privado.
 *
 * @param {object} ctx
 * @param {number} ctx.empresaId
 * @param {string} ctx.jid               JID do técnico
 * @param {object|null} ctx.tecnico      Técnico identificado (ou null se não cadastrado)
 * @param {string} ctx.texto             Texto da mensagem (pode ser '')
 * @param {string|null} ctx.imagemUrl    URL da foto já salva (se a msg trouxe imagem)
 * @param {(texto:string)=>Promise} ctx.responder   Envia resposta ao técnico
 * @param {(dados:object)=>Promise} ctx.concluir     Registra o serviço (recebe os dados coletados)
 * @returns {Promise<{tratado:boolean}>}  tratado=true se a mensagem pertenceu a um fluxo
 */
export async function processarMensagemPrivada(ctx) {
  const { empresaId, jid, tecnico, texto = '', imagemUrl = null, responder, concluir } = ctx;
  const txt = (texto ?? '').trim();
  const sessao = await carregarSessao(empresaId, jid);

  // ── Início de fluxo ──────────────────────────────────────────────────────
  if (!sessao) {
    if (!ehGatilho(txt)) return { tratado: false };
    if (!tecnico) {
      await responder(
        `⚠️ Seu número não está cadastrado como técnico nesta empresa.\n` +
        `Peça ao administrador para cadastrá-lo no painel.`
      );
      return { tratado: true };
    }
    const primeiro = PASSOS[0];
    await salvarSessao(empresaId, jid, tecnico.id, primeiro.id, {});
    await responder(
      `👋 Olá, ${tecnico.nome}! Vamos registrar um serviço.\n` +
      `A qualquer momento digite *cancelar* para sair.\n\n` + primeiro.pergunta({})
    );
    return { tratado: true };
  }

  // ── Comandos globais ──────────────────────────────────────────────────────
  const cmd = txt.toLowerCase();
  if (cmd === 'cancelar') {
    await encerrarSessao(empresaId, jid);
    await responder(`❌ Registro cancelado. Quando quiser, mande *serviço* para começar de novo.`);
    return { tratado: true };
  }

  const dados = sessao.dadosParciais ?? {};
  let idxAtual = IDX[sessao.estadoAtual] ?? 0;
  const passoAtual = PASSOS[idxAtual];

  if (cmd === 'voltar') {
    if (idxAtual === 0) {
      await responder(`Você já está no primeiro passo.\n\n${passoAtual.pergunta(dados)}`);
      return { tratado: true };
    }
    const anterior = PASSOS[idxAtual - 1];
    delete dados[anterior.id];
    await salvarSessao(empresaId, jid, sessao.tecnicoId, anterior.id, dados);
    await responder(`↩️ Voltando.\n\n${anterior.pergunta(dados)}`);
    return { tratado: true };
  }

  // ── Validação da resposta do passo atual ──────────────────────────────────
  const resultado = passoAtual.validar(txt, imagemUrl);
  if (!resultado.ok) {
    await responder(`⚠️ ${resultado.erro}\n\n${passoAtual.pergunta(dados)}`);
    return { tratado: true };
  }

  // Passo de confirmação
  if (passoAtual.id === 'confirmar') {
    if (resultado.valor === 'nao') {
      await encerrarSessao(empresaId, jid);
      await responder(`❌ Registro cancelado.`);
      return { tratado: true };
    }
    // Confirmado → registra
    try {
      await concluir({ ...dados, tecnicoId: sessao.tecnicoId });
      await encerrarSessao(empresaId, jid);
    } catch (e) {
      logger.error('Falha ao concluir registro via conversa', { erro: e.message });
      await responder(`⚠️ Não consegui registrar o serviço agora. Tente novamente em instantes.`);
    }
    return { tratado: true };
  }

  // Demais passos: salva valor e avança
  dados[passoAtual.id] = resultado.valor;
  const proximo = PASSOS[idxAtual + 1];
  await salvarSessao(empresaId, jid, sessao.tecnicoId, proximo.id, dados);
  await responder(proximo.pergunta(dados));
  return { tratado: true };
}

// Exporta utilidades para testes
export const _internal = { PASSOS, LOCAIS, montarResumoConfirmacao };
