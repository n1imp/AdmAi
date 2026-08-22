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
 * O QUE ELE DECIDE — e o que nao decide
 *   Ele mede o BACKEND, que e onde autorizacao vale (esconder no frontend nao e autorizacao).
 *   O escopo testado esta declarado em `ROTAS_DE_PRODUTO` e `ROTAS_QUE_DEVEM_CONTINUAR`: se uma
 *   rota nao esta ali, este teste nao afirma nada sobre ela.
 *
 * ESTE ARQUIVO MUDOU DE IDENTIDADE — e a mudanca e deliberada
 *   Ele nasceu para responder "existe gate comercial?", e a resposta foi NAO:
 *   `BILLING_GATE_ABSENT_WITH_TESTED_SCOPE`. O usuario decidiu o modelo — trial e depois paywall —
 *   e o gate foi implementado em `src/middlewares/assinatura.js`.
 *
 *   Entao as assercoes INVERTERAM. Onde se exigia "nenhuma rota bloqueou", agora se exige "nenhuma
 *   rota de produto passou". O teste nao foi apagado nem reescrito do zero: as fixtures de estado
 *   morto e a pre-condicao anti-vacuidade continuam as mesmas, porque continuam certas.
 *
 * AS DUAS FALHAS QUE ELE PRECISA SEPARAR
 *   `BILLING_GATE_INCOMPLETO` — rota de produto passou com assinatura morta. Falta cobertura.
 *   `PAYWALL_EXCESSIVO`       — rota essencial foi barrada. O cliente nao consegue pagar nem sair,
 *                               e esse e o unico erro fatal deste desenho.
 *
 *   Um gate que barra tudo seria tao errado quanto um que nao barra nada, e so a segunda familia
 *   de casos consegue notar isso.
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
  { metodo: 'get', caminho: '/api/metricas', nome: 'catálogo de métricas' },
  { metodo: 'get', caminho: '/api/me/servicos', nome: 'meus serviços' },
];

/**
 * Rotas que precisam CONTINUAR funcionando com a assinatura morta, e o motivo de cada uma.
 *
 * `/api/me` estava na lista de produto na versao anterior deste arquivo, quando nao havia gate
 * nenhum e a pergunta era so "algo bloqueia?". Com o paywall existindo, bloquea-la seria um erro
 * de desenho: o painel precisa saber quem e o usuario para RENDERIZAR a oferta de assinatura.
 * Tela branca nao converte ninguem.
 */
const ROTAS_QUE_DEVEM_CONTINUAR = [
  { metodo: 'get', caminho: '/api/me', nome: 'perfil — o painel precisa dele para mostrar o paywall' },
  { metodo: 'get', caminho: '/api/me/permissoes', nome: 'permissões — idem' },
  { metodo: 'get', caminho: '/api/billing/status', nome: 'status comercial — para saber o que oferecer' },
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

  /* CONTROLE POSITIVO PRIMEIRO. Sem ele, um backend que negasse tudo passaria em todos os casos de
     bloqueio abaixo e o teste pareceria rigoroso — a armadilha que este repositorio ja documentou
     mais de uma vez. Trial EM CURSO tem de funcionar. */
  it('CONTROLE POSITIVO: com trial em curso, o produto responde normalmente', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `P${Date.now() % 1000}`);
    await prisma.assinatura.update({
      where: { empresaId },
      data: { status: 'trialing', trialFimEm: new Date(Date.now() + 7 * 24 * 3600 * 1000) }
    });

    const bloqueadas = [];
    for (const rota of ROTAS_DE_PRODUTO) {
      const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
      if (pareceBloqueioComercial(res)) bloqueadas.push(`${rota.nome} → ${res.status}`);
    }
    expect(bloqueadas, `trial VALIDO nao pode barrar:
  ${bloqueadas.join('\n  ')}`).toEqual([]);
  });

  it('CONTROLE POSITIVO: com assinatura ativa, o produto responde normalmente', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `A${Date.now() % 1000}`);
    await prisma.assinatura.update({
      where: { empresaId },
      data: { status: 'active', periodoFimEm: new Date(Date.now() + 30 * 24 * 3600 * 1000) }
    });

    const bloqueadas = [];
    for (const rota of ROTAS_DE_PRODUTO) {
      const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
      if (pareceBloqueioComercial(res)) bloqueadas.push(`${rota.nome} → ${res.status}`);
    }
    expect(bloqueadas, `assinatura ATIVA nao pode barrar:
  ${bloqueadas.join('\n  ')}`).toEqual([]);
  });

  for (const estado of ESTADOS_MORTOS) {
    it(`assinatura ${estado.rotulo}: o produto E BARRADO`, async () => {
      const { token, empresaId } = await criarEmpresaComAdmin(request, app, `B${Date.now() % 1000}`);

      await prisma.assinatura.update({ where: { empresaId }, data: estado.dados });

      const passaram = [];
      for (const rota of ROTAS_DE_PRODUTO) {
        const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
        if (!pareceBloqueioComercial(res)) {
          passaram.push(`${rota.nome} (${rota.caminho}) → ${res.status}`);
        }
      }

      expect(
        passaram,
        `BILLING_GATE_INCOMPLETO: com assinatura ${estado.rotulo}, estas rotas de produto NAO bloquearam:
  ${passaram.join('\n  ')}`
      ).toEqual([]);
    });

    it(`assinatura ${estado.rotulo}: pagar, ver-se e sair CONTINUAM funcionando`, async () => {
      const { token, empresaId } = await criarEmpresaComAdmin(request, app, `L${Date.now() % 1000}`);
      await prisma.assinatura.update({ where: { empresaId }, data: estado.dados });

      const barradas = [];
      for (const rota of ROTAS_QUE_DEVEM_CONTINUAR) {
        const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
        if (pareceBloqueioComercial(res)) barradas.push(`${rota.nome} (${rota.caminho}) → ${res.status}`);
      }

      expect(
        barradas,
        `PAYWALL_EXCESSIVO: com ${estado.rotulo}, estas rotas essenciais foram barradas — o cliente nao consegue nem pagar nem sair:
  ${barradas.join('\n  ')}`
      ).toEqual([]);
    });
  }

  it('sem NENHUMA assinatura: o produto E BARRADO (ausencia nao e cortesia)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `S${Date.now() % 1000}`);

    /* O caso mais extremo. Toda empresa recebe Assinatura no cadastro, entao ausencia significa
       dado faltando — e dado faltando nao pode virar direito de uso. */
    await prisma.assinatura.deleteMany({ where: { empresaId } });

    const passaram = [];
    for (const rota of ROTAS_DE_PRODUTO) {
      const res = await request(app)[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
      if (!pareceBloqueioComercial(res)) passaram.push(`${rota.nome} (${rota.caminho}) → ${res.status}`);
    }

    expect(
      passaram,
      `FAIL_OPEN: sem assinatura nenhuma, estas rotas passaram:
  ${passaram.join('\n  ')}`
    ).toEqual([]);
  });

  it('escrita TAMBEM e bloqueada por assinatura cancelada (leitura barrada e escrita livre seria gate parcial)', async () => {
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
      `BILLING_GATE_PARCIAL: escrita passou com assinatura cancelada → ${res.status} ${JSON.stringify(res.body)}`
    ).toBe(true);
  });
});
