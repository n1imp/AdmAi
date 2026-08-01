// @ts-check
// Helpers de máscara de moeda BRL — sem dependências externas.
//
// A ideia: o usuário digita apenas dígitos e tratamos o número inteiro
// resultante como "centavos". Ex.: digitar 1 2 3 4 5 6 vira "1.234,56".
// `formatarMoedaInput` produz a string mascarada (para exibir no input) e
// `moedaParaNumero` converte de volta para Number (ex.: 1234.56) para a API.

// Recebe o valor cru do input (qualquer texto) e devolve a string mascarada
// no formato pt-BR (sem o símbolo R$, para casar com o label "(R$)" do form).
// Tratamento: extrai os dígitos, interpreta como centavos e formata.
/**
 * @param {unknown} raw Valor cru do input.
 * @returns {string} String mascarada em pt-BR, ou '' se não houver dígitos.
 */
export function formatarMoedaInput(raw) {
  const digitos = String(raw ?? '').replace(/\D/g, '');
  if (digitos === '') return '';

  // Remove zeros à esquerda mas mantém ao menos 1 dígito (para os centavos).
  const numero = Number(digitos); // total em centavos
  const reais = Math.floor(numero / 100);
  const centavos = String(numero % 100).padStart(2, '0');

  // Separador de milhar com ponto, decimal com vírgula.
  const reaisFmt = reais.toLocaleString('pt-BR');
  return `${reaisFmt},${centavos}`;
}

// Converte a string mascarada (ex.: "1.234,56") para Number (1234.56).
// Aceita também entradas "soltas" (ex.: "1234.56" ou "12,5") de forma robusta:
// remove os pontos de milhar e troca a vírgula decimal por ponto.
/**
 * @param {unknown} masked
 * @returns {number} Valor numérico, ou 0 se não for interpretável.
 */
export function moedaParaNumero(masked) {
  if (masked == null || masked === '') return 0;
  const str = String(masked).trim();

  // Caminho normal: string já mascarada (pt-BR) -> tira pontos, vírgula vira ponto.
  // Caminho de compatibilidade: se não houver vírgula mas houver ponto,
  // assume que o ponto é o separador decimal (ex.: valor antigo "12.5").
  let normalizado;
  if (str.includes(',')) {
    normalizado = str.replace(/\./g, '').replace(',', '.');
  } else {
    normalizado = str.replace(/[^\d.]/g, '');
  }

  const n = parseFloat(normalizado);
  return Number.isFinite(n) ? n : 0;
}
