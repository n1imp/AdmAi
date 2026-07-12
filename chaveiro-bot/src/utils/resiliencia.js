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

/**
 * Circuit breaker por dependência externa. Após `limiar` falhas consecutivas o circuito
 * ABRE e passa a rejeitar rápido (fail-fast) por `resetMs` — sem martelar uma dependência
 * caída nem pagar o timeout a cada chamada. Passado o intervalo, entra em MEIO-ABERTO: uma
 * tentativa; sucesso FECHA, falha REABRE. Estado é em-memória por réplica (cada réplica se
 * protege sozinha — não precisa de estado compartilhado).
 *
 * Devolve `executar(fn)` que roda `fn()` sob a proteção do breaker. Compõe com `comTimeout`:
 *   const b = criarBreaker({ rotulo: 'resend' });
 *   await b(() => comTimeout(resend.send(...), 15000, 'resend'));
 *
 * @param {{ limiar?: number, resetMs?: number, rotulo?: string }} [opcoes]
 */
export function criarBreaker({ limiar = 5, resetMs = 30000, rotulo = 'dependência' } = {}) {
  let falhas = 0;
  let estado = 'fechado'; // fechado | aberto | meio-aberto
  let abertoAte = 0;
  return async function executar(fn) {
    if (estado === 'aberto') {
      if (Date.now() < abertoAte) throw new Error(`Circuito aberto para ${rotulo} (fail-fast)`);
      estado = 'meio-aberto'; // janela de teste: deixa UMA chamada passar
    }
    try {
      const resultado = await fn();
      falhas = 0;
      estado = 'fechado';
      return resultado;
    } catch (erro) {
      falhas += 1;
      // Reabre imediatamente se a tentativa de meio-aberto falhou, ou ao atingir o limiar.
      if (estado === 'meio-aberto' || falhas >= limiar) {
        estado = 'aberto';
        abertoAte = Date.now() + resetMs;
      }
      throw erro;
    }
  };
}
