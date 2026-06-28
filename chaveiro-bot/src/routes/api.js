import { Router } from 'express';
import authRouter from './auth.js';
import accountRouter from './account.js';
import servicosRouter from './servicos.js';
import tecnicosRouter from './tecnicos.js';
import estoqueRouter from './estoque.js';
import adminRouter from './admin.js';

const router = Router();
router.use('/', authRouter);
router.use('/', accountRouter);
router.use('/', servicosRouter);
router.use('/', tecnicosRouter);
router.use('/', estoqueRouter);
router.use('/', adminRouter);

export { router as apiRouter };
export default router;
