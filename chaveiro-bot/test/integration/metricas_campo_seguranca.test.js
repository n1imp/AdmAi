/**
 * Segurança por CAMPO nas métricas.  [Metric Hub #2 · faturamento-liquido]
 *
 * A CAPACIDADE QUE A PRIMEIRA VERTICAL NÃO EXERCITOU
 *   `CAN_VIEW_METRIC` não é `CAN_VIEW_ALL_UNDERLYING_FIELDS`. Ver o total financeiro da empresa e
 *   ver quanto um colega ganhou em cada serviço são direitos distintos — o segundo é dado
 *   financeiro DE UMA PESSOA, e sai sob `financeiro.ver` + `tecnicos.ver`.
 *
 * TODOS OS CASOS INSPECIONAM O PAYLOAD
 *   Status 200 não diz nada sobre o que veio dentro. A propriedade que interessa é o campo estar
 *   AUSENTE do JSON — não escondido, não nulo, não vazio: ausente. Redação acontece no servidor.
 *
 * O CONTROLE POSITIVO NÃO É OPCIONAL
 *   Uma API que apagasse tudo passaria em todos os negativos deste arquivo. Por isso o caso A vem
 *   primeiro e exige que, COM permissão, o campo apareça.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

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
  const a = await criarEmpresaComAdmin(request, app, `FA${Date.now() % 10000}`);
  const b = await criarEmpresaComAdmin(request, app, `FB${(Date.now() + 11) % 10000}`);
  return { a, b };
}

// Unicidade por processo: Date.now()+random colide entre ms adjacentes (1000+999 == 1001+998).
let seqTelefone = 0;
async function criarTecnico(token, nome) {
  const telefone = '5561' + String(Date.now() * 100 + seqTelefone++).slice(-9);
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, telefone, comissao: 10, criarAcesso: false });
  expect(res.status, `pré-condição: criar técnico devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarServico(token, tecnicoNome, local, valor) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tecnico: tecnicoNome,
      local,
      descricao: 'Servico de teste de campo',
      valorCobrado: valor,
      valorMaterial: 0,
    });
  expect(res.status, `pré-condição: criar serviço devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

/**
 * Concede a um funcionário exatamente as permissões pedidas, pelo mecanismo REAL de override do
 * produto — não por um atalho de teste. Se o override não funcionasse, o caso F falharia aqui.
 */
async function comOverride(dono, overrides, nome) {
  const func = await criarFuncionarioComAcesso(request, app, dono.token, { nome });
  const usuarios = await request(app)
    .get('/api/usuarios')
    .set('Authorization', `Bearer ${dono.token}`);
  expect(usuarios.status, 'pré-condição: dono precisa listar usuários').toBe(200);
  /* `/usuarios` devolve o vínculo aninhado (`tecnico.id`), não um `tecnicoId` plano. */
  const alvo = usuarios.body.find((u) => u.tecnico?.id === func.tecnicoId);
  expect(alvo, 'pré-condição: usuário do funcionário não encontrado').toBeTruthy();

  const patch = await request(app)
    .patch(`/api/usuarios/${alvo.id}`)
    .set('Authorization', `Bearer ${dono.token}`)
    .send({ permissoes: overrides });
  expect(patch.status, `pré-condição: override devia ser aceito, deu ${patch.status}`).toBe(200);

  /* Token reemitido: as permissões viajam no login, e um token velho testaria o estado anterior. */
  const login = await request(app)
    .post('/api/auth/login')
    .send({ telefone: func.telefone, password: 'NovaSenhaForte1!' });
  expect(login.status, 'pré-condição: relogin do funcionário').toBe(200);
  return { ...func, token: login.body.token };
}

const metrica = (token, id, qs = '') =>
  request(app).get(`/api/metricas/${id}${qs}`).set('Authorization', `Bearer ${token}`);
const registros = (token, id = 'faturamento-liquido') =>
  request(app).get(`/api/metricas/${id}/registros`).set('Authorization', `Bearer ${token}`);

describe('Metric field-level security', () => {
  describe('os seis casos de permissão', () => {
    it('A: com permissão completa, a decomposição financeira APARECE (controle positivo)', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec A');
      await criarServico(a.token, tec.nome, 'Rua A', 500);

      const res = await registros(a.token);
      expect(res.status).toBe(200);
      expect(res.body.camposOmitidos).toEqual([]);
      const r = res.body.registros[0];
      expect(r.valorCobrado).toBe(500);
      expect(r.valorLiquido).toBe(500);
      expect(r).toHaveProperty('comissaoGerada');
    });

    it('B: com financeiro.ver e sem tecnicos.ver — vê valores, NÃO vê comissão', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec B');
      /* 493 (≠ o 500 do teste A) de propósito [D-STG-K-SUITE-VS-STAGING-01]: a comissão
         (49.3) não coincide com nenhum campo autorizado nem com contadores/ids inteiros. */
      await criarServico(a.token, tec.nome, 'Rua B', 493);
      /* Captura o VALOR REAL da comissão pela visão AUTORIZADA (controle positivo local),
         em vez de recomputar 10% em float no teste — 493*0.1 não é exato em IEEE-754 e um
         `includes()` contra o valor errado passaria VAZIAMENTE. */
      const autorizado = await registros(a.token);
      const COMISSAO = autorizado.body.registros[0].comissaoGerada;
      expect(COMISSAO, 'controle: comissão real precisa existir e ser > 0').toBeGreaterThan(0);
      const restrito = await comOverride(
        a,
        { financeiro: { ver: true }, tecnicos: { ver: false } },
        'Restrito'
      );

      const agregado = await metrica(restrito.token, 'faturamento-liquido');
      expect(agregado.status, 'financeiro.ver precisa dar acesso ao agregado').toBe(200);
      expect(agregado.body.value).toBe(493);

      const res = await registros(restrito.token);
      expect(res.status, 'drilldown exige a mesma permissão do agregado').toBe(200);
      expect(res.body.camposOmitidos).toEqual(['comissaoGerada']);

      const r = res.body.registros[0];
      expect(r.valorLiquido, 'campo autorizado foi negado junto com o proibido').toBe(493);
      expect(r, 'comissão veio no payload para quem não pode vê-la').not.toHaveProperty(
        'comissaoGerada'
      );
      /* Nem em outro canto dos REGISTROS. A varredura é sobre `registros`, não sobre a resposta
         inteira: `camposOmitidos` nomeia o campo de propósito, para a UI dizer que a coluna foi
         omitida em vez de renderizar vazio. Nomear um campo omitido não é vazar seu valor — a
         primeira versão desta asserção confundiu as duas coisas. */
      expect(JSON.stringify(res.body.registros)).not.toMatch(/comissaoGerada/);
      /* O VALOR da comissão não pode ter sobrevivido em canto nenhum dos registros.
         Histórico das versões: (1) regex com backspace literal — impossível de violar;
         (2) substring "50" — casava dentro de "500"; (3) `Object.values(reg).includes(50)`
         — colisão de VALOR com identificadores: contra o staging (sequences não reiniciam
         no TRUNCATE) um `id`/`servicoId` que valha 50 reprovava sem vazamento algum
         [D-STG-K-SUITE-VS-STAGING-01, Codex 01a040e7]. A propriedade é sobre VALOR em
         CAMPOS NÃO-IDENTIFICADORES: chaves id/…Id ficam fora da varredura, e a asserção
         por NOME de campo (acima) continua cobrindo o resto. */
      const chaveIdentificadora = (k) => /^id$|Id$/.test(k);
      expect(
        res.body.registros.some((reg) =>
          Object.entries(reg).some(([k, v]) => !chaveIdentificadora(k) && v === COMISSAO)
        ),
        'o valor da comissão apareceu sob outro nome no registro'
      ).toBe(false);
    });

    it('C: sem financeiro.ver, a métrica inteira é negada', async () => {
      const { a } = await duasEmpresas();
      const semNada = await criarFuncionarioComAcesso(request, app, a.token, {
        nome: 'Sem Financeiro',
      });
      expect((await metrica(semNada.token, 'faturamento-liquido')).status).toBe(403);
      expect((await registros(semNada.token)).status).toBe(403);
    });

    it('D: sem permissão de drilldown, o agregado não abre os registros', async () => {
      const { a } = await duasEmpresas();
      const func = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Auto Escopo' });
      /* `producao-por-tecnico` é auto-escopada: o funcionário vê o próprio agregado e não os
         registros. É a separação entre os dois direitos, numa métrica onde ela é observável. */
      const agregado = await metrica(func.token, 'producao-por-tecnico');
      expect(agregado.status, 'funcionário precisa ver a própria produção').toBe(200);
      expect(
        (await registros(func.token, 'producao-por-tecnico')).status,
        'ver o próprio número não é ver os registros de todos'
      ).toBe(403);
    });

    it('E: outro tenant não alcança registro nenhum', async () => {
      const { a, b } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec E');
      await criarServico(a.token, tec.nome, 'Rua E', 400);

      const doB = await registros(b.token);
      expect(doB.status).toBe(200);
      expect(doB.body.total, 'empresa B viu registro da empresa A').toBe(0);
      /* Positivo: A vê o próprio — senão o zero acima seria a rota quebrada. */
      expect((await registros(a.token)).body.total).toBe(1);
    });

    it('F: override PREVALECE sobre o preset do papel', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec F');
      await criarServico(a.token, tec.nome, 'Rua F', 300);

      const presetPuro = await criarFuncionarioComAcesso(request, app, a.token, {
        nome: 'Preset Puro',
      });
      expect(
        (await metrica(presetPuro.token, 'faturamento-liquido')).status,
        'preset de funcionário não dá financeiro.ver'
      ).toBe(403);

      const comAcesso = await comOverride(a, { financeiro: { ver: true } }, 'Com Override');
      expect(
        (await metrica(comAcesso.token, 'faturamento-liquido')).status,
        'override de financeiro.ver foi ignorado — a autorização não está usando pode()'
      ).toBe(200);
    });
  });

  describe('consistência agregado ↔ registros', () => {
    /**
     * As duas propriedades do §17, que só se separam numa métrica de SOMA. Exigir a segunda de
     * quem teve o campo redigido seria exigir que ele reconstrua o que a política escondeu.
     */
    it('SOURCE_SET vale sempre; reconstrução só para quem vê o campo', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Soma');
      for (const v of [100, 200, 300]) await criarServico(a.token, tec.nome, `Rua ${v}`, v);

      const agregado = await metrica(a.token, 'faturamento-liquido');
      expect(agregado.body.value).toBe(600);

      const comTudo = await registros(a.token);
      expect(comTudo.body.total, 'SOURCE_SET: a lista não é o conjunto que o agregado usou').toBe(
        3
      );
      const soma = comTudo.body.registros.reduce((t, r) => t + r.valorLiquido, 0);
      expect(soma, 'a soma dos registros autorizados não reconstrói o agregado').toBe(
        agregado.body.value
      );

      const restrito = await comOverride(
        a,
        { financeiro: { ver: true }, tecnicos: { ver: false } },
        'Redigido'
      );
      const redigido = await registros(restrito.token);
      expect(redigido.body.total, 'o conjunto mudou junto com a redação de campo').toBe(
        comTudo.body.total
      );
    });

    /**
     * O predicado é da MÉTRICA, não um filtro genérico. `faturamento-liquido` descarta valor
     * inválido; `servicos-concluidos` não olha valor. Um filtro só serviria uma e trairia a outra.
     */
    it('cada métrica lista pelo próprio predicado de elegibilidade', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Predicado');
      await criarServico(a.token, tec.nome, 'Rua boa', 100);
      const ruim = await criarServico(a.token, tec.nome, 'Rua ruim', 50);
      await prisma.servico.update({ where: { id: ruim.id }, data: { valorLiquido: -10 } });

      const receita = await metrica(a.token, 'faturamento-liquido');
      const contagem = await metrica(a.token, 'servicos-concluidos');
      expect(receita.body.value, 'valor inválido entrou na soma').toBe(100);
      expect(contagem.body.value, 'a contagem não deveria olhar valor').toBe(2);

      expect(
        (await registros(a.token)).body.total,
        'o drilldown da receita listou o registro que ela não somou'
      ).toBe(1);
      expect((await registros(a.token, 'servicos-concluidos')).body.total).toBe(2);
    });
  });

  describe('autoridade única', () => {
    it('/dashboard e a Foundation concordam sobre a receita líquida', async () => {
      const { a } = await duasEmpresas();
      const tec = await criarTecnico(a.token, 'Tec Equivalencia');
      for (const v of [150, 250]) await criarServico(a.token, tec.nome, `Rua ${v}`, v);

      const dash = await request(app)
        .get('/api/dashboard?periodo=mes')
        .set('Authorization', `Bearer ${a.token}`);
      const hub = await metrica(a.token, 'faturamento-liquido', '?periodo=mes');
      expect(dash.status).toBe(200);
      expect(hub.body.value, 'Dashboard e Hub divergiram sobre o mesmo número').toBe(
        dash.body.receitaLiquida
      );
    });

    it('o breakdown da receita agrupa de verdade, e os grupos somam o total', async () => {
      const { a } = await duasEmpresas();
      const ana = await criarTecnico(a.token, 'Ana Receita');
      const bruno = await criarTecnico(a.token, 'Bruno Receita');
      await criarServico(a.token, ana.nome, 'Centro', 100);
      await criarServico(a.token, bruno.nome, 'Norte', 200);

      const total = await metrica(a.token, 'faturamento-liquido');
      const porTecnico = await metrica(a.token, 'faturamento-liquido', '?dimensao=tecnico');
      const porLocal = await metrica(a.token, 'faturamento-liquido', '?dimensao=local');

      expect(porTecnico.body.breakdown.grupos.length).toBe(2);
      const soma = porTecnico.body.breakdown.grupos.reduce((t, g) => t + g.valor, 0);
      expect(soma, 'os grupos não somam o agregado').toBe(total.body.value);

      const assinatura = (r) =>
        JSON.stringify(r.body.breakdown.grupos.map((g) => [g.rotulo, g.valor]));
      expect(
        assinatura(porTecnico),
        'dimensões diferentes deram o mesmo recorte — parâmetro ignorado'
      ).not.toBe(assinatura(porLocal));
    });
  });
});
