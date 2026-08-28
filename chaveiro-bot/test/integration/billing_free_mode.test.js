/**
 * MVP SEM PAYWALL — a decisão soberana (Refoundation Cycle 1, D2 2026-08-28) tirou assinaturas
 * pagas do MVP. Este arquivo prova o comportamento de RUNTIME do produto: com
 * `ASSINATURA_ENFORCEMENT_ENABLED` desligada (o default — só a string 'true' liga), NENHUM
 * estado comercial barra o uso.
 *
 * A suíte de integração liga a flag globalmente (vitest.integration.config.js) para manter a
 * matriz do gate provada em billing_access_audit/paywall_402_motivos; aqui o app é re-importado
 * com a flag DESLIGADA — mesmo padrão flag-off de servico_atual.test.js. As fixtures de estado
 * morto são as mesmas do audit: as duas suítes enxergam o MESMO mundo, com vereditos opostos
 * por causa da flag — que é exatamente o contrato.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/** Mesmas rotas de produto do billing_access_audit — o veredito é que INVERTE, não o alvo. */
const ROTAS_DE_PRODUTO = [
  { metodo: 'get', caminho: '/api/servicos', nome: 'listar serviços' },
  { metodo: 'get', caminho: '/api/tecnicos', nome: 'listar técnicos' },
  { metodo: 'get', caminho: '/api/estoque', nome: 'listar estoque' },
  { metodo: 'get', caminho: '/api/dashboard', nome: 'dashboard' },
  { metodo: 'get', caminho: '/api/metricas', nome: 'catálogo de métricas' },
  { metodo: 'get', caminho: '/api/me/servicos', nome: 'meus serviços' },
];

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
  { rotulo: 'past_due', dados: { status: 'past_due', periodoFimEm: new Date('2020-01-31') } },
  {
    rotulo: 'trialing com trial vencido há anos',
    dados: { status: 'trialing', trialFimEm: new Date('2020-01-01') },
  },
];

function pareceBloqueioComercial(res) {
  if (res.status === 402) return true;
  if (res.status !== 403) return false;
  const texto = JSON.stringify(res.body ?? {}).toLowerCase();
  return /assinatura|trial|pagamento|payment|subscription|plano|cobran/.test(texto);
}

describe('MVP FREE MODE — flag desligada: estado comercial NÃO barra o produto', () => {
  let app;
  let middlewareOff;

  beforeAll(async () => {
    // Re-importa o app com a flag DESLIGADA (env é lido no boot do módulo).
    vi.resetModules();
    vi.stubEnv('ASSINATURA_ENFORCEMENT_ENABLED', '');
    const { criarApp } = await import('../../src/app.js');
    ({ app } = criarApp());
    middlewareOff = (await import('../../src/middlewares/assinatura.js')).requireAssinaturaAtiva;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await limparBanco();
  });

  for (const estado of ESTADOS_MORTOS) {
    it(`assinatura ${estado.rotulo}: TODAS as rotas de produto respondem normalmente`, async () => {
      const { token, empresaId } = await criarEmpresaComAdmin(
        request,
        app,
        `F${Date.now() % 1000}`
      );
      await prisma.assinatura.update({ where: { empresaId }, data: estado.dados });

      const barradas = [];
      for (const rota of ROTAS_DE_PRODUTO) {
        const agente = request(app);
        const res = await agente[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
        if (pareceBloqueioComercial(res)) barradas.push(`${rota.nome} → ${res.status}`);
      }
      expect(
        barradas,
        `MVP livre: com ${estado.rotulo}, nada pode barrar:\n  ${barradas.join('\n  ')}`
      ).toEqual([]);
    });
  }

  it('sem NENHUMA assinatura o produto responde (a ausência não barra no MVP livre)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `N${Date.now() % 1000}`);
    await prisma.assinatura.deleteMany({ where: { empresaId } });

    const barradas = [];
    for (const rota of ROTAS_DE_PRODUTO) {
      const agente = request(app);
      const res = await agente[rota.metodo](rota.caminho).set('Authorization', `Bearer ${token}`);
      if (pareceBloqueioComercial(res)) barradas.push(`${rota.nome} → ${res.status}`);
    }
    expect(barradas).toEqual([]);
  });

  it('escrita também passa com assinatura cancelada (gate integralmente inerte)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, `E${Date.now() % 1000}`);
    await prisma.assinatura.update({
      where: { empresaId },
      data: {
        status: 'canceled',
        canceladoEm: new Date('2020-01-01'),
        periodoFimEm: new Date('2020-01-31'),
      },
    });
    const res = await request(app)
      .post('/api/tecnicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Tecnico Free Mode',
        telefone: '5532' + String(Date.now()).slice(-9),
        comissao: 10,
      });
    expect(pareceBloqueioComercial(res), `escrita barrada no MVP livre → ${res.status}`).toBe(
      false
    );
    expect(res.status).toBe(201);
  });

  it('bypass ocorre ANTES de req.user/req.db: middleware com req vazio chama next() sem tocar nada', async () => {
    // Restrição do DECISOR (thread 01a04a99): com a flag off, nenhuma consulta ocorre.
    // req VAZIO prova por construção — qualquer acesso a user/db lançaria.
    let passou = false;
    middlewareOff({}, {}, () => {
      passou = true;
    });
    expect(passou).toBe(true);
  });
});
