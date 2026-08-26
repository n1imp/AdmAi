/**
 * Enforcement comercial: assinatura morta barra o produto.  [GAP-BILL-01]
 *
 * O QUE ISTO CORRIGE
 *   O AdmAi criava trial de 14 dias, tinha checkout, portal e webhook Stripe sincronizando
 *   `Assinatura` — e nenhum lugar do backend LIA esse estado para autorizar. `past_due` e
 *   `canceled` eram escritos e nunca consultados. O `billing_access_audit.test.js` provou isso de
 *   forma dirigida: assinatura morta, cinco rotas de produto, nenhuma bloqueava. Veredito
 *   registrado: `BILLING_GATE_ABSENT_WITH_TESTED_SCOPE`.
 *
 *   O modelo comercial pretendido — trial e depois paywall — é decisão do usuário, e foi tomada.
 *   Este arquivo é a implementação dela.
 *
 * ALLOWLIST POR INCLUSÃO, NÃO POR EXCEÇÃO
 *   A guarda é aplicada aos routers de PRODUTO, um a um. Ela não é um filtro global com uma lista
 *   de caminhos isentos — porque isenção esquecida numa lista de exceções falha ABERTO, e rota
 *   nova nasceria desprotegida em silêncio. Aqui rota nova nasce protegida se o router for de
 *   produto, e livre se não for; nos dois casos por decisão explícita de quem monta o router.
 *
 * O QUE CONTINUA ACESSÍVEL COM ASSINATURA MORTA, e por quê cada um
 *   `/auth/*`      — sem login não há como chegar ao checkout.
 *   `/billing/*`   — barrar o pagamento de quem quer pagar é o único erro fatal deste desenho.
 *   `/me`, `/me/permissoes` — o painel precisa saber quem é o usuário para RENDERIZAR o paywall.
 *                    Bloquear isto deixaria a tela branca em vez de oferecer a assinatura.
 *   `/me/conta/*`  — exclusão de conta é direito do titular (LGPD). Não se prende alguém dentro do
 *                    produto por falta de pagamento.
 *   `/me/2fa/*`    — segurança da conta não depende do estado comercial.
 *
 * `402 Payment Required` é o código certo: não é falta de autenticação (401) nem falta de
 * permissão do papel (403) — é falta de assinatura, e o cliente resolve pagando.
 */

import { logger } from '../utils/logger.js';

/** Estados em que a empresa NÃO tem direito de uso. `incomplete` entra: checkout não concluído. */
export const ESTADOS_SEM_ACESSO = Object.freeze(['past_due', 'canceled', 'incomplete', 'unpaid']);

/**
 * A assinatura dá direito de uso AGORA?  PURA — recebe o registro e o instante, devolve o veredito.
 *
 * Ausência de `Assinatura` é tratada como SEM acesso, e isso é deliberado: toda empresa recebe uma
 * no cadastro (`auth.js`, `bootstrap.js`), então a ausência significa dado faltando, não cortesia.
 * Tratar ausência como liberação seria fail-open exatamente onde o dinheiro está.
 */
export function assinaturaDaAcesso(assinatura, agora = new Date()) {
  if (!assinatura) return { acesso: false, motivo: 'SEM_ASSINATURA' };

  if (ESTADOS_SEM_ACESSO.includes(assinatura.status)) {
    /* `canceled` com período pago ainda correndo continua valendo: o cliente pagou por ele. */
    if (
      assinatura.status === 'canceled' &&
      assinatura.periodoFimEm &&
      assinatura.periodoFimEm > agora
    ) {
      return { acesso: true, motivo: 'PERIODO_PAGO_EM_CURSO' };
    }
    return { acesso: false, motivo: assinatura.status.toUpperCase() };
  }

  if (assinatura.status === 'trialing') {
    if (!assinatura.trialFimEm) return { acesso: false, motivo: 'TRIAL_SEM_PRAZO' };
    return assinatura.trialFimEm > agora
      ? { acesso: true, motivo: 'TRIAL_EM_CURSO' }
      : { acesso: false, motivo: 'TRIAL_VENCIDO' };
  }

  if (assinatura.status === 'active') {
    /* `active` com período encerrado e sem renovação é assinatura morta que ninguém atualizou. */
    if (assinatura.periodoFimEm && assinatura.periodoFimEm <= agora) {
      return { acesso: false, motivo: 'PERIODO_ENCERRADO' };
    }
    return { acesso: true, motivo: 'ATIVA' };
  }

  /* Status desconhecido não libera. Um valor novo vindo do provider precisa ser classificado
     explicitamente aqui antes de valer como direito de uso. */
  return { acesso: false, motivo: `STATUS_NAO_CLASSIFICADO_${assinatura.status}` };
}

/**
 * Guarda para as rotas de produto. Depende de `req.user.empresaId` e de `req.db`, ambos postos por
 * `requireAuth`.
 *
 * ONDE ELA MORA, e por que a posicao e o desenho
 *   Os routers do AdmAi sao todos montados em `/`, entao a requisicao ATRAVESSA cada um ate achar
 *   quem a atende. Isso significa que um `router.use()` dentro de um router de produto vazaria para
 *   todos os montados depois dele — inclusive `billing`.
 *
 *   A guarda fica em `api.js`, numa posicao unica: DEPOIS de `auth`, `account` e `billing` (que
 *   atendem e retornam antes de chegar aqui) e ANTES de tudo o que e produto. O efeito e
 *   FAIL-CLOSED: router novo montado depois nasce protegido, e isentar algo exige move-lo para
 *   cima, o que e uma linha visivel num arquivo so — nao uma entrada esquecida numa lista de
 *   excecoes.
 */
export function requireAssinaturaAtiva(req, res, next) {
  const empresaId = req.user?.empresaId;
  if (!empresaId) {
    /* Sem contexto de empresa não dá para decidir, e não decidir não pode virar liberação. */
    return res.status(402).json({ erro: 'Assinatura não verificável', motivo: 'SEM_EMPRESA' });
  }

  req.db.assinatura
    .findUnique({ where: { empresaId } })
    .then((assinatura) => {
      const veredito = assinaturaDaAcesso(assinatura);
      if (veredito.acesso) return next();

      logger.info('acesso_barrado_por_assinatura', { empresaId, motivo: veredito.motivo });
      return res.status(402).json({
        erro: 'Assinatura necessária',
        motivo: veredito.motivo,
        acao: 'Renove a assinatura para voltar a usar o AdmAi.',
      });
    })
    .catch((erro) => {
      logger.error('Erro ao verificar assinatura', { erro: erro.message, empresaId });
      /* Falha ao consultar não libera: indisponibilidade do banco não é direito de uso. */
      return res
        .status(402)
        .json({ erro: 'Assinatura não verificável', motivo: 'ERRO_NA_CONSULTA' });
    });
}
