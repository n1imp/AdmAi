#!/usr/bin/env node
/**
 * RESTAURAÇÃO do estado RLS v2 CANÔNICO no Supabase de STAGING — execução HUMANA.
 *
 * Contexto (incidente 2026-08-27, ver AGENT_DECISIONS): o beforeAll do rls.test.js rodou
 * contra o staging via validate:staging e reintroduziu o desenho v1 por cima do v2 aprovado:
 * FORCE ROW LEVEL SECURITY + policy `tenant_isolation` em 12 tabelas. O estado canônico v2 é
 * 26 tabelas ENABLE (NO FORCE) e ZERO policies (deny-by-default para não-owner via grants).
 * O agente foi impedido pelo classificador da plataforma de executar este DDL (3 negativas,
 * mesmo com autorização D2) — por isso este script existe para VOCÊ rodar:
 *
 *     node --env-file=.env.staging scripts/restore-rls-v2-noforce.mjs      (de chaveiro-bot/)
 *
 * O que ele faz, numa única transação (e nada além disso):
 *   1. ENABLE + NO FORCE ROW LEVEL SECURITY nas 26 tabelas do artefato v2 (bloco literal de
 *      prisma/rls/lockdown_public_access_v2.pure.sql, linhas 247–263);
 *   2. DROP POLICY IF EXISTS tenant_isolation nas 12 tabelas atingidas pelo incidente;
 *   3. roda prisma/rls/verify_lockdown_v2.pure.sql e imprime PASS/delta.
 *
 * Guards: recusa alvo sem o ref de staging; recusa qualquer URL contendo o ref de produção.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const BACKEND = dirname(dirname(fileURLToPath(import.meta.url)));
const REF_STAGING = 'qsuufuulxfkkeasgxhcv';
const REF_PRODUCAO = 'disljhkypaxpyzvbooge';

// As 26 tabelas — cópia literal do array `modelos` do artefato v2 (não reconstruir de memória).
const MODELOS = [
  'Empresa',
  'EmpresaWhatsapp',
  'Tecnico',
  'DocumentoTecnico',
  'Servico',
  'Material',
  'MovimentacaoEstoque',
  'ServicoMaterial',
  'Usuario',
  'ContaSocial',
  'Notificacao',
  'Pagamento',
  'SessaoConversa',
  'Avaliacao',
  'ConexaoBot',
  'RegistroPonto',
  'BatidaPonto',
  'GoogleConta',
  'AvaliacaoGoogle',
  'AnaliseAvaliacoes',
  'CodigoRecuperacaoTotp',
  'Assinatura',
  'ConviteUsuario',
  'SessaoUsuario',
  'RefreshToken',
  'AuditLog',
];
// As 12 onde o v1 do rls.test criou policy (observação de catálogo de 2026-08-27):
const COM_POLICY_DO_INCIDENTE = [
  'Avaliacao',
  'BatidaPonto',
  'DocumentoTecnico',
  'EmpresaWhatsapp',
  'Material',
  'MovimentacaoEstoque',
  'Notificacao',
  'Pagamento',
  'RegistroPonto',
  'Servico',
  'ServicoMaterial',
  'Tecnico',
];

const url = process.env.DIRECT_URL ?? '';
if (!url.includes(REF_STAGING)) {
  console.error(
    '❌ DIRECT_URL não referencia o staging ' +
      REF_STAGING +
      ' — abortado (rode com --env-file=.env.staging).'
  );
  process.exit(1);
}
if (url.includes(REF_PRODUCAO)) {
  console.error('❌ DIRECT_URL casa o ref de PRODUÇÃO — jamais. Abortado.');
  process.exit(1);
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query('BEGIN');
  for (const t of MODELOS) {
    await c.query(`ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY`);
    await c.query(`ALTER TABLE public."${t}" NO FORCE ROW LEVEL SECURITY`);
  }
  for (const t of COM_POLICY_DO_INCIDENTE) {
    await c.query(`DROP POLICY IF EXISTS tenant_isolation ON public."${t}"`);
  }
  await c.query('COMMIT');
  console.log(
    `✅ RESTORE: ENABLE+NO FORCE ×${MODELOS.length} + DROP POLICY ×${COM_POLICY_DO_INCIDENTE.length}`
  );
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error('❌ RESTORE falhou (rollback executado): ' + e.message);
  process.exit(1);
}

try {
  await c.query(readFileSync(join(BACKEND, 'prisma/rls/verify_lockdown_v2.pure.sql'), 'utf8'));
  console.log('✅ VERIFY_V2: PASS — estado canônico v2 restaurado.');
} catch (e) {
  console.error('❌ VERIFY_V2 ainda diverge: ' + e.message);
  process.exit(1);
} finally {
  await c.end();
}
