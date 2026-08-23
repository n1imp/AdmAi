/**
 * Idempotência de webhooks (F5.2) via Redis SET NX EX.
 *
 * `marcarSeNovo(chave, ttl)` marca a chave se ela ainda não existe. Retorna:
 *   - true  → chave NOVA (é a primeira vez; o chamador DEVE processar);
 *   - false → chave JÁ existia (entrega duplicada; o chamador DEVE pular).
 *
 * Fail-OPEN: se o Redis não responder, retorna true (processa) — para webhook, perder
 * um evento é pior que reprocessar uma duplicata rara (e os handlers são quase-idempotentes).
 * (É o oposto do lock de cron, que é fail-closed: lá, duplicar é pior que pular.)
 */
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redis = null;
function cliente() {
  if (!redis) {
    /* Timeouts EXPLÍCITOS, e por quê: sem eles, `maxRetriesPerRequest: null` podia deixar o
       SET/DEL esperando indefinidamente — e um fail-open que nunca resolve não é fail-open, é
       travamento. Com os limites, a promessa "Redis fora → processa mesmo assim" passa a ser
       verdadeira dentro de um teto conhecido. [FIX-IDEMP-PERDA, teste com endereço blackhole] */
    /* `enableOfflineQueue: false` foi TENTADO e REMOVIDO: com ele, comandos disparados antes
       de a conexão ficar pronta rejeitavam na hora → fail-open → a PRIMEIRA marca de cada
       processo nunca era gravada, e a dedup só passava a existir da segunda chamada em diante.
       A sabotagem do teste pegou isso (o caminho Stripe passava sem o fix). Com a fila offline
       LIGADA (default), o comando espera a conexão dentro dos tetos abaixo — bounded pelos
       timeouts + maxRetriesPerRequest, que é o que torna o fail-open declarável. */
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
    });
    redis.on('error', () => {
      /* evita crash quando o Redis está indisponível */
    });
  }
  return redis;
}

export async function marcarSeNovo(chave, ttlSegundos) {
  try {
    const r = await cliente().set(`idemp:${chave}`, '1', 'EX', ttlSegundos, 'NX');
    return r === 'OK'; // OK = marcou agora (novo) · null = já existia (duplicata)
  } catch (erro) {
    logger.warn('idempotencia: Redis indisponível — processando (fail-open)', {
      chave,
      erro: erro.message,
    });
    return true;
  }
}

/**
 * DESFAZ a marca de idempotência — o outro lado do contrato de `marcarSeNovo`.  [FIX-IDEMP-PERDA]
 *
 * O MODO DE PERDA QUE ISTO FECHA (achado 1 da revisão independente, thread 01a02cf7):
 *   a chave era marcada ANTES do processamento; se o handler falhasse depois, o reenvio do
 *   provider (Stripe reenvia por dias; a fila do WhatsApp tem retry próprio) caía em "duplicado"
 *   e o evento morria por 24h. Marcar-antes é correto para dedup — mas exige desmarcar na falha,
 *   senão a dedup vira descarte.
 *
 * BEST-EFFORT DELIBERADO: falha do DEL não pode transformar a falha original em outra coisa —
 * loga warning e segue. Modos residuais documentados no consenso: processo morre entre SET e
 * DEL; partição do Redis impede o DEL preservando a chave; duplicata concorrente responde 200
 * antes de a primeira falhar. Nenhum deles, sem evidência operacional, justifica tabela durável
 * agora — registrado como preparação da V2 com gatilho (incidente real ou necessidade de replay).
 */
export async function desmarcar(chave) {
  try {
    await cliente().del(`idemp:${chave}`);
    return true;
  } catch (erro) {
    logger.warn('idempotencia: falha ao desmarcar (o erro original do handler prevalece)', {
      chave,
      erro: erro.message,
    });
    return false;
  }
}
