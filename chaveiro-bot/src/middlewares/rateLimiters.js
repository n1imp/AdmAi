/**
 * Rate limiters compartilhados, todos com store Redis (não MemoryStore).
 *
 * F4: `authLimiter` era definido DUAS VEZES — uma em app.js (Redis) e outra, separada,
 * em routes/auth.js (import dinâmico, sem RedisStore → cai no MemoryStore padrão). Sob
 * múltiplas réplicas do processo, o limite de 5/15min em recuperar-senha/redefinir-senha/
 * magic-link resetava por instância. Este módulo é a única fonte de verdade: um único
 * Redis compartilhado, um único `authLimiter` aplicado a TODAS as rotas de auth
 * (login, register, recuperar-senha, redefinir-senha, magic-link).
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { canonizarTelefone, variantesTelefone } from '../services/parser.js';

export const redisClient = new Redis(env.REDIS_URL);
// ioredis emite 'error' em falha de conexão; sem handler, o processo crasha.
redisClient.on('error', (err) => logger.warn('Redis connection error', { error: err.message }));

function novoStoreRedis() {
  return new RedisStore({ sendCommand: (...args) => redisClient.call(...args) });
}

/** Cria um rate limiter com o store Redis compartilhado (nunca MemoryStore). */
export function criarLimiterRedis(opcoes) {
  return rateLimit({ ...opcoes, store: novoStoreRedis() });
}

/**
 * Quais campos do corpo são a identidade REAL de cada rota que usa `authLimiter`
 * — ou seja, o(s) campo(s) que o handler de fato usa pra resolver a conta, e
 * portanto os únicos que fazem sentido como chave do rate limit.
 *
 * Por que isso existe (achado da revisão de aprovação do Gate 2, thread Codex
 * `019fbfe8`): uma ORDEM DE PRECEDÊNCIA ÚNICA e global não é suficiente aqui,
 * porque `authLimiter` é compartilhado por 5 rotas com schemas Zod DIFERENTES
 * (login: usuarioId/username/telefone; register: username/telefone/email;
 * recuperar-senha e magic-link: só email; redefinir-senha: só token — nenhum
 * destes 4 campos). Qualquer ordem fixa deixa pelo menos uma rota vulnerável:
 * se `usuarioId` vencer sempre, um atacante manda o e-mail FIXO da vítima em
 * `/auth/recuperar-senha` com um `usuarioId` FALSO e diferente a cada
 * tentativa — o Zod do handler ignora silenciosamente o campo que não declara
 * (`z.object({ email })` sem `.strict()`), então o handler processa normalmente
 * pelo e-mail, mas a chave do limiter muda a cada request e o teto de 5/15min
 * nunca é atingido. O rate limiter roda ANTES da validação Zod da rota, então
 * `req.body` aqui ainda carrega qualquer campo extra que o cliente mandar.
 *
 * A correção: restringir, por rota (via `req.originalUrl` — estável mesmo com
 * roteadores aninhados, ao contrário de `req.path`/`req.url`), quais campos
 * podem sequer ser considerados. Rota desconhecida (não mapeada aqui) NUNCA
 * usa nenhum campo do corpo — cai direto pra chave por IP, o modo mais seguro,
 * em vez de aceitar qualquer campo por padrão.
 */
const CAMPOS_POR_ROTA = [
  { rota: '/api/auth/login', campos: ['usuarioId', 'username', 'telefone'] },
  { rota: '/api/auth/register', campos: ['username', 'telefone', 'email'] },
  { rota: '/api/auth/recuperar-senha', campos: ['email'] },
  { rota: '/api/auth/magic-link', campos: ['email'] },
  // /api/auth/redefinir-senha: identidade real é o `token`, não extraído aqui —
  // fica de fora do mapa de propósito, então cai sempre na chave por IP.
];

// Express roteia sem diferenciar maiúsculas/minúsculas e trata "/rota", "/rota/" e
// "/rota//" (barra dupla) como a MESMA rota (roteamento não-estrito, o padrão) —
// qualquer chave de rate limit derivada de `req.originalUrl`/`req.path` sem
// normalizar isso vira múltiplos baldes independentes pra mesma rota real (ex.:
// "/API/AUTH/LOGIN", "/api/auth/login/", "/api//auth/login"), multiplicando o teto
// de tentativas na prática. `req.originalUrl` também preserva um fragmento (`#...`)
// cru se o cliente HTTP não descartar (curl/fetch/navegador descartam; clientes de
// baixo nível como `http.request` não) — cada fragmento distinto vira um balde novo,
// SEM LIMITE, mesmo sem repetir grafia nenhuma (achados da revisão de aprovação do
// Gate 2, thread Codex `019fbfe8`, e da revisão adversarial do EV-067, 2 rodadas).
function normalizarCaminho(req) {
  let caminho = String(req.originalUrl ?? req.path ?? '')
    .split('#')[0]
    .split('?')[0]
    .replace(/\/+/g, '/')
    .toLowerCase();
  if (caminho.length > 1 && caminho.endsWith('/')) caminho = caminho.slice(0, -1);
  return caminho;
}

function camposPermitidosPara(req) {
  const caminho = normalizarCaminho(req);
  const match = CAMPOS_POR_ROTA.find(({ rota }) => caminho.endsWith(rota));
  return match ? match.campos : [];
}

/**
 * Identidade do corpo da requisição, normalizada e com prefixo por tipo —
 * olhando SÓ os campos que `camposPermitidosPara` libera pra rota atual
 * (ver comentário acima). Dentro dos campos liberados, a ordem ainda importa
 * quando mais de um pode aparecer junto (ex.: login manda usuarioId+username):
 * usuarioId > username > telefone > email, espelhando a prioridade real de
 * `routes/auth.js` `/auth/login` (usuarioId vence a busca da conta).
 *
 * O telefone é colapsado para uma variante canônica: o login casa com e sem o
 * 9º dígito (`variantesTelefone`), então sem isso o atacante alternaria as duas
 * formas do mesmo número e dobraria o limite.
 *
 * O prefixo por tipo evita colisão entre um `username` "123" e o `usuarioId` 123.
 */
export function identidadeDaRequisicao(req) {
  const corpo = req.body ?? {};
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null);
  const permitidos = camposPermitidosPara(req);
  const permite = (campo) => permitidos.includes(campo);

  if (permite('usuarioId') && corpo.usuarioId != null && corpo.usuarioId !== '') {
    return `i:${corpo.usuarioId}`;
  }

  if (permite('username')) {
    const username = texto(corpo.username);
    if (username) return `u:${username}`;
  }

  if (permite('telefone')) {
    const telefone = texto(corpo.telefone);
    if (telefone) {
      const variantes = variantesTelefone(telefone);
      const canonico = variantes.length ? [...variantes].sort()[0] : canonizarTelefone(telefone);
      return `t:${canonico || telefone.replace(/\D/g, '')}`;
    }
  }

  if (permite('email')) {
    const email = texto(corpo.email);
    if (email) return `e:${email}`;
  }

  return null;
}

// Rate limit AGRESSIVO contra brute force em login/register/recuperação de senha/magic-link
// (guia §3.2). Chave pela IDENTIDADE do corpo; IP só quando não há identidade.
export const authLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => identidadeDaRequisicao(req) ?? ipKeyGenerator(req, res),
  message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

/**
 * Segundo limitador, sempre por IP. O limitador por identidade sozinho é
 * evadível: basta variar o identificador a cada tentativa para nunca repetir a
 * chave. Este teto trava a varredura de muitas contas a partir de uma origem.
 *
 * Folgado de propósito (30/15min) porque uma empresa inteira pode compartilhar
 * uma saída NAT — o objetivo é cortar varredura, não bloquear escritório. Só
 * conta tentativa MALSUCEDIDA.
 */
export const authIpLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req, res) => `authip:${ipKeyGenerator(req, res)}`,
  message: { erro: 'Muitas tentativas a partir desta origem. Tente novamente em 15 minutos.' },
});

// EV-057: `authLimiter`/`authIpLimiter` usam `skipSuccessfulRequests: true` —
// cadastros BEM-SUCEDIDOS nunca contavam pro teto, permitindo abuso de trial
// via criação ilimitada de empresas/contas em `/api/auth/register`. Além
// disso, `/api/auth/oauth/:provedor` (cadastro/login via provedor externo)
// não tinha nenhum limiter de auth dedicado. Este limiter conta TODA
// tentativa, sucesso incluso, sempre por IP.
export const cadastroLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => `cadastro:${ipKeyGenerator(req, res)}`,
  message: { erro: 'Muitos cadastros a partir desta origem. Tente novamente em 15 minutos.' },
});

// F3 (achado da revisão independente): o código de confirmação de exclusão de conta não
// tinha nenhum limite dedicado, caindo só no limiter genérico de /api (120/min por IP) —
// insuficiente contra brute force de um espaço de 6 dígitos. Chave por usuário autenticado
// (req.user.id), não por IP, no mesmo espírito do twoFactorLimiter (chave no desafio).
export const exclusaoContaLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => (req.user?.id ? `exclusao:${req.user.id}` : ipKeyGenerator(req, res)),
  message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// EV-067: POST /me/2fa/ativar e POST /me/2fa/desativar verificavam só um código TOTP
// de 6 dígitos, sem nenhum limite dedicado — caíam só no limiter genérico de /api
// (120/min por IP, compartilhado com toda a API). Mesma classe de ameaça do F3
// (exclusaoContaLimiter): espaço de 6 dígitos insuficientemente protegido por um
// limiter genérico e por IP. Chave por usuário autenticado (req.user.id), não por IP —
// um atacante com sessão roubada não pode contornar isolando o teto por IP diferente,
// e usuários legítimos por trás do mesmo IP (rede corporativa/NAT) não interferem entre si.
// A chave inclui a rota (normalizada por `normalizarCaminho` — ver comentário acima
// dela; usar `req.originalUrl` cru aqui reabriria a MESMA classe de bug que ele existe
// pra evitar, permitindo multiplicar o teto por variação de caixa/barra final,
// achado da revisão adversarial desta correção): ativar e desativar são ações
// INDEPENDENTES (ao contrário de exclusaoContaLimiter, onde as 2 rotas são passos
// sequenciais do MESMO fluxo) — sem separar por rota, ativar o 2FA com sucesso já
// gastaria 1 das 5 tentativas do teto de desativar, e vice-versa.
export const totpContaLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) =>
    req.user?.id ? `totp-conta:${req.user.id}:${normalizarCaminho(req)}` : ipKeyGenerator(req, res),
  message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

export { ipKeyGenerator, normalizarCaminho };
