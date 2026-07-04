import winston from 'winston';
import { env } from '../config/env.js';

// Chaves cujo VALOR nunca deve aparecer em log (defesa contra vazamento de PII/segredos
// se alguém logar um objeto inteiro por engano). Comparação por nome, case-insensitive.
const CHAVES_SENSIVEIS = new Set([
  'senha', 'senhahash', 'password', 'novasenha', 'senhaatual',
  'totpsecret', 'totppendente', 'secret', 'jwtsecret', 'encryptionkey',
  'token', 'accesstoken', 'refreshtoken', 'accesstokenenc', 'refreshtokenenc',
  'otp', 'telefoneotphash', 'authorization', 'apikey', 'apitoken', 'webhooksecret',
]);
const MARCADOR = '[REDACTED]';

// Redige recursivamente (in-place) os valores de chaves sensíveis. Tolerante a ciclos
// e a profundidade. Exportado para teste. Não muta strings/primitivos no topo.
export function redigirSensiveis(valor, vistos = new WeakSet(), prof = 0) {
  if (!valor || typeof valor !== 'object' || prof > 6) return valor;
  if (vistos.has(valor)) return valor;
  vistos.add(valor);
  for (const chave of Object.keys(valor)) {
    if (CHAVES_SENSIVEIS.has(chave.toLowerCase())) {
      if (valor[chave] !== undefined && valor[chave] !== null) valor[chave] = MARCADOR;
    } else {
      redigirSensiveis(valor[chave], vistos, prof + 1);
    }
  }
  return valor;
}

// Format do Winston que redige o registro antes de serializar (vale p/ json e printf).
const redator = winston.format((info) => redigirSensiveis(info));

// Logs estruturados em JSON para facilitar debug em produção
// Em desenvolvimento, usa formato colorido e legível
const formato = env.NODE_ENV === 'production'
  ? winston.format.combine(
      redator(),
      winston.format.timestamp(),
      winston.format.json()
    )
  : winston.format.combine(
      redator(),
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const extra = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${message} ${extra}`;
      })
    );

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: formato,
  transports: [
    new winston.transports.Console(),
    // Em produção, considere adicionar transporte para arquivo ou serviço externo
  ],
});
