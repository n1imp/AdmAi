#!/usr/bin/env node
/**
 * react-doctor-router.mjs — seleção automática da capability React Doctor por write-set.
 *
 * LÓGICA GLOBAL (sem hardcode de projeto): o que é "frontend React" e o que é "superfície de
 * design" vem do PERFIL local (ex.: docs/eos-v2/REACT_DOCTOR_PROFILE_ADMAI.json). Regras:
 *
 *   - write-set com arquivo React (extensão de componente sob uma raiz frontend) → SELECIONADA
 *   - write-set só de backend / Prisma / SQL / docs / infra → NÃO selecionada
 *   - write-set React que toca superfície de UI (páginas/componentes/estilos) → também DESIGN
 *
 * A seleção NÃO dá ao React Doctor autoridade de release: PASS != FEATURE_COMPLETE e
 * FAIL != falha de produto — a semântica fica no capability doc (EOS_REACT_DOCTOR_CAPABILITY.md).
 *
 * USO
 *   node tools/admai-delivery/react-doctor-router.mjs --selftest
 *   node tools/admai-delivery/react-doctor-router.mjs <perfil.json> arquivo1 [arquivo2 ...]
 */
import fs from 'node:fs';

const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * @param {string[]} caminhos arquivos do write-set (relativos à raiz do repo)
 * @param {{raizesFrontend: string[], extensoesReact: string[], sinaisDesign: string[]}} perfil
 * @returns {{selecionada: boolean, design: boolean, motivos: string[]}}
 */
export function rotearReactDoctor(caminhos, perfil) {
  const raizes = (perfil.raizesFrontend || []).map(norm);
  const exts = perfil.extensoesReact || ['.jsx', '.tsx'];
  const sinais = (perfil.sinaisDesign || []).map(norm);
  const motivos = [];
  let selecionada = false;
  let design = false;
  for (const bruto of caminhos || []) {
    const c = norm(bruto);
    const sobRaiz = raizes.some((r) => c.startsWith(r));
    if (!sobRaiz) continue;
    const ehReact = exts.some((e) => c.endsWith(e));
    // .js sob raiz frontend também conta como código do app (hooks/lib), mas não como React puro;
    // só extensões de componente selecionam a capability — hooks .js entram por arrasto quando
    // um componente também está no write-set? Não: hooks .js SÃO código React de runtime.
    const ehCodigoApp = ehReact || c.endsWith('.js');
    if (!ehCodigoApp) continue;
    if (c.includes('/e2e/') || c.includes('/__tests__/') || /\.(test|spec|axe)\.[jt]sx?$/.test(c)) {
      continue; // teste/e2e não dispara o verificador sozinho
    }
    selecionada = true;
    motivos.push(`react:${c}`);
    if (sinais.some((s) => c.includes(s))) {
      design = true;
      motivos.push(`design:${c}`);
    }
  }
  return { selecionada, design, motivos };
}

function selftest() {
  const perfil = {
    raizesFrontend: ['chaveiro-painel/src/'],
    extensoesReact: ['.jsx', '.tsx'],
    sinaisDesign: ['/pages/', '/components/'],
  };
  let pass = 0;
  let fail = 0;
  const ok = (nome, cond) => {
    if (cond) pass++;
    else {
      fail++;
      console.error(`FALHOU: ${nome}`);
    }
  };

  // Caso 1 (diretiva): write-set React → capability selecionada.
  const r1 = rotearReactDoctor(['chaveiro-painel/src/hooks/useWidgetPrefs.js'], perfil);
  ok('react write-set seleciona', r1.selecionada === true);

  // Caso 2: backend-only → NÃO selecionada.
  const r2 = rotearReactDoctor(
    ['chaveiro-bot/src/routes/admin.js', 'chaveiro-bot/prisma/schema.prisma'],
    perfil
  );
  ok('backend-only nao seleciona', r2.selecionada === false && r2.design === false);

  // Caso 3: docs-only → NÃO selecionada.
  const r3 = rotearReactDoctor(
    ['docs/eos-v2/current/02_CURRENT_STATE.md', 'docs/agent-environment/ADMAI_SCOPE_FREEZE.md'],
    perfil
  );
  ok('docs-only nao seleciona', r3.selecionada === false);

  // Caso 4: UI/design React (página/componente) → selecionada + design.
  const r4 = rotearReactDoctor(['chaveiro-painel/src/pages/Auditoria.jsx'], perfil);
  ok('pagina React seleciona com design', r4.selecionada === true && r4.design === true);

  // Bordas: teste não dispara sozinho; misto backend+react seleciona; hook .js sem sinal de design.
  const r5 = rotearReactDoctor(['chaveiro-painel/src/components/ui/__tests__/Overlay.test.jsx'], perfil);
  ok('teste sozinho nao dispara', r5.selecionada === false);
  const r6 = rotearReactDoctor(
    ['chaveiro-bot/src/routes/auth.js', 'chaveiro-painel/src/components/WelcomeCard.jsx'],
    perfil
  );
  ok('misto seleciona (+design por components/)', r6.selecionada === true && r6.design === true);
  const r7 = rotearReactDoctor(['chaveiro-painel/src/hooks/useWidgetPrefs.js'], perfil);
  ok('hook .js seleciona sem design', r7.selecionada === true && r7.design === false);
  const r8 = rotearReactDoctor(['chaveiro-painel/e2e/cdp.mjs', 'chaveiro-painel/vite.config.js'], perfil);
  ok('e2e/config fora de src nao seleciona', r8.selecionada === false);

  console.log(`selftest: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

const ehExecucaoDireta =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (ehExecucaoDireta) {
  const args = process.argv.slice(2);
  if (args[0] === '--selftest') selftest();
  else {
    const perfil = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    const r = rotearReactDoctor(args.slice(1), perfil.roteamento || perfil);
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }
}
