/**
 * Teste de integração: roteamento inbound do robô de número único.
 *
 * Cobre:
 *  (a) 1 empresa → gatilho 'serviço' → enviarMensagem com saudação + SessaoConversa criada
 *  (b) N empresas → desambiguação com menu → resposta numérica → SessaoConversa vira registro
 *
 * Banco de dados real (Postgres via DATABASE_URL). Gateway mockado.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// Mock parcial do gateway: substitui só enviarMensagem, preserva o restante.
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { enviarMensagem } from '../../src/services/whatsapp/gateway.js';
import { rotearMensagemInbound } from '../../src/services/inbound.js';
import { limparBanco, prisma } from './helpers.js';

beforeAll(() => {
  // Sem criarApp aqui — chamamos rotearMensagemInbound diretamente.
});

beforeEach(async () => {
  await limparBanco();
  enviarMensagem.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Monta um evento MESSAGES_UPSERT no formato Evolution v2. */
function montarEvento(jid, texto) {
  return {
    event: 'MESSAGES_UPSERT',
    data: {
      key: { remoteJid: jid, fromMe: false },
      message: { conversation: texto },
    },
  };
}

describe('(a) 1 empresa: gatilho serviço inicia registro direto', () => {
  it('envia saudação com nome do técnico e cria SessaoConversa com fluxo registro_servico', async () => {
    // Seed: 1 empresa + 1 técnico ativo com telefone
    const empresa = await prisma.empresa.create({
      data: { nome: 'Chaveiro Único', slug: 'chaveiro-unico' },
    });
    await prisma.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
    await prisma.tecnico.create({
      data: {
        empresaId: empresa.id,
        nome: 'Pedro Fechadura',
        telefone: '5511988887777',
        telefoneDisplay: '5511988887777',
        ativo: true,
      },
    });

    const jid = '5511988887777@s.whatsapp.net';
    const evento = montarEvento(jid, 'serviço');

    await rotearMensagemInbound(evento);

    // Gateway deve ter sido chamado pelo menos uma vez
    expect(enviarMensagem).toHaveBeenCalled();

    // A saudação deve mencionar o nome do técnico
    const [destinatario, mensagem] = enviarMensagem.mock.calls[0];
    expect(destinatario).toBe(jid);
    expect(mensagem).toMatch(/Pedro Fechadura/i);

    // Deve existir uma sessão de conversa para este JID
    const sessao = await prisma.sessaoConversa.findUnique({ where: { jid } });
    expect(sessao).not.toBeNull();
    expect(sessao.fluxo).toBe('registro_servico');
    expect(sessao.empresaId).toBe(empresa.id);
  });
});

describe('(b) N empresas: desambiguação e seleção', () => {
  const TELEFONE = '5511977776666';
  const JID = `${TELEFONE}@s.whatsapp.net`;

  it('envia menu de desambiguação com nomes das empresas e cria sessão selecao_empresa', async () => {
    // Seed: 2 empresas, cada uma com um técnico com o mesmo telefone
    const empresaA = await prisma.empresa.create({
      data: { nome: 'Chaveiro Alpha', slug: 'chaveiro-alpha' },
    });
    await prisma.empresaWhatsapp.create({ data: { empresaId: empresaA.id } });
    await prisma.tecnico.create({
      data: {
        empresaId: empresaA.id,
        nome: 'Técnico Alpha',
        telefone: TELEFONE,
        telefoneDisplay: TELEFONE,
        ativo: true,
      },
    });

    const empresaB = await prisma.empresa.create({
      data: { nome: 'Chaveiro Beta', slug: 'chaveiro-beta' },
    });
    await prisma.empresaWhatsapp.create({ data: { empresaId: empresaB.id } });
    await prisma.tecnico.create({
      data: {
        empresaId: empresaB.id,
        nome: 'Técnico Beta',
        telefone: TELEFONE,
        telefoneDisplay: TELEFONE,
        ativo: true,
      },
    });

    const evento = montarEvento(JID, 'serviço');
    await rotearMensagemInbound(evento);

    expect(enviarMensagem).toHaveBeenCalled();
    const [destinatario, mensagem] = enviarMensagem.mock.calls[0];
    expect(destinatario).toBe(JID);

    // O menu deve citar os nomes das duas empresas
    expect(mensagem).toMatch(/Chaveiro Alpha/i);
    expect(mensagem).toMatch(/Chaveiro Beta/i);

    // Sessão criada com fluxo de seleção e empresaId nulo
    const sessao = await prisma.sessaoConversa.findUnique({ where: { jid: JID } });
    expect(sessao).not.toBeNull();
    expect(sessao.fluxo).toBe('selecao_empresa');
    expect(sessao.empresaId).toBeNull();
  });

  it('resposta "1" após menu de desambiguação → sessão vira registro_servico da 1ª empresa', async () => {
    // Seed igual ao teste anterior
    const empresaA = await prisma.empresa.create({
      data: { nome: 'Chaveiro Alpha Sel', slug: 'chaveiro-alpha-sel' },
    });
    await prisma.empresaWhatsapp.create({ data: { empresaId: empresaA.id } });
    await prisma.tecnico.create({
      data: {
        empresaId: empresaA.id,
        nome: 'Técnico Alpha Sel',
        telefone: TELEFONE,
        telefoneDisplay: TELEFONE,
        ativo: true,
      },
    });

    const empresaB = await prisma.empresa.create({
      data: { nome: 'Chaveiro Beta Sel', slug: 'chaveiro-beta-sel' },
    });
    await prisma.empresaWhatsapp.create({ data: { empresaId: empresaB.id } });
    await prisma.tecnico.create({
      data: {
        empresaId: empresaB.id,
        nome: 'Técnico Beta Sel',
        telefone: TELEFONE,
        telefoneDisplay: TELEFONE,
        ativo: true,
      },
    });

    // Gatilho inicial → cria sessão selecao_empresa
    await rotearMensagemInbound(montarEvento(JID, 'serviço'));

    const sessaoSelecao = await prisma.sessaoConversa.findUnique({ where: { jid: JID } });
    expect(sessaoSelecao?.fluxo).toBe('selecao_empresa');

    enviarMensagem.mockClear();

    // Resposta "1" → deve iniciar registro para a 1ª empresa listada
    await rotearMensagemInbound(montarEvento(JID, '1'));

    // Sessão agora deve estar em registro_servico com uma empresaId definida
    const sessaoRegistro = await prisma.sessaoConversa.findUnique({ where: { jid: JID } });
    expect(sessaoRegistro).not.toBeNull();
    expect(sessaoRegistro.fluxo).toBe('registro_servico');
    expect(sessaoRegistro.empresaId).not.toBeNull();

    // Gateway chamado com a saudação do técnico escolhido
    expect(enviarMensagem).toHaveBeenCalled();
  });
});
