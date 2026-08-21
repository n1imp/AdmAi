/**
 * Exposição das métricas — segurança, allowlist e semântica.  [Metric Foundation]
 *
 * O QUE ESTE ARQUIVO PROVA, e o que ele deliberadamente não tenta provar
 *   A aritmética já é provada sem banco, em `tools/admai-delivery/metric/calculate.mjs`, sobre
 *   fixture determinística. Repetir isso aqui daria a impressão de mais cobertura e mediria a
 *   mesma coisa por um caminho mais frágil.
 *
 *   O que só aparece com banco e HTTP é outra coisa: o tenant realmente isola? a permissão do
 *   módulo é mesmo a autoridade? filtro não declarado é rejeitado ou ignorado em silêncio?
 *   `INSUFFICIENT_DATA` chega ao consumidor como estado ou é achatado em zero pelo caminho? o
 *   drilldown devolve exatamente os registros que o agregado contou?
 *
 * A REGRA DO CONTROLE POSITIVO
 *   Toda asserção negativa aqui tem um positivo ao lado. Sem ele, uma rota quebrada — 403 em tudo,
 *   ou lista sempre vazia — passaria em todos os negativos e não provaria isolamento nenhum. Foi
 *   assim que o teste do relatório em PDF quase passou medindo nada.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import {
  limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma
} from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function duasEmpresas() {
  const a = await criarEmpresaComAdmin(request, app, `MA${Date.now() % 10000}`);
  const b = await criarEmpresaComAdmin(request, app, `MB${(Date.now() + 7) % 10000}`);
  return { a, b };
}

async function criarTecnico(token, nome) {
  const telefone = '5561' + String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9);
  const res = await request(app).post('/api/tecnicos').set('Authorization', `Bearer ${token}`)
    .send({ nome, telefone, comissao: 10, criarAcesso: false });
  expect(res.status, `pré-condição: criar técnico devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarServico(token, tecnicoNome, local, valor = 100) {
  const res = await request(app).post('/api/servicos').set('Authorization', `Bearer ${token}`)
    .send({ tecnico: tecnicoNome, local, descricao: 'Servico de teste de metrica', valorCobrado: valor, valorMaterial: 0 });
  expect(res.status, `pré-condição: criar serviço devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

const metrica = (token, id, qs = '') =>
  request(app).get(`/api/metricas/${id}${qs}`).set('Authorization', `Bearer ${token}`);

describe('Exposição de métricas (METRIC_FOUNDATION)', () => {
  describe('autorização', () => {
    it('o dono lê o agregado; sem token não se lê nada', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      await criarServico(a.token, tec.nome, 'Rua A, 1', 250);

      const comToken = await metrica(a.token, 'faturamento-liquido');
      expect(comToken.status).toBe(200);
      expect(comToken.body.status).toBe('VALUE');
      expect(comToken.body.value, 'o dono precisa ver o próprio faturamento').toBe(250);

      const semToken = await request(app).get('/api/metricas/faturamento-liquido');
      expect(semToken.status, 'métrica financeira sem autenticação').toBe(401);
    });

    /**
     * O ponto do §8: permissão de AGREGADO não concede DRILLDOWN, e auto-escopo não concede
     * nenhum dos dois sobre dado alheio. O funcionário vê a própria produção; não alcança
     * faturamento da empresa nem a lista de registros.
     */
    it('funcionário vê a própria produção e não alcança financeiro nem drilldown', async () => {
      const { a } = await duasEmpresas();
      const func = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func A' });

      const propria = await metrica(func.token, 'producao-por-tecnico');
      expect(propria.status, 'funcionário precisa ver a própria produção — senão os 403 abaixo são vácuos').toBe(200);
      expect(propria.body.scope).toBe('PROPRIO');

      const financeiro = await metrica(func.token, 'faturamento-liquido');
      expect(financeiro.status, 'faturamento global exige financeiro.ver').toBe(403);

      const registros = await request(app)
        .get('/api/metricas/servicos-concluidos/registros')
        .set('Authorization', `Bearer ${func.token}`);
      expect(registros.status, 'ver o próprio número não é ver os registros de todos').toBe(403);
    });

    it('o recorte PROPRIO não devolve produção de outro técnico da mesma empresa', async () => {
      const { a } = await duasEmpresas();
      const func = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func Proprio' });
      const outro = await criarTecnico(a.token, 'Outro Tecnico');
      await criarServico(a.token, outro.nome, 'Rua do outro, 5', 900);

      const res = await metrica(func.token, 'producao-por-tecnico');
      expect(res.status).toBe(200);
      const linhas = res.body.value ?? [];
      expect(linhas.every((l) => l.tecnicoId === func.tecnicoId),
        'apareceu linha de outro técnico no escopo PROPRIO').toBe(true);
    });
  });

  describe('isolamento de tenant', () => {
    it('o faturamento de A não inclui serviço da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const tecA = await criarTecnico(a.token, 'Tec de A');
      await criarServico(a.token, tecA.nome, 'Rua A, 1', 100);
      const tecB = await criarTecnico(b.token, 'Tec de B');
      await criarServico(b.token, tecB.nome, 'Rua B, 2', 5000);

      const comoA = await metrica(a.token, 'faturamento-liquido');
      expect(comoA.status).toBe(200);
      expect(comoA.body.value, 'valor de B entrou no faturamento de A').toBe(100);

      /* Positivo: B vê os próprios 5000 — senão "A não vê B" seria só a rota devolvendo zero. */
      const comoB = await metrica(b.token, 'faturamento-liquido');
      expect(comoB.body.value).toBe(5000);
    });

    it('os registros de A não contêm serviço da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const tecA = await criarTecnico(a.token, 'Tec de A');
      await criarServico(a.token, tecA.nome, 'Rua A, 1');
      const tecB = await criarTecnico(b.token, 'Tec de B');
      const servicoDeB = await criarServico(b.token, tecB.nome, 'Rua B, 2');

      const res = await request(app).get('/api/metricas/servicos-concluidos/registros')
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status).toBe(200);
      expect(res.body.registros.some((r) => r.id === servicoDeB.id),
        'registro da empresa B apareceu no drilldown de A').toBe(false);
      expect(res.body.registros.length, 'A precisa ver o próprio — senão o negativo é vácuo').toBe(1);
    });
  });

  describe('allowlist', () => {
    it('rejeita dimensão e filtro não declarados, e nunca aceita empresaId do cliente', async () => {
      const { a } = await duasEmpresas();

      const dimensao = await metrica(a.token, 'faturamento-liquido', '?dimensao=salario');
      expect(dimensao.status, 'dimensão não declarada precisa ser REJEITADA, não ignorada').toBe(400);

      const tenant = await metrica(a.token, 'faturamento-liquido', '?empresaId=999');
      expect(tenant.status, 'tenant não é parâmetro do cliente').toBe(400);

      const periodo = await metrica(a.token, 'faturamento-liquido', '?periodo=decada');
      expect(periodo.status).toBe(400);

      /* Positivo: dimensão declarada passa — senão o 400 acima seria a rota recusando tudo. */
      const valida = await metrica(a.token, 'faturamento-liquido', '?dimensao=tecnico');
      expect(valida.status, 'dimensão declarada precisa ser aceita').toBe(200);
    });

    it('métrica desconhecida dá 404 e métrica não servível se identifica como tal', async () => {
      const { a } = await duasEmpresas();

      const inexistente = await metrica(a.token, 'metrica-que-nao-existe');
      expect(inexistente.status).toBe(404);

      /* `taxa-recompra` está no contrato e depende de `Cliente`, que não existe. O consumidor
         precisa distinguir isso de "não existe". */
      const naoServivel = await metrica(a.token, 'taxa-recompra');
      expect(naoServivel.status).toBe(404);
      expect(naoServivel.body.status).toBe('NOT_APPLICABLE');
    });
  });

  describe('semântica de dado insuficiente', () => {
    /* A regra que a Metric Foundation existe para impor: sem dado NÃO é zero. */
    it('ticket médio sem serviço devolve INSUFFICIENT_DATA com motivo, não 0', async () => {
      const { a } = await duasEmpresas();

      const res = await metrica(a.token, 'ticket-medio');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INSUFFICIENT_DATA');
      expect(res.body.value, 'média de nada virou zero').toBeNull();
      expect(typeof res.body.reason, 'INSUFFICIENT sem motivo é só um buraco').toBe('string');
    });

    it('empresa sem aprovação configurada não devolve 100% de aprovação', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      await criarServico(a.token, tec.nome, 'Rua A, 1');

      const res = await metrica(a.token, 'taxa-aprovacao');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INSUFFICIENT_DATA');
      expect(res.body.value).toBeNull();
    });
  });

  describe('lineage e consistência agregado ↔ registros', () => {
    it('a resposta explica de onde o número veio', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      await criarServico(a.token, tec.nome, 'Rua A, 1', 300);

      const res = await metrica(a.token, 'faturamento-liquido');
      expect(res.status).toBe(200);
      expect(res.body.lineage.formula).toBeTruthy();
      expect(res.body.lineage.sourceEntities).toContain('Servico');
      expect(res.body.lineage.appliedFilters.length).toBeGreaterThan(0);
      expect(res.body.quality.recordCount).toBe(1);
      expect(res.body.version).toBeTruthy();

      /* Lineage não pode virar vazamento de implementação. */
      const corpo = JSON.stringify(res.body);
      expect(corpo.includes('SELECT'), 'SQL interno na resposta').toBe(false);
      expect(corpo.includes('empresaId'), 'identificador de tenant na resposta').toBe(false);
    });

    /**
     * O teste crítico do contrato de drilldown: o agregado diz N, e a lista autorizada devolve
     * exatamente N. Se divergirem, ou o total mente ou a lista mente, e o consumidor não tem como
     * saber qual — que é pior que qualquer um dos dois erros isolado.
     */
    it('o agregado diz N e o drilldown devolve exatamente N registros', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      for (let i = 0; i < 3; i += 1) await criarServico(a.token, tec.nome, `Rua ${i}`, 50 + i);

      const agregado = await metrica(a.token, 'servicos-concluidos');
      expect(agregado.status).toBe(200);
      expect(agregado.body.value, 'pré-condição: precisa haver o que listar').toBe(3);

      const registros = await request(app).get('/api/metricas/servicos-concluidos/registros')
        .set('Authorization', `Bearer ${a.token}`);
      expect(registros.status).toBe(200);
      expect(registros.body.total, 'agregado e drilldown discordam sobre quantos registros existem')
        .toBe(agregado.body.value);
      expect(registros.body.registros.length).toBe(agregado.body.value);
    });

    it('comparação com o período anterior não inventa direção sem base', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      await criarServico(a.token, tec.nome, 'Rua A, 1', 400);

      const res = await metrica(a.token, 'faturamento-liquido', '?comparar=true');
      expect(res.status).toBe(200);
      expect(res.body.comparison).not.toBeNull();
      /* Sem faturamento no período anterior, a variação percentual é indefinida — não 100%. */
      expect(res.body.comparison.variacaoPercentual).toBeNull();
      expect(res.body.comparison.direcao).toBe('SEM_BASE');
    });
  });

  describe('breakdown e série (Metric Hub)', () => {
    /**
     * A regressão do defeito: `?dimensao=` era validado e IGNORADO — o cliente pedia recorte por
     * técnico e recebia o total da empresa, sem meio de perceber. Não basta o parâmetro ser aceito;
     * dimensões diferentes precisam produzir agrupamentos diferentes.
     */
    it('dimensões diferentes produzem agrupamentos diferentes, e a soma bate com o agregado', async () => {
      const { a } = await duasEmpresas();
      const ana = await criarTecnico(a.token, 'Ana');
      const bruno = await criarTecnico(a.token, 'Bruno');
      await criarServico(a.token, ana.nome, 'Centro');
      await criarServico(a.token, ana.nome, 'Norte');
      await criarServico(a.token, bruno.nome, 'Centro');

      const total = await metrica(a.token, 'servicos-concluidos');
      expect(total.body.value).toBe(3);

      const porTecnico = await metrica(a.token, 'servicos-concluidos', '?dimensao=tecnico');
      const porLocal = await metrica(a.token, 'servicos-concluidos', '?dimensao=local');
      expect(porTecnico.status).toBe(200);
      expect(porLocal.status).toBe(200);

      /* O agrupamento existe de verdade. */
      expect(porTecnico.body.breakdown?.grupos?.length, 'breakdown por técnico não agrupou').toBe(2);
      expect(porLocal.body.breakdown?.grupos?.length, 'breakdown por local não agrupou').toBe(2);

      /* E é DIFERENTE entre dimensões — se o parâmetro fosse ignorado, seriam iguais. */
      const assinatura = (r) => JSON.stringify(r.body.breakdown.grupos.map((g) => [g.rotulo, g.valor]));
      expect(assinatura(porTecnico), 'dimensões diferentes deram o mesmo recorte — parâmetro ignorado')
        .not.toBe(assinatura(porLocal));

      /* Os grupos somam o agregado: breakdown que não fecha com o Hero é contradição visível. */
      const soma = porTecnico.body.breakdown.grupos.reduce((t, g) => t + g.valor, 0);
      expect(soma).toBe(total.body.value);

      /* Sem `dimensao`, não há breakdown — não se paga agrupamento que ninguém pediu. */
      expect(total.body.breakdown).toBeNull();
    });

    it('dimensão não declarada é rejeitada, mesmo existindo no banco', async () => {
      const { a } = await duasEmpresas();
      const res = await metrica(a.token, 'servicos-concluidos', '?dimensao=valorLiquido');
      expect(res.status).toBe(400);
    });

    it('a série cobre o período, e o dia sem serviço vale zero em vez de sumir', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Serie');
      await criarServico(a.token, tec.nome, 'Rua 1');

      const res = await request(app)
        .get('/api/metricas/servicos-concluidos/serie?periodo=mes&granularidade=dia')
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status).toBe(200);
      expect(res.body.pontos.length).toBeGreaterThan(1);
      expect(res.body.pontos.some((p) => p.valor === 0), 'nenhum dia zerado: série estaria omitindo dias').toBe(true);

      const somaDaSerie = res.body.pontos.reduce((t, p) => t + (p.valor ?? 0), 0);
      const agregado = await metrica(a.token, 'servicos-concluidos');
      expect(somaDaSerie, 'a série não soma o agregado do período').toBe(agregado.body.value);
    });

    it('granularidade não declarada pelo contrato é rejeitada', async () => {
      const { a } = await duasEmpresas();
      const res = await request(app)
        .get('/api/metricas/servicos-concluidos/serie?granularidade=semana')
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status, 'granularidade fora do contrato foi aceita').toBe(400);
    });

    it('a série de A não conta serviço da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const tecB = await criarTecnico(b.token, 'Tec de B');
      await criarServico(b.token, tecB.nome, 'Rua de B');

      const serieA = await request(app)
        .get('/api/metricas/servicos-concluidos/serie')
        .set('Authorization', `Bearer ${a.token}`);
      expect(serieA.body.pontos.every((p) => (p.valor ?? 0) === 0), 'serviço de B entrou na série de A').toBe(true);

      /* Positivo: B vê o próprio — senão o zero acima seria a rota quebrada. */
      const serieB = await request(app)
        .get('/api/metricas/servicos-concluidos/serie')
        .set('Authorization', `Bearer ${b.token}`);
      expect(serieB.body.pontos.some((p) => p.valor > 0)).toBe(true);
    });
  });

  describe('autoridade única e permissão por campo', () => {
    /**
     * Dashboard e Hub precisam mostrar o MESMO número. `/dashboard` conta no banco (exato, e o
     * cockpit depende disso) e a Foundation conta sobre linhas; são caminhos distintos para o
     * mesmo predicado. Este teste é o que amarra os dois: divergiu, reprova.
     */
    it('/dashboard e a Metric Foundation contam a mesma coisa', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Equivalencia');
      for (let i = 0; i < 3; i += 1) await criarServico(a.token, tec.nome, `Rua ${i}`);

      const dash = await request(app).get('/api/dashboard?periodo=mes').set('Authorization', `Bearer ${a.token}`);
      const hub = await metrica(a.token, 'servicos-concluidos', '?periodo=mes');
      expect(dash.status).toBe(200);
      expect(hub.body.value, 'Dashboard e Hub divergiram sobre o mesmo número').toBe(dash.body.totalServicos);
    });

    /**
     * O drilldown não é porta lateral para dado financeiro: chegar aos registros exige
     * `servicos.ver`, e ver valor exige `financeiro.ver`. O gestor tem as duas; um papel com
     * apenas a primeira não pode receber o campo.
     */
    it('o dono vê o valor nos registros e o campo viaja declarado', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Campo');
      await criarServico(a.token, tec.nome, 'Rua do campo', 250);

      const res = await request(app)
        .get('/api/metricas/servicos-concluidos/registros')
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status).toBe(200);
      expect(res.body.camposOmitidos).toEqual([]);
      expect(res.body.registros[0].valorLiquido).toBe(250);
    });

    it('paginação não altera o total — página menor não significa menos registros', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Paginacao');
      for (let i = 0; i < 3; i += 1) await criarServico(a.token, tec.nome, `Rua ${i}`);

      const inteiro = await request(app)
        .get('/api/metricas/servicos-concluidos/registros')
        .set('Authorization', `Bearer ${a.token}`);
      const paginado = await request(app)
        .get('/api/metricas/servicos-concluidos/registros?limite=2')
        .set('Authorization', `Bearer ${a.token}`);

      expect(paginado.body.total, 'a paginação mudou o total').toBe(inteiro.body.total);
      expect(paginado.body.registros.length).toBe(2);
      expect(paginado.body.paginacao.nestaPagina).toBe(2);
    });
  });
});
