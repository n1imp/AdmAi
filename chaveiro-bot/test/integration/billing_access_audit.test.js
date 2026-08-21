/**
 * BILLING ACCESS AUDIT — existe gate comercial bloqueando o uso do produto?
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   A decisão de produto vigente é `ADMAI_FREE_MODE = TRUE`: sem paywall, sem assinatura
 *   obrigatória, sem bloqueio por trial. A tentação é "remover o paywall". Mas antes de remover
 *   é preciso PROVAR se ele existe — e `grep` não prova: ausência de evidência não é evidência de
 *   ausência, e um gate pode estar em middleware, em rota, em query ou no frontend.
 *
 *   Este teste é o instrumento dirigido. Ele coloca a `Assinatura` nos estados comercialmente
 *   mortos (`canceled`, `past_due`, trial vencido) e exercita o produto de verdade, pelo HTTP,
 *   como um cliente faria.
 *
 * O QUE ELE DECIDE — e o que não decide
 *   Ele mede o BACKEND, que é onde autorização vale (esconder no frontend não é autorização).
 *   O escopo testado está declarado em `ROTAS_DE_PRODUTO`: se uma rota não está ali, este teste
 *   não afirma nada sobre ela. Por isso o veredito possível é
 *   `BILLING_GATE_ABSENT_WITH_TESTED_SCOPE`, e não "não existe gate".
 *
 * LEITURA DO RESULTADO
 *   verde  → nenhum gate comercial no escopo testado; nada a "corrigir", e o FREE_MODE já é o
 *            comportamento real do backend.
 *   falha  → existe gate. A mensagem diz qual rota e qual status, e aí sim há o que desativar
 *            com segurança.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * Rotas de uso normal do produto. Nenhuma é de billing: o ponto é justamente saber se o estado
 * comercial contamina o uso cotidiano.
 */
const ROTAS_DE_PRODUTO = [
  { metodo: 'get', caminho: '/api/servicos', nome: 'listar serviços' },
  { metodo: 'get', caminho: '/api/tecnicos', nome: 'listar técnicos' },
  { metodo: 'get', caminho: '/api/estoque', nome: 'listar estoque' },
  { metodo: 'get', caminho: '/api/dashboard', nome: 'dashboard' },
  { metodo: 'get', caminho: '/api/me', nome: 'perfil do usuário' },
];

/** Estados em que uma assinatura está comercialmente morta. */
const ESTADOS_MORTOS = [
  {
    rotulo: 'canceled com período encerrado',
    dados: {
      status: 'canceled',
      canceladoEm: new Date('2020-01-01'),
      periodoFimEm: new Date('2020-01-31'),
      trialFimEm: new Date('2020-01-01'),
    },
  },
  {
    rotulo: 'past_due',
    dados: { status: 'past_due', periodoFimEm: new Date('2020-01-31') },
  },
  {
    rotulo: 'trialing com trial vencido há anos',
    dados: { status: 'trialing', trialFimEm: new Date('2020-01-01') },
  },
];

/**
 * Um bloqueio comercial se manifestaria como 402 (Payment Required), ou como 403 cuja mensagem
 * fala de assinatura/trial/pagamento.
 *
 * A checagem da mensagem importa: o produto usa 403 legitimamente para RBAC, e confundir "sem
 * permissão" com "sem pagar" produziria falso positivo — que aqui seria pior que falso negativo,
 * porque levaria a "desativar" um controle de acesso real.
 */
function pareceBloqueioComercial(res) {
  if (res.status === 402) return true;
  if (res.status !== 403) return false;
  const texto = JSON.stringify(res.body ?? {}).toLowerCase();
  return /assinatura|trial|pagamento|payment|subscription|plano|cobran/.test(texto);
}

describe('BILLING ACCESS AUDIT — o estado comercial bloqueia o uso do produto?', () => {
  let app;

  beforeAll(() => {
    // `criarApp()` devolve { app, estado } — o segundo é a flag de graceful shutdown.
    ({ app } = criarApp());
  });

  beforeEach(async () => {
    await limparBanco();
  });

  it('a Assinatura é mesmo criada no cadastro (pré-condição: sem ela o teste seria vácuo)', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'Pre');
    const assinatura = await prisma.assinatura.findUnique({ where: { empresaId } });

    /* Se o cadastro não criasse Assinatura, os casos abaixo estariam medindo o nada — o teste
       passaria por ausência de alvo, que é o modo mais silencioso de um teste mentir. */
    expect(assinatura).not.toBeNull();
    expect(assinatura.status).toBe('trialing');
  });

  for (const estado of ESTADOS_MORTOS) {
    it(`assinatura ${estado.rotulo}: o produto continua acessível`, async () => {
      const { token, empresaId } = await criarEmpresaComAdmin(request, app, `B${Date.now() % 1000}`);

      await prisma.assinatura.update({ where: { empresaId }, data: estado.dados });

      const bloqueadas = [];
      for (const rota of ROTAS_DE_PRODUTO) {
        const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
        if (pareceBloqueioComercial(res)) {
          bloqueadas.push(`${rota.nome} (${rota.caminho}) → ${res.status} ${JSON.stringify(res.body)}`);
        }
      }

      expect(
        bloqueadas,
        `BILLING_GATE_PRESENT: com assinatura ${estado.rotulo}, estas rotas bloquearam:\n  ${bloqueadas.join('\n  ')}`
      ).toEqual([]);
    });
  }

  it('sem NENHUMA assinatura: o produto continua acessível', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `S${Date.now() % 1000}`);

    /* O caso mais extremo, e o mais informativo: empresa sem linha de Assinatura nenhuma. Um gate
       que checasse `assinatura.status` provavelmente estouraria ou negaria aqui. */
    await prisma.assinatura.deleteMany({ where: { empresaId } });

    const bloqueadas = [];
    for (const rota of ROTAS_DE_PRODUTO) {
      const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
      if (pareceBloqueioComercial(res)) {
        bloqueadas.push(`${rota.nome} (${rota.caminho}) → ${res.status} ${JSON.stringify(res.body)}`);
      }
    }

    expect(
      bloqueadas,
      `BILLING_GATE_PRESENT: sem assinatura, estas rotas bloquearam:\n  ${bloqueadas.join('\n  ')}`
    ).toEqual([]);
  });

  it('escrita também não é bloqueada por assinatura cancelada (leitura livre + escrita bloqueada seria gate parcial)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `W${Date.now() % 1000}`);
    await prisma.assinatura.update({
      where: { empresaId },
      data: { status: 'canceled', canceladoEm: new Date('2020-01-01'), periodoFimEm: new Date('2020-01-31') },
    });

    const res = await request(app)
      .post('/api/tecnicos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Tecnico Pos Cancelamento', telefone: '5531' + String(Date.now()).slice(-9), comissao: 10 });

    expect(
      pareceBloqueioComercial(res),
      `BILLING_GATE_PARTIAL: escrita bloqueada por estado comercial → ${res.status} ${JSON.stringify(res.body)}`
    ).toBe(false);
  });
});
