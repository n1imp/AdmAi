/**
 * Teste de integração: reentregar o mesmo evento não produz efeito dobrado.  [GAP-WPP-01]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   Reentrega não é caso de exceção no WhatsApp — é operação normal. Meta e Evolution reenviam o
 *   webhook quando não recebem confirmação a tempo, e o mesmo `key.id` chega duas vezes. Sem guarda,
 *   a conversa avança dois passos, ou o serviço nasce duplicado, e o técnico descobre pelo relatório.
 *
 *   `marcarSeNovo` existe, está ligado em `services/inbound.js:23` e tem teste de unidade. O que não
 *   havia era prova de que ela morde NO CAMINHO REAL. E havia um motivo concreto para duvidar:
 *   `inbound_numero_unico.test.js` monta o evento SEM `key.id`, e a guarda é
 *   `if (msg.id && !(await marcarSeNovo(...)))`. Sem id, ela é pulada inteira. A suíte que mais
 *   exercita o inbound nunca passou por essa linha.
 *
 * A ARMADILHA DESTE TESTE, e por que ele não pode passar de graça
 *   `marcarSeNovo` é FAIL-OPEN por desenho: se o Redis não responde, ela devolve `true` e a mensagem
 *   é processada. É a escolha certa para o produto — perder mensagem é pior que duplicar — mas
 *   significa que, com o Redis fora, um teste mal escrito de idempotência PASSA sem que exista
 *   idempotência alguma.
 *
 *   Por isso a asserção central é `duplicado: true`, e não "só um efeito": com o Redis fora, a
 *   segunda chamada processa e `duplicado` não vem, e o teste falha em vez de mentir. A garantia
 *   aqui é condicional a Redis de pé, e este arquivo se recusa a esconder essa condição.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { enviarMensagem } from '../../src/services/whatsapp/gateway.js';
import { rotearMensagemInbound } from '../../src/services/inbound.js';
import { limparBanco, prisma } from './helpers.js';

beforeEach(async () => {
  await limparBanco();
  enviarMensagem.mockClear();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Evento MESSAGES_UPSERT no formato Evolution v2, COM o id que a reentrega repete. */
function montarEvento(jid, texto, id) {
  return {
    event: 'MESSAGES_UPSERT',
    data: {
      key: { remoteJid: jid, fromMe: false, id },
      message: { conversation: texto },
    },
  };
}

/** Uma empresa com um técnico atendendo pelo telefone — o cenário simples, sem desambiguação. */
async function semearEmpresaComTecnico(telefone, sufixo) {
  const empresa = await prisma.empresa.create({
    data: { nome: `Chaveiro ${sufixo}`, slug: `chaveiro-${sufixo.toLowerCase()}` },
  });
  await prisma.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
  await prisma.tecnico.create({
    data: {
      empresaId: empresa.id,
      nome: `Tecnico ${sufixo}`,
      telefone,
      telefoneDisplay: telefone,
      ativo: true,
    },
  });
  return empresa;
}

/** Ids únicos por caso: a guarda tem TTL de 24h e o Redis sobrevive entre os testes. */
const idUnico = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Idempotência do inbound [GAP-WPP-01]', () => {
  it('CONTROLE POSITIVO: mensagem nova é PROCESSADA e responde', async () => {
    const telefone = '5511900000001';
    await semearEmpresaComTecnico(telefone, 'P1');
    const jid = `${telefone}@s.whatsapp.net`;

    const r = await rotearMensagemInbound(montarEvento(jid, 'serviço', idUnico('novo')));

    /* Sem isto, "nada aconteceu duas vezes" seria satisfeito por um sistema que não faz nada. */
    expect(r.duplicado).not.toBe(true);
    expect(enviarMensagem).toHaveBeenCalled();
    const sessao = await prisma.sessaoConversa.findUnique({ where: { jid } });
    expect(sessao).not.toBeNull();
  });

  it('a REENTREGA do mesmo id é recusada como duplicada', async () => {
    const telefone = '5511900000002';
    await semearEmpresaComTecnico(telefone, 'P2');
    const jid = `${telefone}@s.whatsapp.net`;
    const evento = montarEvento(jid, 'serviço', idUnico('dup'));

    const primeira = await rotearMensagemInbound(evento);
    const segunda = await rotearMensagemInbound(evento);

    expect(primeira.duplicado).not.toBe(true);
    /* ESTA é a asserção que impede o teste de passar com o Redis fora: no fail-open a segunda
       chamada processa normalmente e `duplicado` nunca aparece. */
    expect(segunda.duplicado).toBe(true);
    expect(segunda.tratado).toBe(false);
  });

  it('a reentrega não produz EFEITO — o gateway não responde de novo', async () => {
    const telefone = '5511900000003';
    await semearEmpresaComTecnico(telefone, 'P3');
    const jid = `${telefone}@s.whatsapp.net`;
    const evento = montarEvento(jid, 'serviço', idUnico('efeito'));

    await rotearMensagemInbound(evento);
    const chamadasDepoisDaPrimeira = enviarMensagem.mock.calls.length;
    await rotearMensagemInbound(evento);

    /* Recusar por dentro e responder por fora seria pior que não ter guarda: o cliente receberia a
       saudação duas vezes e concluiria que o robô está confuso. */
    expect(chamadasDepoisDaPrimeira).toBeGreaterThan(0);
    expect(enviarMensagem.mock.calls.length).toBe(chamadasDepoisDaPrimeira);
  });

  it('a reentrega não AVANÇA a conversa — a sessão fica onde estava', async () => {
    const telefone = '5511900000004';
    await semearEmpresaComTecnico(telefone, 'P4');
    const jid = `${telefone}@s.whatsapp.net`;
    const evento = montarEvento(jid, 'serviço', idUnico('sessao'));

    await rotearMensagemInbound(evento);
    const antes = await prisma.sessaoConversa.findUnique({ where: { jid } });
    await rotearMensagemInbound(evento);
    const depois = await prisma.sessaoConversa.findUnique({ where: { jid } });

    /* O dano da duplicata aqui não é visual: é a máquina de estados pular uma etapa e o registro
       do serviço sair com o campo errado no lugar errado. */
    expect(depois.fluxo).toBe(antes.fluxo);
    expect(depois.etapa).toBe(antes.etapa);
  });

  it('id DIFERENTE com o mesmo texto é processado — a guarda é por evento, não por conteúdo', async () => {
    const telefone = '5511900000005';
    await semearEmpresaComTecnico(telefone, 'P5');
    const jid = `${telefone}@s.whatsapp.net`;

    const primeira = await rotearMensagemInbound(montarEvento(jid, 'serviço', idUnico('a')));
    const segunda = await rotearMensagemInbound(montarEvento(jid, 'serviço', idUnico('b')));

    /* CONTRAPROVA: uma guarda que deduplicasse por texto silenciaria o cliente que manda a mesma
       palavra duas vezes de propósito — e "recusar tudo" passaria nos testes acima. */
    expect(primeira.duplicado).not.toBe(true);
    expect(segunda.duplicado).not.toBe(true);
  });

  it('PROVA DE QUE A GUARDA É O QUE DECIDE: evento SEM id é processado duas vezes', async () => {
    const telefone = '5511900000008';
    await semearEmpresaComTecnico(telefone, 'P8');
    const jid = `${telefone}@s.whatsapp.net`;
    const semId = montarEvento(jid, 'serviço', undefined);

    const primeira = await rotearMensagemInbound(semId);
    const segunda = await rotearMensagemInbound(semId);

    /* Este é o controle de sensibilidade do arquivo, feito só com a interface pública: mesmo jid,
       mesmo texto, mesma sessão — e sem `id` a guarda é pulada (`if (msg.id && ...)`), então a
       segunda passa. Se `duplicado: true` aparecesse aqui, as asserções dos casos acima estariam
       medindo outra coisa qualquer, não a idempotência.
       De quebra registra o buraco real: reentrega sem id NÃO é protegida. Hoje a Evolution sempre
       manda `key.id`; quem trocar de provider precisa verificar isso antes. */
    expect(primeira.duplicado).not.toBe(true);
    expect(segunda.duplicado).not.toBe(true);
  });

  it('a guarda é por id GLOBAL: reentrega para outro JID também é recusada', async () => {
    const telA = '5511900000006';
    const telB = '5511900000007';
    await semearEmpresaComTecnico(telA, 'P6A');
    await semearEmpresaComTecnico(telB, 'P6B');
    const id = idUnico('global');

    const a = await rotearMensagemInbound(montarEvento(`${telA}@s.whatsapp.net`, 'serviço', id));
    const b = await rotearMensagemInbound(montarEvento(`${telB}@s.whatsapp.net`, 'serviço', id));

    /* Documenta o alcance real da chave `wa:<id>`, que não inclui o jid. Ids do WhatsApp são
       únicos por mensagem, então na prática isso não colide — mas quem for mexer na chave precisa
       saber qual é o comportamento de hoje. */
    expect(a.duplicado).not.toBe(true);
    expect(b.duplicado).toBe(true);
  });
});
