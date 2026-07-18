import { prisma } from '../db/prisma.js';

/**
 * Resolução de materiais informados pelo técnico no WhatsApp contra o catálogo.
 *
 * Princípios (decisões do produto):
 *  - O catálogo é a única fonte de verdade. O bot NUNCA cria produto.
 *  - O técnico informa apenas NOME + QUANTIDADE; o valor é calculado a partir
 *    do custo (precoUnit) do catálogo × quantidade.
 *  - A busca é tolerante a erros de digitação, acentuação e espaçamento (fuzzy).
 *  - Se um material não casar com o catálogo, é reportado como "não encontrado"
 *    para o bot avisar o técnico a cadastrar pelo app.
 *
 * Tudo aqui são funções puras/testáveis — pensadas para serem reusadas pelo
 * fluxo interativo de cadastro de serviço que está sendo desenvolvido em paralelo.
 */

// ── NORMALIZAÇÃO E SIMILARIDADE ───────────────────────────────────────────────

/** Remove acentos, baixa caixa e colapsa espaços — base para comparação fuzzy. */
export function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // pontuação vira espaço
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distância de edição de Levenshtein entre duas strings. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let linhaAnterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let linhaAtual = new Array(b.length + 1);

  for (let i = 0; i < a.length; i++) {
    linhaAtual[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const custo = a[i] === b[j] ? 0 : 1;
      linhaAtual[j + 1] = Math.min(
        linhaAtual[j] + 1, // inserção
        linhaAnterior[j + 1] + 1, // remoção
        linhaAnterior[j] + custo // substituição
      );
    }
    [linhaAnterior, linhaAtual] = [linhaAtual, linhaAnterior];
  }
  return linhaAnterior[b.length];
}

/**
 * Pontuação de similaridade 0..1 entre dois nomes já considerando:
 *  - igualdade exata (1)
 *  - substring (um contém o outro) — forte sinal
 *  - similaridade por Levenshtein normalizada pelo tamanho
 *  - sobreposição de tokens (palavras em comum), para nomes com ordem trocada
 */
export function similaridade(consulta, alvo) {
  const a = normalizar(consulta);
  const b = normalizar(alvo);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Substring: "fechadura" casa com "fechadura tetra" com score alto
  if (b.includes(a) || a.includes(b)) {
    const menor = Math.min(a.length, b.length);
    const maior = Math.max(a.length, b.length);
    return 0.9 * (menor / maior) + 0.1;
  }

  const dist = levenshtein(a, b);
  const scoreLev = 1 - dist / Math.max(a.length, b.length);

  // Sobreposição de tokens (ordem das palavras não importa)
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const intersec = [...ta].filter((t) => tb.has(t)).length;
  const scoreToken = intersec / Math.max(ta.size, tb.size);

  return Math.max(scoreLev, scoreToken);
}

// ── PARSE DE NOME + QUANTIDADE ────────────────────────────────────────────────

/**
 * Extrai { nome, quantidade } de uma linha de material informada pelo técnico.
 * Formatos aceitos:
 *   "Fechadura Tetra"            → qtd 1
 *   "Fechadura Tetra x2"         → qtd 2   (x / × / X)
 *   "Fechadura Tetra - 2"        → qtd 2
 *   "2 Fechadura Tetra"          → qtd 2
 *   "2x Fechadura Tetra"         → qtd 2
 * Múltiplos itens podem ser separados por vírgula, ponto-e-vírgula ou " e ".
 */
export function parsearItemMaterial(linha) {
  let texto = (linha ?? '').trim();
  if (!texto) return null;
  let quantidade = 1;

  // "Nome xN" ou "Nome × N" no fim
  let m = texto.match(/^(.+?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i);
  if (m) return { nome: m[1].trim(), quantidade: paraNumero(m[2]) };

  // "Nome - N" no fim
  m = texto.match(/^(.+?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*$/);
  if (m) return { nome: m[1].trim(), quantidade: paraNumero(m[2]) };

  // "N Nome" ou "Nx Nome" no começo
  m = texto.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i);
  if (m) return { nome: m[2].trim(), quantidade: paraNumero(m[1]) };

  return { nome: texto, quantidade };
}

function paraNumero(str) {
  const n = parseFloat(String(str).replace(',', '.'));
  return isNaN(n) || n <= 0 ? 1 : n;
}

/** Separa a string de material em itens individuais (vírgula, ; ou " e "). */
export function separarItens(material) {
  if (!material) return [];
  return material
    .split(/\s*[,;]\s*|\s+e\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── RESOLUÇÃO CONTRA O CATÁLOGO ───────────────────────────────────────────────

const LIMIAR_CONFIANCA = 0.6; // abaixo disso, considera "não encontrado"

/**
 * Encontra o melhor material do catálogo para um nome informado.
 * @param {string} nome
 * @param {Array<{id,nome,precoUnit,precoVenda,unidade,quantidadeAtual}>} catalogo
 * @returns {{ material, score } | null}
 */
export function encontrarNoCatalogo(nome, catalogo) {
  let melhor = null;
  let melhorScore = 0;
  for (const material of catalogo) {
    const score = similaridade(nome, material.nome);
    if (score > melhorScore) {
      melhorScore = score;
      melhor = material;
    }
  }
  if (melhor && melhorScore >= LIMIAR_CONFIANCA) {
    return { material: melhor, score: parseFloat(melhorScore.toFixed(3)) };
  }
  return null;
}

/**
 * Resolve TODOS os materiais de uma string contra o catálogo.
 *
 * @param {string} materialTexto  Ex.: "Fechadura Tetra x2, Espelho - 1"
 * @param {number} empresaId       Empresa (tenant) dona do catálogo consultado.
 * @param {object} [client]        Cliente Prisma (para testes/transações).
 * @returns {Promise<{
 *   itens: Array<{ materialId, nome, quantidade, valorUnitario, valorTotal, score }>,
 *   naoEncontrados: string[],
 *   valorMaterialTotal: number
 * }>}
 */
export async function resolverMateriaisDoServico(materialTexto, empresaId, client = prisma) {
  if (!empresaId) throw new Error('empresaId obrigatório para resolver materiais do catálogo');
  const linhas = separarItens(materialTexto);
  if (linhas.length === 0) {
    return { itens: [], naoEncontrados: [], valorMaterialTotal: 0 };
  }

  const catalogo = await client.material.findMany({
    where: { empresaId },
    select: {
      id: true,
      nome: true,
      precoUnit: true,
      precoVenda: true,
      unidade: true,
      quantidadeAtual: true,
    },
  });

  const itens = [];
  const naoEncontrados = [];
  let valorMaterialTotal = 0;

  for (const linha of linhas) {
    const { nome, quantidade } = parsearItemMaterial(linha);
    const achado = encontrarNoCatalogo(nome, catalogo);
    if (!achado) {
      naoEncontrados.push(nome);
      continue;
    }
    // Decisão do produto: o valor do material usa o CUSTO (precoUnit).
    const valorUnitario = achado.material.precoUnit ?? 0;
    const valorTotal = parseFloat((valorUnitario * quantidade).toFixed(2));
    valorMaterialTotal += valorTotal;
    itens.push({
      materialId: achado.material.id,
      nome: achado.material.nome,
      quantidade,
      valorUnitario,
      valorTotal,
      unidade: achado.material.unidade,
      score: achado.score,
    });
  }

  return {
    itens,
    naoEncontrados,
    valorMaterialTotal: parseFloat(valorMaterialTotal.toFixed(2)),
  };
}
