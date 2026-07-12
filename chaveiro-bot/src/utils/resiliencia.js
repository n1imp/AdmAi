/**
 * Utilitários de resiliência para chamadas a dependências externas (F5).
 *
 * `comTimeout` corre uma promise contra um prazo: se a operação não terminar a tempo,
 * rejeita com erro de timeout (evita que uma dependência externa travada segure o
 * request/worker indefinidamente). O timer é sempre limpo, mesmo em sucesso/erro.
 */
export function comTimeout(promise, ms, rotulo = 'operação externa') {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout de ${ms}ms em ${rotulo}`)), ms);
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}
