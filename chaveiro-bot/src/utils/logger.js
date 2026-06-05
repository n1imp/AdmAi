import winston from 'winston';
import { env } from '../config/env.js';

// Logs estruturados em JSON para facilitar debug em produção
// Em desenvolvimento, usa formato colorido e legível
const formato = env.NODE_ENV === 'production'
  ? winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  : winston.format.combine(
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
