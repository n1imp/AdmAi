// Smoke de acessibilidade automatizada (axe-core) nos primitives de botao — F9/M6 (fase B).
// Arquivo *.axe.jsx: fica FORA da suite principal (vite.config.js inclui *.test.{js,jsx});
// roda so via `npm run test:a11y` (config dedicada), que e um passo NAO-bloqueante no CI.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Button, IconButton } from '../Button.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../../test/axe.js';

afterEach(cleanup);

describe('a11y (axe) — primitives de botao', () => {
  it('Button nao tem violacoes serias/criticas', async () => {
    const { container } = render(<Button>Salvar</Button>);
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });

  it('IconButton (so icone) expoe nome acessivel via label', async () => {
    const { container } = render(<IconButton label="Fechar">×</IconButton>);
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });
});
