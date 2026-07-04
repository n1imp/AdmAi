import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Ponto eletrônico do técnico (banco de horas).
 *
 * O técnico envia "Ponto" no WhatsApp do robô e a máquina avança um passo por
 * mensagem: ENTRADA → SAÍDA ALMOÇO → VOLTA ALMOÇO → SAÍDA. Os horários são SEMPRE
 * o timestamp do SERVIDOR no momento em que o bot processa a mensagem — nunca a
 * hora do cliente. O estado do dia fica em RegistroPonto (não em memória volátil).
 *
 * Todos os cálculos (minutos trabalhados, hora extra, saldo) ficam no backend.
 */

const TZ = 'America/Sao_Paulo';

// Rótulo pt-BR de cada batida (usado na confirmação ao funcionário, sem expor banco de horas).
export const ROTULO_BATIDA = {
  entrada: 'Entrada',
  almoco_saida: 'Saída para o almoço',
  almoco_volta: 'Volta do almoço',
  saida: 'Saída',
};

// Jornada/limite de hora extra (minutos/dia) por modalidade contratual.
//   clt        → 8h/dia (HE acima de 8h)
//   clt_meio   → 6h/dia (HE acima de 6h)
//   clt_12x36  → 12h no plantão (HE acima de 12h)
//   intermitente/autonomo → sem banco de horas (HE = 0)
const JORNADA_PADRAO_MIN = {
  clt: 480,
  clt_meio: 360,
  clt_12x36: 720,
};

/** Modalidade tem banco de horas / hora extra? */
export function temBancoDeHoras(modalidade) {
  return Object.prototype.hasOwnProperty.call(JORNADA_PADRAO_MIN, modalidade);
}

/** Jornada diária contratual (min) do técnico: campo explícito ou padrão da modalidade. */
export function jornadaDiariaMin(tecnico) {
  if (tecnico?.jornadaDiariaMin != null) return tecnico.jornadaDiariaMin;
  return JORNADA_PADRAO_MIN[tecnico?.modalidade] ?? null;
}

/**
 * Cálculo do dia: a partir dos minutos trabalhados, deriva hora extra e saldo do dia
 * (positivo/negativo em relação à jornada contratual). Função PURA (testável).
 * @returns {{ horaExtraMinutos:number, saldoMinutos:number }}
 */
export function calcularDia(tecnico, totalMinutos) {
  const total = Math.max(0, Math.round(totalMinutos ?? 0));
  const jornada = jornadaDiariaMin(tecnico);
  if (jornada == null) return { horaExtraMinutos: 0, saldoMinutos: 0 };
  const horaExtraMinutos = Math.max(0, total - jornada);
  const saldoMinutos = total - jornada; // pode ser negativo (horas a compensar)
  return { horaExtraMinutos, saldoMinutos };
}

/**
 * Agrega os registros de um mês para a sub-aba Banco de Horas.
 * @returns {{ totalTrabalhadoMin:number, saldoBancoMin:number, horaExtraMin:number, dias:Array }}
 */
export function resumoMes(tecnico, registros) {
  let totalTrabalhadoMin = 0;
  let saldoBancoMin = 0;
  let horaExtraMin = 0;
  const dias = [];
  for (const r of registros) {
    const total = r.totalMinutos ?? 0;
    const { horaExtraMinutos, saldoMinutos } = calcularDia(tecnico, total);
    totalTrabalhadoMin += total;
    horaExtraMin += horaExtraMinutos;
    saldoBancoMin += saldoMinutos;
    dias.push({
      data: r.data,
      entradaEm: r.entradaEm,
      almocoSaidaEm: r.almocoSaidaEm,
      almocoVoltaEm: r.almocoVoltaEm,
      saidaEm: r.saidaEm,
      totalMinutos: total,
      horaExtraMinutos,
      saldoMinutos,
    });
  }
  return { totalTrabalhadoMin, saldoBancoMin, horaExtraMin, dias };
}

// ── Helpers de tempo (timezone São Paulo) ─────────────────────────────────────

/** Dia local (UTC à meia-noite do dia-calendário de São Paulo) para chavear o RegistroPonto. */
export function diaLocal(agora = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora); // "YYYY-MM-DD"
  return new Date(`${s}T00:00:00.000Z`);
}

function fmtHora(d) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function fmtData(d) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

/** "Xh Ymin" a partir de minutos. */
export function formatarDuracao(min) {
  const m = Math.max(0, Math.round(min ?? 0));
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

function diffMin(fim, inicio) {
  if (!fim || !inicio) return 0;
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
}

/**
 * Registra um batimento de ponto (avança a máquina do dia) e devolve a resposta pt-BR.
 *
 * @param {{ empresaId:number, tecnicoId:number, tecnico?:object, agora?:Date }} args
 * @returns {Promise<{ resposta:string }>}
 */
export async function registrarPonto({ empresaId, tecnicoId, tecnico = null, agora = new Date() }) {
  const data = diaLocal(agora);
  let reg = await prisma.registroPonto.findUnique({
    where: { tecnicoId_data: { tecnicoId, data } },
  });
  if (!reg) {
    reg = await prisma.registroPonto.create({ data: { empresaId, tecnicoId, data } });
  }
  const tec = tecnico ?? (await prisma.tecnico.findUnique({ where: { id: tecnicoId } }));

  // Estado 0 — sem entrada → registra ENTRADA
  if (!reg.entradaEm) {
    await prisma.registroPonto.update({ where: { id: reg.id }, data: { entradaEm: agora } });
    return { resposta: `✅ Entrada registrada: ${fmtHora(agora)} do dia ${fmtData(agora)}`, tipo: 'entrada', registroId: reg.id };
  }
  // Estado 1 — entrada feita → SAÍDA ALMOÇO
  if (!reg.almocoSaidaEm) {
    await prisma.registroPonto.update({ where: { id: reg.id }, data: { almocoSaidaEm: agora } });
    return { resposta: `✅ Saída para almoço: ${fmtHora(agora)}`, tipo: 'almoco_saida', registroId: reg.id };
  }
  // Estado 2 — almoço saída feita → VOLTA ALMOÇO
  if (!reg.almocoVoltaEm) {
    await prisma.registroPonto.update({ where: { id: reg.id }, data: { almocoVoltaEm: agora } });
    return { resposta: `✅ Volta do almoço: ${fmtHora(agora)}`, tipo: 'almoco_volta', registroId: reg.id };
  }
  // Estado 3 — volta feita → SAÍDA FINAL (calcula total + HE)
  if (!reg.saidaEm) {
    const totalMinutos = diffMin(agora, reg.entradaEm) - diffMin(reg.almocoVoltaEm, reg.almocoSaidaEm);
    const { horaExtraMinutos } = calcularDia(tec, totalMinutos);
    await prisma.registroPonto.update({
      where: { id: reg.id },
      data: { saidaEm: agora, totalMinutos, horaExtraMinutos },
    });
    logger.info('Ponto: saída registrada', { tecnicoId, totalMinutos, horaExtraMinutos });
    let resposta =
      `✅ Saída registrada: ${fmtHora(agora)}\n` +
      `📊 Horas hoje: ${formatarDuracao(totalMinutos)}`;
    if (horaExtraMinutos > 0) resposta += `\n⚠️ Hora extra: ${formatarDuracao(horaExtraMinutos)}`;
    return { resposta, tipo: 'saida', registroId: reg.id };
  }

  // Já completo — informa o estado atual e que o ponto do dia está encerrado.
  return {
    resposta:
      `✅ Seu ponto de hoje já está completo.\n` +
      `📊 Horas hoje: ${formatarDuracao(reg.totalMinutos)}` +
      (reg.horaExtraMinutos > 0 ? `\n⚠️ Hora extra: ${formatarDuracao(reg.horaExtraMinutos)}` : ''),
    tipo: null,
    registroId: reg.id,
  };
}
