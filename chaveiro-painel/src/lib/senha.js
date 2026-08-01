// @ts-check
// Avaliação de força de senha no cliente — espelha src/services/senha.js do backend.
// Mantém a UI consistente com a validação do servidor.

/**
 * @param {string} [senha]
 * @returns {{score:number, nivel:'fraca'|'media'|'forte', valida:boolean,
 *            requisitos:{tamanho:boolean, maiuscula:boolean, minuscula:boolean,
 *                        numero:boolean, especial:boolean}}}
 */
export function avaliarForcaSenha(senha = '') {
  const requisitos = {
    tamanho: senha.length >= 8,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    numero: /[0-9]/.test(senha),
    especial: /[^A-Za-z0-9]/.test(senha),
  };
  const score = Object.values(requisitos).filter(Boolean).length;
  const valida = requisitos.tamanho && score >= 3;
  const nivel = score <= 2 ? 'fraca' : score === 3 ? 'media' : 'forte';
  return { score, nivel, valida, requisitos };
}
