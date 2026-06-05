/**
 * Métricas Prometheus (guia §4.4).
 *
 * Expõe:
 *  - métricas default do processo (CPU, memória, event loop) via collectDefaultMetrics
 *  - histograma de duração das requisições HTTP rotulado por método/rota/status
 *
 * O endpoint /metrics é montado em server.js (fora de /api, sem auth) para o
 * scraping do Prometheus.
 */
import client from 'prom-client';

export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'chaveiro-bot' });
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

/**
 * Middleware que mede a duração de toda requisição.
 * Usa `req.route?.path` quando disponível (rota com placeholders, ex: /servicos/:id)
 * para evitar explosão de cardinalidade por id concreto.
 */
export function metricsMiddleware(req, res, next) {
  const fim = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ?? req.path?.split('/').slice(0, 3).join('/') ?? 'unknown';
    fim({ method: req.method, route, status_code: res.statusCode });
  });
  next();
}

/** Handler do endpoint /metrics. */
export async function metricsHandler(req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
