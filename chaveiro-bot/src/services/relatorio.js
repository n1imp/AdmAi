import PDFDocument from 'pdfkit';
import { prisma } from '../db/prisma.js';
import { formatarMoeda, formatarData } from './servico.js';
import { resumoMes, formatarDuracao } from './ponto.js';

/**
 * Gera um PDF de relatório de serviços para o período informado.
 * Inclui: cabeçalho, resumo geral, tabela por técnico e listagem de serviços.
 *
 * @param {Date} inicio - Data de início do período
 * @param {Date} fim - Data de fim do período
 * @param {number} empresaId - Empresa (tenant) dona dos dados do relatório
 * @returns {Promise<Buffer>} - Buffer do PDF gerado
 */
export async function gerarRelatorioPDF(inicio, fim, empresaId) {
  if (!empresaId) throw new Error('empresaId obrigatório para gerar relatório');
  const servicos = await prisma.servico.findMany({
    // status 'ativo': serviços pendentes/rejeitados (aprovação) não entram no fechamento.
    where: { empresaId, status: 'ativo', criadoEm: { gte: inicio, lte: fim } },
    include: { tecnico: true },
    orderBy: { criadoEm: 'asc' },
  });

  // Calcula métricas por técnico
  const porTecnico = {};
  let totalBruto = 0;
  let totalMaterial = 0;
  let totalLiquido = 0;

  for (const s of servicos) {
    totalBruto += s.valorCobrado;
    totalMaterial += s.valorMaterial;
    totalLiquido += s.valorLiquido;

    if (!porTecnico[s.tecnico.nome]) {
      porTecnico[s.tecnico.nome] = {
        nome: s.tecnico.nome,
        servicos: 0,
        bruto: 0,
        material: 0,
        liquido: 0,
      };
    }

    porTecnico[s.tecnico.nome].servicos++;
    porTecnico[s.tecnico.nome].bruto += s.valorCobrado;
    porTecnico[s.tecnico.nome].material += s.valorMaterial;
    porTecnico[s.tecnico.nome].liquido += s.valorLiquido;
  }

  const tecnicos = Object.values(porTecnico).sort((a, b) => b.liquido - a.liquido);

  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── CABEÇALHO ──────────────────────────────────────────────
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text('🔑 ChaveiroBot', { align: 'center' });

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#555')
      .text('Relatório de Serviços', { align: 'center' });

    const periodoStr = `${formatarData(inicio).split(' ')[0]} a ${formatarData(fim).split(' ')[0]}`;
    doc.text(`Período: ${periodoStr}`, { align: 'center' }).moveDown(1.5);

    // ── RESUMO GERAL ────────────────────────────────────────────
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text('Resumo Geral')
      .moveDown(0.4);

    const resumo = [
      ['Total de Serviços', String(servicos.length)],
      ['Receita Bruta', formatarMoeda(totalBruto)],
      ['Custo de Materiais', formatarMoeda(totalMaterial)],
      ['Receita Líquida', formatarMoeda(totalLiquido)],
      ['Ticket Médio', formatarMoeda(servicos.length ? totalLiquido / servicos.length : 0)],
    ];

    for (const [label, valor] of resumo) {
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#333')
        .text(label, { continued: true, width: 200 })
        .font('Helvetica')
        .text(valor, { align: 'left' });
    }

    doc.moveDown(1.5);

    // ── TABELA POR TÉCNICO ─────────────────────────────────────
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text('Repartição por Técnico')
      .moveDown(0.5);

    // Cabeçalho da tabela
    const colWidths = [130, 55, 90, 80, 90, 55];
    const headers = ['Técnico', 'Serviços', 'Bruto', 'Material', 'Líquido', '%'];
    let x = 40;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    doc.rect(40, doc.y, 515, 18).fill('#1a1a2e');

    const yHeader = doc.y - 18;
    for (let i = 0; i < headers.length; i++) {
      doc.fillColor('#fff').text(headers[i], x + 3, yHeader + 4, { width: colWidths[i] - 6 });
      x += colWidths[i];
    }

    doc.moveDown(0.1);

    // Linhas da tabela
    for (let idx = 0; idx < tecnicos.length; idx++) {
      const t = tecnicos[idx];
      const pct = totalLiquido > 0 ? ((t.liquido / totalLiquido) * 100).toFixed(1) : '0.0';
      const rowY = doc.y;
      const bgColor = idx % 2 === 0 ? '#f7f7f7' : '#ffffff';

      doc.rect(40, rowY, 515, 16).fill(bgColor);

      const cols = [
        t.nome,
        String(t.servicos),
        formatarMoeda(t.bruto),
        formatarMoeda(t.material),
        formatarMoeda(t.liquido),
        `${pct}%`,
      ];

      x = 40;
      doc.fontSize(8).font('Helvetica').fillColor('#222');
      for (let i = 0; i < cols.length; i++) {
        doc.text(cols[i], x + 3, rowY + 3, { width: colWidths[i] - 6 });
        x += colWidths[i];
      }
      doc.moveDown(0.05);
    }

    // Linha de total
    const rowY = doc.y;
    doc.rect(40, rowY, 515, 18).fill('#d4a017');
    const totais = [
      'TOTAL',
      String(servicos.length),
      formatarMoeda(totalBruto),
      formatarMoeda(totalMaterial),
      formatarMoeda(totalLiquido),
      '100%',
    ];

    x = 40;
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#1a1a2e');
    for (let i = 0; i < totais.length; i++) {
      doc.text(totais[i], x + 3, rowY + 4, { width: colWidths[i] - 6 });
      x += colWidths[i];
    }

    doc.moveDown(2);

    // ── LISTAGEM DE SERVIÇOS ────────────────────────────────────
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#1a1a2e')
      .text('Listagem de Serviços')
      .moveDown(0.5);

    for (const s of servicos) {
      if (doc.y > 720) doc.addPage();

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#333')
        .text(
          `#${s.id} • ${s.tecnico.nome} • ${formatarData(s.criadoEm)} • ${s.local}`,
          { continued: false }
        );

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#555')
        .text(`Serviço: ${s.descricao}`)
        .text(
          `Cobrado: ${formatarMoeda(s.valorCobrado)} | Material: ${formatarMoeda(s.valorMaterial)} | Líquido: ${formatarMoeda(s.valorLiquido)}`
        )
        .moveDown(0.5);
    }

    doc.end();
  });
}

// ── RELATÓRIO DE PONTO / BANCO DE HORAS ───────────────────────────────────────

const TZ = 'America/Sao_Paulo';

function fmtHoraTZ(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

function fmtDiaTZ(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(d));
}

function fmtSaldo(min) {
  const sinal = min < 0 ? '-' : '+';
  const abs = Math.abs(min);
  return `${sinal}${Math.floor(abs / 60)}h ${abs % 60}min`;
}

/**
 * Gera o PDF do banco de horas de um técnico para um mês (YYYY-MM).
 * Reusa pdfkit (mesmo padrão de gerarRelatorioPDF) e o cálculo puro de ponto.js.
 *
 * @param {number} empresaId
 * @param {number} tecnicoId
 * @param {string} mes  formato "YYYY-MM"
 * @returns {Promise<Buffer>}
 */
export async function gerarRelatorioPonto(empresaId, tecnicoId, mes) {
  if (!empresaId) throw new Error('empresaId obrigatório para gerar relatório de ponto');
  const [ano, m] = String(mes).split('-').map(Number);
  const inicio = new Date(Date.UTC(ano, m - 1, 1));
  const fim = new Date(Date.UTC(ano, m, 1));

  const [tecnico, registros] = await Promise.all([
    prisma.tecnico.findFirst({ where: { id: tecnicoId, empresaId } }),
    prisma.registroPonto.findMany({
      where: { empresaId, tecnicoId, data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
    }),
  ]);
  if (!tecnico) throw new Error('Técnico não encontrado');

  const { totalTrabalhadoMin, saldoBancoMin, horaExtraMin, dias } = resumoMes(tecnico, registros);

  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1a1a2e').text('🔑 ChaveiroBot', { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#555').text('Banco de Horas', { align: 'center' });
    doc.text(`${tecnico.nome} • ${mes}`, { align: 'center' }).moveDown(0.4);
    doc.fontSize(8).fillColor('#999')
      .text('Relatório gerencial — não substitui o ponto oficial para fins trabalhistas/jurídicos.', { align: 'center' })
      .moveDown(1);

    // Resumo
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a2e').text('Resumo do mês').moveDown(0.4);
    const resumo = [
      ['Total trabalhado', formatarDuracao(totalTrabalhadoMin)],
      ['Hora extra', formatarDuracao(horaExtraMin)],
      ['Saldo do banco', fmtSaldo(saldoBancoMin)],
    ];
    for (const [label, valor] of resumo) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333')
        .text(label, { continued: true, width: 200 })
        .font('Helvetica').text(valor, { align: 'left' });
    }
    doc.moveDown(1);

    // Tabela diária
    const colWidths = [60, 60, 70, 70, 60, 70, 65];
    const headers = ['Data', 'Entrada', 'Saída alm.', 'Volta alm.', 'Saída', 'Horas', 'Saldo'];
    let x = 40;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.rect(40, doc.y, 515, 18).fill('#1a1a2e');
    const yHeader = doc.y - 18;
    for (let i = 0; i < headers.length; i++) {
      doc.fillColor('#fff').text(headers[i], x + 3, yHeader + 4, { width: colWidths[i] - 6 });
      x += colWidths[i];
    }
    doc.moveDown(0.1);

    if (dias.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#666').text('Nenhum registro de ponto neste mês.', 40, doc.y + 4);
    }
    for (let idx = 0; idx < dias.length; idx++) {
      const d = dias[idx];
      if (doc.y > 760) doc.addPage();
      const rowY = doc.y;
      doc.rect(40, rowY, 515, 16).fill(idx % 2 === 0 ? '#f7f7f7' : '#ffffff');
      const cols = [
        fmtDiaTZ(d.data),
        fmtHoraTZ(d.entradaEm),
        fmtHoraTZ(d.almocoSaidaEm),
        fmtHoraTZ(d.almocoVoltaEm),
        fmtHoraTZ(d.saidaEm),
        formatarDuracao(d.totalMinutos),
        fmtSaldo(d.saldoMinutos),
      ];
      x = 40;
      doc.fontSize(8).font('Helvetica').fillColor('#222');
      for (let i = 0; i < cols.length; i++) {
        doc.text(cols[i], x + 3, rowY + 3, { width: colWidths[i] - 6 });
        x += colWidths[i];
      }
      doc.moveDown(0.05);
    }

    doc.end();
  });
}

/**
 * Gera o CSV do banco de horas (mesmo conjunto de dados do PDF). Retorna string.
 */
export async function gerarCsvPonto(empresaId, tecnicoId, mes) {
  const [ano, m] = String(mes).split('-').map(Number);
  const inicio = new Date(Date.UTC(ano, m - 1, 1));
  const fim = new Date(Date.UTC(ano, m, 1));
  const [tecnico, registros] = await Promise.all([
    prisma.tecnico.findFirst({ where: { id: tecnicoId, empresaId } }),
    prisma.registroPonto.findMany({
      where: { empresaId, tecnicoId, data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
    }),
  ]);
  if (!tecnico) throw new Error('Técnico não encontrado');
  const { dias } = resumoMes(tecnico, registros);
  const linhas = ['Data;Entrada;Saida almoco;Volta almoco;Saida;Horas (min);Hora extra (min);Saldo (min)'];
  for (const d of dias) {
    linhas.push([
      fmtDiaTZ(d.data), fmtHoraTZ(d.entradaEm), fmtHoraTZ(d.almocoSaidaEm),
      fmtHoraTZ(d.almocoVoltaEm), fmtHoraTZ(d.saidaEm),
      d.totalMinutos, d.horaExtraMinutos, d.saldoMinutos,
    ].join(';'));
  }
  return linhas.join('\n');
}
