import { Router } from 'express';
import authRouter from './auth.js';
import accountRouter from './account.js';
import servicosRouter from './servicos.js';
import tecnicosRouter from './tecnicos.js';
import estoqueRouter from './estoque.js';
import documentosRouter from './documentos.js';
import metricasRouter from './metricas.js';
import adminRouter from './admin.js';
import { billingRouter } from './billing.js';
import { requireAssinaturaAtiva } from '../middlewares/assinatura.js';

const router = Router();

/* ── Livre de assinatura, por desenho ──────────────────────────────────────
   `auth`    — sem login nao se chega ao checkout.
   `account` — traz o `requireAuth` que autentica TUDO daqui para baixo (os routers sao montados em
               `/`, entao a requisicao atravessa este antes de chegar aos outros). Serve `/me`, que
               o painel precisa para renderizar o paywall, e a exclusao de conta, que e direito do
               titular e nao se prende por falta de pagamento.
   `billing` — barrar o pagamento de quem quer pagar seria o unico erro fatal deste desenho. */
router.use('/', authRouter);
router.use('/', accountRouter);
router.use('/', billingRouter);

/* ── Daqui para baixo e PRODUTO, e produto exige assinatura viva ───────────
   [GAP-BILL-01] A posicao e o mecanismo: quem chega aqui nao foi atendido acima, logo e rota de
   produto. Router novo montado abaixo nasce PROTEGIDO; isentar algo exige subi-lo, o que e uma
   linha visivel neste arquivo. Fail-closed por construcao, em vez de uma lista de excecoes onde
   uma entrada esquecida libera. */
router.use(requireAssinaturaAtiva);

router.use('/', servicosRouter);
router.use('/', tecnicosRouter);
router.use('/', estoqueRouter);
router.use('/', documentosRouter);
router.use('/', metricasRouter);
router.use('/', adminRouter);

export { router as apiRouter };
export default router;
