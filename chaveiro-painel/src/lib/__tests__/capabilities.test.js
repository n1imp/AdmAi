/**
 * Fitness tests do capability registry (Refoundation §105) — provam a ARQUITETURA de exposição
 * sem implementar nenhuma feature futura:
 *   1. capability não-CURRENT com flag OFF → nenhuma rota exposta;
 *   2. capability sintética habilitada em teste → registry aceita e compõe;
 *   3. COERÊNCIA COM O ROUTER REAL: toda rota de capability não-CURRENT está atrás de
 *      featureAtiva no App.jsx (o registry nunca vira documento morto) e toda rota declarada
 *      como CURRENT existe no router.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CAPABILITIES, capabilityAtiva, rotasExpostas } from '../capabilities.js';
import { FLAGS } from '../featureFlags.js';

const appJsx = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../App.jsx'),
  'utf8'
);

describe('registry — regra única de exposição (§26)', () => {
  it('default: nenhuma capability não-CURRENT expõe rota (flags OFF)', () => {
    const expostas = rotasExpostas();
    for (const c of CAPABILITIES.filter((x) => x.lifecycleState !== 'CURRENT')) {
      expect(capabilityAtiva(c.id), c.id).toBe(false);
      for (const rota of c.routes) expect(expostas, `${c.id}:${rota}`).not.toContain(rota);
    }
  });

  it('todas as CURRENT estão expostas', () => {
    for (const c of CAPABILITIES.filter((x) => x.lifecycleState === 'CURRENT')) {
      expect(capabilityAtiva(c.id), c.id).toBe(true);
    }
  });

  it('capability sintética: registry aceita e a composição de rotas funciona', () => {
    const sintetica = {
      id: 'SYNTH_FITNESS',
      lifecycleState: 'CURRENT',
      routes: ['/synth-fitness'],
    };
    expect(capabilityAtiva('SYNTH_FITNESS', sintetica)).toBe(true);
    expect(rotasExpostas([...CAPABILITIES, sintetica])).toContain('/synth-fitness');
    // sintética DESLIGADA (estado futuro sem flag ligada) → fora, sem afetar as demais
    const desligada = { ...sintetica, lifecycleState: 'DEFERRED_BY_SCOPE', flag: 'NAO_EXISTE' };
    expect(capabilityAtiva('SYNTH_FITNESS', desligada)).toBe(false);
  });

  it('toda capability não-CURRENT tem flag declarada E a flag existe em FLAGS', () => {
    for (const c of CAPABILITIES.filter((x) => x.lifecycleState !== 'CURRENT')) {
      expect(c.flag, `${c.id} sem flag`).toBeTruthy();
      expect(c.flag in FLAGS, `${c.id}: flag ${c.flag} não existe em FLAGS`).toBe(true);
    }
  });
});

describe('coerência registry ↔ router real (App.jsx)', () => {
  it('rotas de capabilities não-CURRENT estão gated por featureAtiva no App.jsx', () => {
    for (const c of CAPABILITIES.filter((x) => x.lifecycleState !== 'CURRENT')) {
      for (const rota of c.routes) {
        // A rota aparece no App.jsx DENTRO de um bloco {featureAtiva('FLAG') && ...}:
        // procura a flag num raio de 600 chars antes da declaração da rota.
        const i = appJsx.indexOf(`path="${rota}"`);
        expect(i, `${c.id}: rota ${rota} não encontrada no App.jsx`).toBeGreaterThan(-1);
        const janela = appJsx.slice(Math.max(0, i - 600), i);
        expect(janela, `${c.id}: rota ${rota} SEM gate featureAtiva('${c.flag}')`).toContain(
          `featureAtiva('${c.flag}')`
        );
      }
    }
  });

  it('rotas CURRENT declaradas existem no router (registry não é documento morto)', () => {
    for (const c of CAPABILITIES.filter((x) => x.lifecycleState === 'CURRENT')) {
      for (const rota of c.routes) {
        if (rota === '/') continue; // index route declarada como path="/"
        expect(appJsx.includes(`path="${rota}"`), `${c.id}: rota ${rota} ausente do App.jsx`).toBe(
          true
        );
      }
    }
  });
});
