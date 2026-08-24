-- =============================================================================
-- STG-MIG-RECON — Reparo dos checksums historicos (CRLF -> LF canonico) · STAGING
-- =============================================================================
-- Diagnostico (deterministico, 22/22): as 22 linhas divergentes da _prisma_migrations
-- do admai-staging foram gravadas pelo migrate deploy de julho a partir de um checkout
-- Windows (core.autocrlf=true) — checksum = sha256 dos bytes CRLF. Os blobs git sao LF
-- puros; sha256(blob LF->CRLF) reproduz EXATAMENTE o valor do staging em todas as 22.
-- Classe: LINE_ENDING_DRIFT (conteudo SQL identico). Classe B excluida: nenhum commit
-- tocou as 23 aplicadas apos 2026-07-10 (data do apply).
--
-- Decisao D1 (Codex DECISOR thread 01a034d7, DELTA CONCORDO): reparar as 22 para o
-- SHA-256 LF canonico ANTES de aplicar as 5 pendentes. O matcher do Prisma 7.9.1
-- normaliza o script local para LF na comparacao => checksum LF armazenado funciona
-- de checkout LF E CRLF; o CRLF armazenado nao. Correcao excepcional de line-ending
-- drift: altera SOMENTE a coluna checksum (id/nomes/timestamps/logs/estado intactos).
--
-- ⚠️ SOMENTE STAGING (qsuufuulxfkkeasgxhcv). Producao PROIBIDA.
-- Pre-requisito operacional: snapshot completo das 23 linhas ANTES de rodar.
-- Fail-closed: advisory lock do Prisma + asserts; qualquer contagem inesperada => ABORT.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  n int;
  atualizadas int := 0;
  par record;
BEGIN
  -- Lock do Prisma: nao concorrer com um migrate deploy.
  IF NOT pg_try_advisory_xact_lock(72707369) THEN
    RAISE EXCEPTION 'REPARO: advisory lock 72707369 ocupado (migrate concorrente?) — abortado';
  END IF;

  -- Preflight: exatamente 23 concluidas, sem falhas/rollback, sem duplicatas.
  SELECT count(*) INTO n FROM public._prisma_migrations;
  IF n <> 23 THEN RAISE EXCEPTION 'REPARO: esperava 23 linhas, achei %', n; END IF;
  SELECT count(*) INTO n FROM public._prisma_migrations
    WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'REPARO: % linha(s) falha/rolled-back — abortado', n; END IF;
  SELECT count(*) INTO n FROM (
    SELECT migration_name FROM public._prisma_migrations GROUP BY migration_name HAVING count(*) > 1
  ) d;
  IF n <> 0 THEN RAISE EXCEPTION 'REPARO: nomes duplicados — abortado'; END IF;

  -- Pares (nome, checksum CRLF atual, checksum LF canonico) — gerados dos blobs git @ 84c65f3.
  FOR par IN SELECT * FROM (VALUES
     ('20260524204642_', '24fa50c5d99c263a753a9a5809b472d0811e3e5fa6a16d899bd1dfb7bf9c3f21', '15abf4f3b67a9f3e3bab82faab7f662d8a2a04602097ce37d29b4acb0d6e45a0')
    ,('20260531124110_evolucao_v2', '59150479c0be99157c32f45521850af6138edeff9f58dfd15f99a83586ea79ea', '89cb9b83292103a83ca693472f5deb73f6747755f01ff75fb6e389c664899fdc')
    ,('20260531144326_add_telefone_display', '75197625c574b7222031bdab540377a662a3c2714a208b115b6ec703d786b126', '6b520a481b0304b7166e638659d64b288cd26489aa16d9d03e5df3b34a80e5cd')
    ,('20260604021146_new', 'c0f928d556ba65824d7b654b93bfd244f5e5545f513b557f4d2c052e262eaa43', 'f0a09aa9bba0ad1932998ba9a147c8f0d7aee47f443332047a3d25c01ef0f407')
    ,('20260604132207_estoque_saldo_real', '7560f15507927d06e18f6f17f5c6c03880bf94b34229bec0ab21c253c05806dc', '33ea194e4ef90b554f32ca12e3107b656083a9714ae05665299e8a5c75831cc2')
    ,('20260604141232_conta_usuario', '4203cccbf0c09ffac08eb17443b4f2c5fea1de4fc186c5e747b827f622271a5a', '1b1458e01cc47a8fef8a730be4c087342e76196aaf03d3df98b8356a9fd43f34')
    ,('20260604142936_notificacoes_inbox', 'd45a1faa73cbc0e11f52bf56c157925dbdf054c8ef1c47d663deaabeff809ed6', '45016c427ae278ea8d6df7038d606b7cc9565ccdc2ce90c18cef02e2f872a6ab')
    ,('20260605000000_multitenant_empresa', 'b46864eda5a53d038096ea4c9dfd3f6cfcb1e1ab261e01416c0c2b4e6063b7a1', 'c4c2f122fcb03bfcaddc40560dd96e6885610733cc64f4117563e34085c1dbd4')
    ,('20260606000000_conversa_cliente', 'cd4d6e8241d2bd4a25f9e1284ca73ae1b5cd2558e11ce4f28742d6af624c3c3c', 'c75757b88823f537060f9c99f2e9ac5a70dc4dfa212e3c51d6b22afcfef3c688')
    ,('20260607000000_avaliacao', '0d1ae570b8071545e45367901f5863762188ba253dc4befad5de6f5ee08c1e1c', 'b5bde159209a21fd13c3a53d12afbd9c45bc108153ea8f6d702b88123e86e1fa')
    ,('20260611000000_whatsapp_qr', '8acae0ae910d5ff87777bf4d2fb6f21b1b9405506f1adf43649699b9f2e9b5b1', '3bf7b56001c2a67d229f03bb82ca7e58e191662161c4efc8b63e06d526704f53')
    ,('20260611000100_totp_2fa', 'ac18dc039fc085ea6adaa60adbddb608b760033f0a66ea0996906dd982235c71', '69b409dbb1daeffc56dac9b7eaf6fd76371314e3385a091d0086513ef50eb924')
    ,('20260612000000_login_social', '109d328dc3b9dbad135db29dc48f7b34a45c322e8d8d1d9d6f3d6a9b87158348', '9c943a9561090961d4f5a0f79915ea467305ea3d9348389abd51e8b90a9a4edc')
    ,('20260613000000_whatsapp_cloud', 'e3c2ea84824ac3c5e9494db28397f170ebe75989f4133261fa8eaba9c7fa6117', 'a26a45e7a4c9a27e43b17b138ea021d47f9fc8314c3ad0a91f0c7a4948063222')
    ,('20260613100000_numero_unico_fase1', 'f1806b549899a5e47204414b0db8537cc18d359cbeb112cfb9ed45798741bc37', '295e140453ecf94e56a99c249adbb84a920bebb70b644b3ea37d733289e77c2c')
    ,('20260614000000_numero_unico_fase3', '3f9459eacff365cc4837dddbc72ad803a25e751b60e334d37fa10c27f482e0d2', '69900eae9aefbc14aeb4bccf00da5004db1718dcbafc68d82fabce4476610fbc')
    ,('20260615000000_rh_ponto_google_reviews', '48aed84f18415459f64bd7e0a9bb0bdd726c28662d37f2c41094e03a0a6630eb', 'd9ade4b9f8ab45e3e69c30f2cde7d43ab406b8c945f24f2395e29bcdca6c645d')
    ,('20260616000000_remove_whatsapp_legado', 'f6adf4338b2e2702b8841020b70deb2a840fdf78d5aaf3e69fea5bf9b8c344f2', 'e30b8a44538bf0499d9f26418bc5c379e226390659397c0db60f700096ea0d3f')
    ,('20260620000000_rbac_ponto_painel', '762341f1c63fc5adf1fea3a547d6c10c0242ab70fd93d720b1dadf76f62609ad', '2220ebf10a07e4f624387ad3585441d4247b597a2216c67ff7cad1f28a21297c')
    ,('20260621000000_fix_tecnico_telefone_unique', '5f6a1c3a5e28e661f957f98af9d43057f2a50059b2ebc8e9a4d707be3c1632a5', '2a87ca4311e76da3c85787856d90228bd4419833ae7d5cc676690b7d2ef3fde3')
    ,('20260707000000_add_codigo_recuperacao_totp', '489b15a279e484ac60c313ad98562c40a972802bad1a9edacb07cca9e524b504', '9a84f395df3d546c3d635317ef48b6af239370ff5b2dfdda8a1d0f82fae36bc8')
    ,('20260707000001_drop_material_nome_unique_global', '1830524ca242203b3c234169f059ba6b7198ce92295acb4f5d656472d1a8852e', '03702f814c5dbfb6b6c9dbccc1a657c7f1d49fe75b9ff0e3012a01eccd5af558')
  ) AS t(nome, crlf_atual, lf_novo)
  LOOP
    -- Confere que a linha esta EXATAMENTE como diagnosticado antes de tocar.
    UPDATE public._prisma_migrations
       SET checksum = par.lf_novo
     WHERE migration_name = par.nome
       AND checksum = par.crlf_atual
       AND finished_at IS NOT NULL
       AND rolled_back_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'REPARO: % atualizou % linhas (esperava 1) — estado diverge do diagnostico, abortado', par.nome, n;
    END IF;
    atualizadas := atualizadas + n;
  END LOOP;

  IF atualizadas <> 22 THEN
    RAISE EXCEPTION 'REPARO: total atualizado % != 22 — abortado', atualizadas;
  END IF;

  -- Pos-condicao: 23/23 agora com o checksum LF canonico (o controle ja era LF).
  SELECT count(*) INTO n FROM public._prisma_migrations m
   WHERE m.checksum !~ '^[0-9a-f]{64}$';
  IF n <> 0 THEN RAISE EXCEPTION 'REPARO: checksum fora do formato hex — abortado'; END IF;

  RAISE NOTICE 'REPARO OK — 22 checksums normalizados para LF; controle intacto.';
END $$;

COMMIT;
\echo '>> Reparo de checksums aplicado. Verifique 23/23 == LF canonico e siga para as 5 pendentes (A-prime).'
