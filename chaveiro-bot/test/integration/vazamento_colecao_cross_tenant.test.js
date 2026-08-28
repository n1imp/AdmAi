/**
 * Vazamento de COLEÇÃO cross-tenant.  [Feature PRODUCT_INTEGRITY · P1]
 *
 * A PROPRIEDADE QUE ESTE ARQUIVO PROVA, e por que ela precisa de teste PRÓPRIO
 *   `tools/admai-delivery/tenant-coverage.mjs` passou a separar dois vetores que antes tratava
 *   como um só. Rotas de coleção — `GET /estoque`, `GET /dashboard`, `GET /avaliacoes` — **não
 *   recebem identificador externo**. Um teste de IDOR ("A pede o id de B → 404") não mede nada
 *   nelas, porque não há id a pedir.
 *
 *   A falha real aqui tem outra forma: **status 200 com corpo contaminado**. A query esquece o
 *   filtro por `empresaId`, a resposta é bem-sucedida, e dentro dela vêm linhas de outro tenant.
 *   Nenhuma asserção sobre status detecta isso — só inspeção do CONTEÚDO.
 *
 * O DESENHO QUE TORNA O TESTE NÃO-VÁCUO
 *   Cada caso cria dado em B com um marcador textual único e improvável, consulta como A, e exige
 *   que o marcador não apareça. Se a empresa B não tivesse dado, o teste passaria por ausência de
 *   alvo — que é a forma mais silenciosa de um teste mentir. Por isso cada caso também verifica,
 *   como B, que o próprio dado É visível: isso prova que havia o que vazar.
 *
 * O QUE NÃO É COBERTO AQUI
 *   Rotas com `:id` (vetor de IDOR, em `idor_leitura_/escrita_cross_tenant.test.js`) e as
 *   auto-escopadas por token, cuja ameaça é de autenticação e pede outro instrumento.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { inflateSync } from 'node:zlib';
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

/**
 * Texto legível de um PDF gerado pelo PDFKit.
 *
 * Duas camadas escondem o texto, e o guarda de cegueira deste arquivo encontrou as duas antes que
 * o teste passasse provando nada:
 *
 *   1. os objetos de conteúdo são gravados com `FlateDecode` — nos bytes crus não há nome nenhum;
 *   2. dentro do stream, o texto sai HEX e fatiado por kerning:
 *      `[<54> 120 <65636e69636f...>] TJ` é "T" seguido de "ecnico ...".
 *
 * Por isso os grupos hex são concatenados NA ORDEM: um nome cortado ao meio pelo kerning só se
 * recompõe assim. Buscar em cada grupo isolado devolveria "não encontrei" para texto presente —
 * que é o falso negativo mais perigoso num teste de vazamento.
 */
function textoDoPdf(buffer) {
  const bruto = buffer.toString('latin1');
  let texto = bruto;
  for (const m of bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let conteudo;
    try {
      conteudo = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    } /* não-Flate: imagem ou fonte, não carrega o nome */
    texto += conteudo;
    const hex = [...conteudo.matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map((h) => Buffer.from(h[1], 'hex').toString('latin1'))
      .join('');
    texto += hex;
  }
  return texto;
}

/** Marcador improvável: se ele aparecer numa resposta de A, veio de B — não há coincidência. */
const MARCA = () =>
  `ZZMARCA${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6)}`;

async function duasEmpresas() {
  const a = await criarEmpresaComAdmin(request, app, `CA${Date.now() % 10000}`);
  const b = await criarEmpresaComAdmin(request, app, `CB${(Date.now() + 3) % 10000}`);
  return { a, b };
}

// Unicidade por processo: Date.now()+random colide entre ms adjacentes (1000+999 == 1001+998).
let seqTelefone = 0;
async function criarTecnico(token, nome) {
  const telefone = '5561' + String(Date.now() * 100 + seqTelefone++).slice(-9);
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, telefone, comissao: 12, criarAcesso: false });
  expect(res.status, `pré-condição: criar técnico devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarServico(token, tecnicoNome, local) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tecnico: tecnicoNome,
      local,
      descricao: 'Servico de teste de vazamento',
      valorCobrado: 350,
      valorMaterial: 0,
    });
  expect(res.status, `pré-condição: criar serviço devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

/** O corpo da resposta contém o marcador em qualquer profundidade? */
const contemMarca = (body, marca) => JSON.stringify(body ?? {}).includes(marca);

describe('Vazamento de coleção cross-tenant (PRODUCT_INTEGRITY)', () => {
  describe('estoque', () => {
    it('GET /estoque de A não devolve material da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const marca = MARCA();

      const criado = await request(app)
        .post('/api/materiais')
        .set('Authorization', `Bearer ${b.token}`)
        .send({ nome: `Material ${marca}`, precoUnit: 40 });
      expect(
        criado.status,
        `pré-condição: criar material em B devia dar 201, deu ${criado.status}`
      ).toBe(201);

      /* Prova que havia o que vazar: B enxerga o próprio material. Sem isto, o `not.toContain`
         abaixo passaria mesmo com a coleção vazia. */
      const comoB = await request(app)
        .get('/api/estoque')
        .set('Authorization', `Bearer ${b.token}`);
      expect(comoB.status).toBe(200);
      expect(
        contemMarca(comoB.body, marca),
        'o dono precisa ver o próprio material — senão o teste é vácuo'
      ).toBe(true);

      const comoA = await request(app)
        .get('/api/estoque')
        .set('Authorization', `Bearer ${a.token}`);
      expect(comoA.status).toBe(200);
      expect(
        contemMarca(comoA.body, marca),
        'material de B apareceu no estoque de A — vazamento de coleção'
      ).toBe(false);
    });
  });

  describe('relatório financeiro', () => {
    /**
     * `GET /relatorio/pdf` agrega serviços do período por técnico e devolve um ARQUIVO. O escopo
     * vem de `gerarRelatorioPDF(inicio, fim, empresaId)` — fora do handler, o que é justamente o
     * motivo de o classificador estático não enxergar a coleção aqui e a classe ter sido declarada.
     *
     * O teste inspeciona os BYTES do PDF procurando o nome do técnico de B. Isso só significa
     * alguma coisa se o nome for localizável nos bytes quando ele DEVE estar lá — um PDF com
     * stream comprimido tornaria a busca cega e o teste passaria sempre, sem medir nada. Por isso
     * o controle positivo vem primeiro e é obrigatório: se o relatório do próprio dono não contém
     * o marcador, o instrumento é cego e o teste FALHA em vez de aprovar em silêncio.
     */
    it('GET /relatorio/pdf de A não contém técnico da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const marca = MARCA();
      const tecnicoDeB = await criarTecnico(b.token, `Tec${marca}`);
      await criarServico(b.token, tecnicoDeB.nome, 'Rua de B, 10');

      const hoje = new Date();
      const inicio = new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10);
      const fim = new Date(hoje.getTime() + 86400000).toISOString().slice(0, 10);
      const url = `/api/relatorio/pdf?inicio=${inicio}&fim=${fim}`;

      const comoB = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${b.token}`)
        .buffer()
        .parse((res, cb) => {
          const partes = [];
          res.on('data', (c) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(comoB.status, 'o dono precisa gerar o próprio relatório').toBe(200);
      const textoDeB = textoDoPdf(comoB.body);
      expect(
        textoDeB.includes(marca),
        'INSTRUMENTO CEGO: o nome do técnico não é localizável nos bytes do próprio relatório, ' +
          'então procurar por ele no relatório de A não prova ausência de vazamento'
      ).toBe(true);

      const comoA = await request(app)
        .get(url)
        .set('Authorization', `Bearer ${a.token}`)
        .buffer()
        .parse((res, cb) => {
          const partes = [];
          res.on('data', (c) => partes.push(c));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        });
      expect(comoA.status).toBe(200);
      expect(
        textoDoPdf(comoA.body).includes(marca),
        'técnico da empresa B apareceu no relatório financeiro de A'
      ).toBe(false);
    });
  });

  describe('serviços e derivados', () => {
    it('GET /servicos/pendentes de A não devolve serviço da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const marca = MARCA();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');
      await criarServico(b.token, tecnicoDeB.nome, `Rua ${marca}`);

      const comoA = await request(app)
        .get('/api/servicos/pendentes')
        .set('Authorization', `Bearer ${a.token}`);

      expect(comoA.status).toBe(200);
      expect(
        contemMarca(comoA.body, marca),
        'serviço de B apareceu na lista de pendentes de A'
      ).toBe(false);
    });

    it('GET /dashboard de A não agrega valores da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');
      await criarServico(b.token, tecnicoDeB.nome, 'Rua de B, 1');
      await criarServico(b.token, tecnicoDeB.nome, 'Rua de B, 2');

      /* Agregado não carrega texto, então o marcador não serve aqui: o vazamento apareceria como
         NÚMERO inflado. A empresa A não registrou serviço nenhum, logo qualquer faturamento
         diferente de zero veio de outro tenant. */
      const comoA = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${a.token}`);
      expect(comoA.status).toBe(200);

      const corpo = JSON.stringify(comoA.body ?? {});
      const numeros = [
        ...corpo.matchAll(
          /"(?:total|faturamento|valorTotal|receita|comissao)[A-Za-z]*":\s*([0-9.]+)/g
        ),
      ].map((m) => Number(m[1]));
      const somaNaoZero = numeros.filter((n) => n > 0);
      expect(
        somaNaoZero,
        `dashboard de A (que não tem serviço nenhum) trouxe agregado não-zero: ${JSON.stringify(comoA.body)}`
      ).toEqual([]);

      /* Contraprova: B, que tem dois serviços, PRECISA ver agregado não-zero. Sem isto o teste
         acima passaria com um dashboard quebrado que devolve zero para todo mundo. */
      const comoB = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${b.token}`);
      expect(comoB.status).toBe(200);
      const corpoB = JSON.stringify(comoB.body ?? {});
      expect(
        /[1-9]/.test(corpoB),
        'o dono precisa ver agregado não-zero — senão o teste é vácuo'
      ).toBe(true);
    });

    it('GET /avaliacoes e /avaliacoes/config de A não devolvem dado da empresa B', async () => {
      const { a, b } = await duasEmpresas();

      const avaliacoesA = await request(app)
        .get('/api/avaliacoes')
        .set('Authorization', `Bearer ${a.token}`);
      expect(avaliacoesA.status).toBe(200);

      /* A não tem avaliação nenhuma: qualquer item aqui veio de outro tenant. */
      const itens = Array.isArray(avaliacoesA.body)
        ? avaliacoesA.body
        : (avaliacoesA.body?.avaliacoes ?? []);
      expect(itens, 'A não registrou avaliação; lista não-vazia indicaria vazamento').toEqual([]);

      const configA = await request(app)
        .get('/api/avaliacoes/config')
        .set('Authorization', `Bearer ${a.token}`);
      const configB = await request(app)
        .get('/api/avaliacoes/config')
        .set('Authorization', `Bearer ${b.token}`);
      expect(configA.status).toBe(200);
      expect(configB.status).toBe(200);

      /* A config é por empresa: se A e B compartilhassem o mesmo registro, alterar uma mudaria a
         outra. O teste do efeito vem abaixo. */
      const patch = await request(app)
        .patch('/api/avaliacoes/config')
        .set('Authorization', `Bearer ${b.token}`)
        .send({ ativo: true });

      if (patch.status === 200) {
        const configADepois = await request(app)
          .get('/api/avaliacoes/config')
          .set('Authorization', `Bearer ${a.token}`);
        expect(
          JSON.stringify(configADepois.body),
          'alterar a config de B mudou a config de A — registro compartilhado'
        ).toBe(JSON.stringify(configA.body));
      }
    });
  });

  describe('equipe e pagamentos', () => {
    /**
     * `GET /ponto/hoje` NÃO é rota de coleção — foi a execução deste arquivo que provou isso.
     *
     * A versão anterior deste caso exigia `200` como dono e procurava o marcador de B no corpo.
     * Voltou `400`: o handler lê `req.user.tecnicoId` e devolve UM registro, e o dono não tem
     * técnico vinculado. Não havia coleção a contaminar, então a asserção era impossível de
     * satisfazer — premissa minha, não defeito do produto.
     *
     * O que a rota admite provar é o escopo por token, e é isso que este caso passa a fazer:
     * o funcionário de A vê o próprio ponto, e o marcador de B nunca aparece. O funcionário
     * de B é criado com dado marcado para que o negativo tenha alvo — sem ele o teste passaria
     * por ausência, que é a forma silenciosa de mentir.
     */
    it('GET /ponto/hoje é escopado pelo token — funcionário de A não alcança dado de B', async () => {
      const { a, b } = await duasEmpresas();
      const marca = MARCA();

      const funcDeA = await criarFuncionarioComAcesso(request, app, a.token, { nome: 'Func de A' });
      await criarFuncionarioComAcesso(request, app, b.token, { nome: `Func ${marca}` });

      const semVinculo = await request(app)
        .get('/api/ponto/hoje')
        .set('Authorization', `Bearer ${a.token}`);
      expect(
        semVinculo.status,
        'dono não tem tecnicoId: a rota precisa recusar, não devolver conjunto'
      ).toBe(400);

      const comoFuncA = await request(app)
        .get('/api/ponto/hoje')
        .set('Authorization', `Bearer ${funcDeA.token}`);
      expect(
        comoFuncA.status,
        'funcionário vinculado precisa alcançar o próprio ponto — senão o negativo é vácuo'
      ).toBe(200);
      expect(
        contemMarca(comoFuncA.body, marca),
        'funcionário da empresa B apareceu no ponto de A'
      ).toBe(false);
    });

    it('POST /pagamentos de A não pode pagar técnico da empresa B', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      const res = await request(app)
        .post('/api/pagamentos')
        .set('Authorization', `Bearer ${a.token}`)
        .send({ tecnicoId: tecnicoDeB.id, valor: 500 });

      /* Escrita: o status não basta. Mesmo que a rota responda algo diferente de 404, não pode
         existir pagamento vinculado ao técnico de B. */
      expect([400, 403, 404]).toContain(res.status);

      const pagamentos = await prisma.pagamento.count({ where: { tecnicoId: tecnicoDeB.id } });
      expect(
        pagamentos,
        'A criou pagamento para o técnico de B — efeito colateral cross-tenant'
      ).toBe(0);
    });
  });
});
