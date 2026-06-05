import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { normalizarTelefone } from './parser.js';
import { processarMensagemPrivada } from './conversa.js';
import { resolverMateriaisDoServico } from './catalogo.js';
import { registrarServico, formatarData, formatarMoeda } from './servico.js';
import { enviarMensagemEmpresa } from './whatsapp/gateway.js';
import { agendarAvaliacao, tentarCapturarResposta } from './avaliacao.js';

const UPLOADS_DIR = path.resolve('./uploads');

/**
 * Roteia um evento MESSAGES_UPSERT da Evolution para o fluxo de conversa privada.
 *
 * Só trata mensagens:
 *   - recebidas (não enviadas por nós: fromMe = false)
 *   - de chat PRIVADO (remoteJid termina em @s.whatsapp.net, não @g.us)
 *
 * @param {number} empresaId
 * @param {object} evento  Evento já validado (shape Evolution v2)
 */
export async function rotearMensagemInbound(empresaId, evento) {
  const msg = extrairMensagem(evento);
  if (!msg) return { tratado: false };

  // Ignora mensagens nossas e mensagens de grupo (registro é só no privado)
  if (msg.fromMe) return { tratado: false };
  if (msg.remoteJid.endsWith('@g.us')) return { tratado: false };
  if (!msg.remoteJid.endsWith('@s.whatsapp.net')) return { tratado: false };

  const telefone = normalizarTelefone(msg.remoteJid);
  const tecnico = await prisma.tecnico.findFirst({ where: { empresaId, telefone } });

  const responder = (texto) => enviarMensagemEmpresa(empresaId, msg.remoteJid, texto);

  // Captura de avaliação: se este número tem uma avaliação ENVIADA aguardando
  // resposta e NÃO está no meio de um fluxo de registro de técnico, tratamos a
  // mensagem como a nota do cliente. (Técnico em fluxo ativo tem prioridade.)
  const sessaoAtiva = await prisma.sessaoConversa.findUnique({
    where: { empresaId_jid: { empresaId, jid: msg.remoteJid } },
    select: { id: true },
  });
  if (!sessaoAtiva) {
    const captura = await tentarCapturarResposta(empresaId, telefone, msg.texto);
    if (captura.capturado) {
      if (captura.resposta) await responder(captura.resposta);
      return { tratado: true };
    }
  }

  // Foto: se a mensagem trouxe imagem em base64, salva e gera URL pública
  const imagemUrl = msg.imagemBase64 ? await salvarFotoBase64(msg.imagemBase64, msg.mimetype) : null;

  const concluir = (dados) => concluirRegistro(empresaId, msg.remoteJid, tecnico, dados, responder);

  return processarMensagemPrivada({
    empresaId,
    jid: msg.remoteJid,
    tecnico,
    texto: msg.texto,
    imagemUrl,
    responder,
    concluir,
  });
}

/**
 * Registra o serviço a partir dos dados coletados na conversa, resolve materiais
 * no catálogo, posta o resumo no grupo da empresa e confirma ao técnico.
 */
async function concluirRegistro(empresaId, jidTecnico, tecnico, dados, responder) {
  // Resolve materiais no catálogo (mesma regra do fluxo de grupo)
  let itens = [], naoEncontrados = [], valorMaterial = 0;
  if (dados.material) {
    const r = await resolverMateriaisDoServico(dados.material, empresaId);
    itens = r.itens; naoEncontrados = r.naoEncontrados; valorMaterial = r.valorMaterialTotal;
  }
  if (naoEncontrados.length > 0) {
    const lista = naoEncontrados.map((n) => `• ${n}`).join('\n');
    await responder(
      `⚠️ Não registrei o serviço.\nMateriais fora do catálogo:\n${lista}\n\n` +
      `Cadastre-os no app (tela *Materiais*) e mande *serviço* de novo.`
    );
    throw new Error('material fora do catálogo');
  }

  const valorCobrado = Number(dados.valorCobrado);
  const valorLiquido = valorCobrado - valorMaterial;
  const comissaoGerada = valorLiquido * ((tecnico?.comissao ?? 0) / 100);
  const materialTexto = itens.length > 0 ? itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ') : null;

  const servico = await registrarServico({
    empresaId,
    tecnicoId: tecnico.id,
    local: dados.local,
    endereco: dados.endereco ?? null,
    descricao: dados.descricao,
    material: materialTexto,
    valorCobrado,
    valorMaterial,
    valorLiquido,
    comissaoGerada,
    fotoEvidencia: dados.foto ?? null,
    clienteNome: dados.clienteNome ?? null,
    clienteTelefone: dados.clienteTelefone ?? null,
    msgOriginal: 'REGISTRO_PRIVADO',
    remetenteWpp: normalizarTelefone(jidTecnico),
    itensCatalogo: itens.map((i) => ({ materialId: i.materialId, quantidade: i.quantidade })),
  });

  // Agenda a solicitação de avaliação ao cliente (após reviewDelayHoras da empresa)
  if (dados.clienteTelefone) {
    await agendarAvaliacao({
      empresaId,
      servicoId: servico.id,
      clienteTelefone: dados.clienteTelefone,
      clienteNome: dados.clienteNome ?? null,
    }).catch((e) => logger.warn('Falha ao agendar avaliação', { erro: e.message }));
  }

  // Confirma ao técnico no privado
  await responder(
    `✅ Serviço registrado com sucesso!\n` +
    `💵 Líquido: ${formatarMoeda(valorLiquido)}` +
    (tecnico?.comissao > 0 ? `\n🤝 Sua comissão: ${formatarMoeda(comissaoGerada)}` : '') +
    `\n\nA avaliação será enviada ao cliente automaticamente. Obrigado!`
  );

  // Posta o resumo no grupo escolhido pela empresa (se configurado)
  const cfg = await prisma.empresaWhatsapp.findUnique({
    where: { empresaId }, select: { grupoJid: true },
  });
  if (cfg?.grupoJid) {
    const resumo = montarResumoGrupo({ tecnico, dados, valorCobrado, valorMaterial, valorLiquido, comissaoGerada, itens, servico });
    await enviarMensagemEmpresa(empresaId, cfg.grupoJid, resumo).catch((e) =>
      logger.warn('Falha ao postar resumo no grupo', { empresaId, erro: e.message })
    );
  } else {
    logger.info('Sem grupo configurado — resumo não postado', { empresaId });
  }

  logger.info('Serviço registrado via conversa privada', { empresaId, servicoId: servico.id, tecnicoId: tecnico.id });
  return servico;
}

function montarResumoGrupo({ tecnico, dados, valorCobrado, valorMaterial, valorLiquido, comissaoGerada, itens, servico }) {
  const linhasMateriais = itens.length > 0
    ? itens.map((i) => `   • ${i.quantidade}x ${i.nome} — ${formatarMoeda(i.valorTotal)}`)
    : [];
  return [
    `✅ *SERVIÇO CONCLUÍDO*`,
    `👷 Técnico: ${tecnico.nome}`,
    `📍 Local: ${dados.local}`,
    dados.endereco ? `🏠 Endereço: ${dados.endereco}` : null,
    `🔧 ${dados.descricao}`,
    `🙋 Cliente: ${dados.clienteNome}`,
    `💰 Cobrado: ${formatarMoeda(valorCobrado)}`,
    `🔧 Material: ${formatarMoeda(valorMaterial)}`,
    ...linhasMateriais,
    `💵 Líquido: ${formatarMoeda(valorLiquido)}`,
    tecnico.comissao > 0 ? `🤝 Comissão (${tecnico.comissao}%): ${formatarMoeda(comissaoGerada)}` : null,
    dados.foto ? `📷 Foto de evidência anexada` : null,
    `🕐 ${formatarData(servico.criadoEm)}`,
  ].filter(Boolean).join('\n');
}

// ── Extração do payload Evolution v2 ──────────────────────────────────────────
function extrairMensagem(evento) {
  // Evolution envia data como objeto único ou array de mensagens
  const data = evento?.data;
  const item = Array.isArray(data) ? data[0] : data;
  if (!item?.key) return null;

  const message = item.message ?? {};
  const texto = (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    ''
  ).trim();

  const img = message.imageMessage;
  // Com base64:true, a Evolution inclui o conteúdo em base64 no próprio item
  const imagemBase64 = img ? (item.message?.base64 || item.base64 || null) : null;

  return {
    remoteJid: item.key.remoteJid ?? '',
    fromMe: !!item.key.fromMe,
    texto,
    imagemBase64,
    mimetype: img?.mimetype ?? 'image/jpeg',
  };
}

async function salvarFotoBase64(base64, mimetype) {
  try {
    const buffer = Buffer.from(base64, 'base64');
    await mkdir(UPLOADS_DIR, { recursive: true });
    const ext = (mimetype?.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const nomeArquivo = `${randomUUID()}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, nomeArquivo), buffer);
    return `/uploads/${nomeArquivo}`;
  } catch (erro) {
    logger.warn('Falha ao salvar foto inbound', { erro: erro.message });
    return null;
  }
}
