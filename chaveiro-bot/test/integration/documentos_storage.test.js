/**
 * Teste de integração: o ramo de STORAGE dos documentos — o que produção usa.  [GAP-DOC-01]
 *
 * O INCIDENTE QUE ORIGINOU ESTE ARQUIVO
 *   O smoke test em produção de 2026-08-05 (`docs/GO_LIVE_CHECKLIST.md` A9) registrou
 *   `POST /me/documentos` → `500 {"erro":"Erro interno"}`, reproduzível, com a causa não
 *   diagnosticada — a aplicação não expõe stack por desenho e não havia acesso aos logs.
 *
 *   `documentos.test.js` passava, e continua passando, porque `documentos.js:129` bifurca:
 *
 *       if (storageHabilitado()) { await uploadPrivado(BUCKET, ...) }   // PRODUÇÃO
 *       else                     { await writeFile(disco, ...) }        // dev/test
 *
 *   `storageHabilitado()` é `Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)`. Em teste as duas
 *   são ausentes, então TODA a suíte existente entra pelo disco. O ramo que produção executa nunca
 *   foi exercitado por teste nenhum — nem uma vez, nem no caminho feliz.
 *
 * A CAUSA, e ela está escrita no próprio repositório
 *   `server.js:53-58` avisa no boot: com `DOCUMENTOS_ENABLED=true` e storage configurado, um bucket
 *   ausente faz o upload responder 500, porque `uploadPrivado` lança e NÃO há fallback pro disco.
 *   Nada no código cria `documentos-tecnico`; a provisão é a ferramenta `npm run bucket:provision`.
 *   Ou seja: o defeito em produção é de PROVISIONAMENTO, e o defeito aqui era de COBERTURA. Este
 *   arquivo fecha o segundo. O primeiro exige credencial de produção e não é decisão minha.
 *
 * POR QUE MOCKAR O STORAGE E NÃO O `storageHabilitado`
 *   Mockar o módulo inteiro deixaria a rota falar com um dublê e provaria a minha reimplementação.
 *   Aqui o dublê é só a FRONTEIRA de rede (o cliente Supabase): `storageHabilitado` passa a
 *   responder `true`, e `uploadPrivado`/`urlAssinada` são controlados caso a caso. Tudo entre a
 *   rota e essa fronteira — validação, magic bytes, ordem das operações, escopo por técnico — roda
 *   de verdade contra PostgreSQL real.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

/* A fronteira dublada. `storageHabilitado` fixo em `true` coloca a rota no caminho de produção;
   as outras duas são espiões que cada caso arma. O resto do módulo fica real. */
vi.mock('../../src/services/storage.js', async (orig) => ({
  ...(await orig()),
  storageHabilitado: () => true,
  uploadPrivado: vi.fn(),
  urlAssinada: vi.fn(),
}));

import { uploadPrivado, urlAssinada } from '../../src/services/storage.js';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

let app;

/* PDF mínimo válido: o magic byte `%PDF-` é conferido pela rota antes de qualquer storage. */
const PDF_DATA_URI = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%teste\n').toString('base64')}`;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
  uploadPrivado.mockReset();
  urlAssinada.mockReset();
  uploadPrivado.mockResolvedValue(undefined);
  urlAssinada.mockResolvedValue(null);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function novoFuncionario(sufixo, telefone) {
  const { token: dono } = await criarEmpresaComAdmin(request, app, sufixo);
  return criarFuncionarioComAcesso(request, app, dono, { telefone });
}

const enviar = (token, corpo = {}) =>
  request(app)
    .post('/api/me/documentos')
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'contrato', nome: 'contrato.pdf', arquivo: PDF_DATA_URI, ...corpo });

describe('Upload pelo ramo de storage [GAP-DOC-01]', () => {
  it('CONTROLE POSITIVO: com storage OK o upload responde 201 e grava o documento', async () => {
    const { token } = await novoFuncionario('S1', '5521990310000');

    const res = await enviar(token);

    expect(res.status).toBe(201);
    expect(res.body.documento.mime).toBe('application/pdf');
    /* Sem isto, "não estourou" seria confundido com "subiu": um `uploadPrivado` jamais chamado
       satisfaria todos os outros casos deste arquivo. */
    expect(uploadPrivado).toHaveBeenCalledTimes(1);
    const [bucket, chave, buffer, mime] = uploadPrivado.mock.calls[0];
    expect(bucket).toBe('documentos-tecnico');
    expect(mime).toBe('application/pdf');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    /* A chave que foi para o storage é a mesma que ficou na linha — se divergirem, o download
       procura um objeto que não existe e o documento vira inacessível em silêncio. */
    const doc = await prisma.documentoTecnico.findFirst();
    expect(doc.storageKey).toBe(chave);
  });

  it('a chave de storage NÃO é derivável do documento e não vaza na resposta', async () => {
    const { token } = await novoFuncionario('S2', '5521990320000');

    const res = await enviar(token, { nome: 'contrato-do-joao.pdf' });
    const [, chave] = uploadPrivado.mock.calls[0];

    expect(res.body.documento.storageKey).toBeUndefined();
    /* Bucket privado protege por credencial; chave adivinhável derruba isso assim que alguém
       consegue uma URL assinada de OUTRO objeto. Nome e id não podem aparecer nela. */
    expect(chave).not.toContain('contrato-do-joao');
    expect(chave).not.toContain(String(res.body.documento.id));
  });

  it('BUCKET AUSENTE — o caso exato de produção: 500, e o erro do storage não vaza ao cliente', async () => {
    const { token } = await novoFuncionario('S3', '5521990330000');
    /* Mensagem no formato que `uploadPrivado` monta quando o Supabase recusa por bucket inexistente. */
    uploadPrivado.mockRejectedValue(
      new Error('Falha no upload privado documentos-tecnico/abc.pdf: Bucket not found')
    );

    const res = await enviar(token);

    expect(res.status).toBe(500);
    expect(res.body.erro).toBe('Erro interno');
    /* O 500 é opaco por desenho — e foi exatamente isso que impediu diagnosticar o incidente sem
       acesso aos logs. Aqui a opacidade é o comportamento correto e fica fixada: nome de bucket e
       mensagem do provedor são infraestrutura, não coisa de cliente. */
    expect(JSON.stringify(res.body)).not.toContain('documentos-tecnico');
    expect(JSON.stringify(res.body)).not.toContain('Bucket not found');
  });

  it('falha no storage NÃO deixa linha órfã no banco', async () => {
    const { token } = await novoFuncionario('S4', '5521990340000');
    uploadPrivado.mockRejectedValue(new Error('Bucket not found'));

    await enviar(token);

    /* A ordem importa e por isso é fixada: o upload roda ANTES do `create`. Invertida, o banco
       ficaria apontando para um objeto que nunca existiu, e a lista mostraria um documento que
       não abre — pior que o 500, porque o erro sumiria da vista. */
    const docs = await prisma.documentoTecnico.findMany();
    expect(docs).toHaveLength(0);
  });

  it('NÃO há fallback silencioso pro disco quando o storage falha', async () => {
    const { token } = await novoFuncionario('S5', '5521990350000');
    uploadPrivado.mockRejectedValue(new Error('Bucket not found'));

    const res = await enviar(token);

    /* Se a rota caísse pro disco aqui, o upload responderia 201 numa réplica e o arquivo ficaria
       preso no disco DAQUELA réplica — invisível para as outras. Degradar assim é pior que falhar:
       o usuário acredita que salvou. */
    expect(res.status).toBe(500);
    expect(await prisma.documentoTecnico.count()).toBe(0);
  });

  it('validação acontece ANTES do storage: arquivo inválido nem chega a subir', async () => {
    const { token } = await novoFuncionario('S6', '5521990360000');

    const res = await enviar(token, {
      arquivo: `data:application/pdf;base64,${Buffer.from('isto nao e um pdf').toString('base64')}`,
    });

    expect(res.status).toBe(400);
    /* Gastar chamada de rede com lixo é desperdício, mas o motivo real é outro: subir primeiro e
       validar depois deixaria objeto órfão no bucket a cada tentativa inválida. */
    expect(uploadPrivado).not.toHaveBeenCalled();
  });
});

describe('Download pelo ramo de storage [GAP-DOC-01]', () => {
  async function subir(token) {
    const res = await enviar(token);
    expect(res.status).toBe(201);
    return res.body.documento.id;
  }

  it('CONTROLE POSITIVO: com URL assinada responde 302 para ela, sem cache', async () => {
    const { token } = await novoFuncionario('S7', '5521990370000');
    const id = await subir(token);
    urlAssinada.mockResolvedValue('https://storage.exemplo/assinada?token=xyz');

    const res = await request(app)
      .get(`/api/me/documentos/${id}/arquivo`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://storage.exemplo/assinada?token=xyz');
    /* Documento pessoal em cache compartilhado é vazamento com prazo. */
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('a URL assinada é pedida para a chave DAQUELE documento, com expiração curta', async () => {
    const { token } = await novoFuncionario('S8', '5521990380000');
    const id = await subir(token);
    urlAssinada.mockResolvedValue('https://storage.exemplo/ok');

    await request(app)
      .get(`/api/me/documentos/${id}/arquivo`)
      .set('Authorization', `Bearer ${token}`);

    const doc = await prisma.documentoTecnico.findUnique({ where: { id } });
    const [bucket, chave, expira] = urlAssinada.mock.calls[0];
    expect(bucket).toBe('documentos-tecnico');
    expect(chave).toBe(doc.storageKey);
    /* URL assinada longa vira link permanente compartilhável — o oposto de bucket privado. */
    expect(expira).toBeLessThanOrEqual(300);
  });

  it('storage sem a URL cai pro disco, e sem o arquivo lá responde 404 — não 500', async () => {
    const { token } = await novoFuncionario('S9', '5521990390000');
    const id = await subir(token);
    urlAssinada.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/me/documentos/${id}/arquivo`)
      .set('Authorization', `Bearer ${token}`);

    /* O objeto foi para o storage (dublado), então não existe no disco. 404 é a resposta honesta:
       "não achei o arquivo", distinta de "a aplicação quebrou". Um 500 aqui mandaria investigar o
       serviço quando o problema é o objeto. */
    expect(res.status).toBe(404);
  });

  it('ISOLAMENTO: outro funcionário não baixa o documento, mesmo com storage OK', async () => {
    const { token: a } = await novoFuncionario('SA', '5521990400000');
    const { token: b } = await novoFuncionario('SB', '5521990410000');
    const id = await subir(a);
    urlAssinada.mockResolvedValue('https://storage.exemplo/ok');

    const res = await request(app)
      .get(`/api/me/documentos/${id}/arquivo`)
      .set('Authorization', `Bearer ${b}`);

    /* A recusa vem do escopo por técnico, ANTES do storage. Se viesse depois, uma URL assinada já
       teria sido emitida para o documento alheio — e URL assinada emitida é acesso concedido,
       independente do status que a resposta carregue. */
    expect(res.status).toBe(404);
    expect(urlAssinada).not.toHaveBeenCalled();
  });
});
