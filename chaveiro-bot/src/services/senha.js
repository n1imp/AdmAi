/**
 * Avaliação de força de senha — usada no cadastro e na troca de senha.
 * Mantém a regra de negócio em um só lugar (back e front usam a mesma lógica).
 */

const MIN_LEN = 8;

/**
 * @param {string} senha
 * @returns {{ score: number, nivel: 'fraca'|'media'|'forte', valida: boolean, requisitos: object }}
 */
export function avaliarForcaSenha(senha = '') {
  const requisitos = {
    tamanho: senha.length >= MIN_LEN,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[^A-Za-z0-9]/.test(senha),
  };

  const score = Object.values(requisitos).filter(Boolean).length;
  // Senha mínima aceitável: tamanho + 2 outros critérios
  const valida = requisitos.tamanho && score >= 3;
  const nivel = score <= 2 ? 'fraca' : score === 3 ? 'media' : 'forte';

  return { score, nivel, valida, requisitos };
}

export const SENHA_MIN_LEN = MIN_LEN;
