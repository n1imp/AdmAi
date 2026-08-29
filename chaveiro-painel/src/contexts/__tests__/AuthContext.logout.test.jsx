import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { queryClient } from '../../lib/queryClient.js';
import { useServicos } from '../../features/servicos/servicosApi.js';
import api from '../../lib/api.js';

/* Achado ALTA do Revisor 01a04c56: o cache de server state sobrevivia ao logout da UI
   (só `limparSessao`, do interceptor de 401, limpava). Trocar de empresa reexibia dados da
   anterior. Estes testes provam o isolamento no caminho que o usuário realmente usa. */

vi.mock('../../lib/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../../hooks/useAnalytics.js', () => ({
  useAnalyticsIdentify: () => {},
  analyticsReset: () => {},
}));

// JWT de teste: só o payload importa (decodeJWT lê a parte do meio).
const token = (payload) =>
  `e30.${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))}.sig`;
const TOKEN_A = token({
  id: 1,
  nome: 'Dona A',
  admin: true,
  papel: 'dono',
  empresaId: 1,
  exp: 4102444800,
});
const TOKEN_B = token({
  id: 2,
  nome: 'Dono B',
  admin: true,
  papel: 'dono',
  empresaId: 2,
  exp: 4102444800,
});

function Tela() {
  const { user, logout } = useAuth();
  const consulta = useServicos();
  const linhas = consulta.data?.data ?? [];
  return (
    <div>
      <p>usuario: {user?.nome ?? 'nenhum'}</p>
      <ul>
        {linhas.map((s) => (
          <li key={s.id}>{s.descricao}</li>
        ))}
      </ul>
      <button type="button" onClick={logout}>
        Sair
      </button>
    </div>
  );
}

function montar() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Tela />
      </AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  api.get.mockReset();
});
afterEach(cleanup);

describe('logout e isolamento do cache entre identidades', () => {
  it('empresa A → logout → empresa B NÃO vê os dados de A', async () => {
    const user = userEvent.setup();
    localStorage.setItem('admai_token', TOKEN_A);
    api.get.mockImplementation((url) =>
      url.startsWith('/me/permissoes')
        ? Promise.resolve({ data: { papel: 'dono', admin: true, permissoes: {} } })
        : Promise.resolve({
            data: { data: [{ id: 1, descricao: 'Serviço SECRETO da empresa A' }], total: 1 },
          })
    );

    const { unmount } = montar();
    expect(await screen.findByText('Serviço SECRETO da empresa A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(localStorage.getItem('admai_token')).toBeNull());
    unmount();
    cleanup();

    // Empresa B entra: a resposta dela é outra; nada de A pode aparecer (nem como flash stale).
    localStorage.setItem('admai_token', TOKEN_B);
    api.get.mockImplementation((url) =>
      url.startsWith('/me/permissoes')
        ? Promise.resolve({ data: { papel: 'dono', admin: true, permissoes: {} } })
        : Promise.resolve({
            data: { data: [{ id: 9, descricao: 'Serviço da empresa B' }], total: 1 },
          })
    );
    montar();

    expect(screen.queryByText('Serviço SECRETO da empresa A')).not.toBeInTheDocument();
    expect(await screen.findByText('Serviço da empresa B')).toBeInTheDocument();
    expect(screen.queryByText('Serviço SECRETO da empresa A')).not.toBeInTheDocument();
  });

  it('logout descarta as entradas de cache da identidade que saiu', async () => {
    const user = userEvent.setup();
    localStorage.setItem('admai_token', TOKEN_A);
    api.get.mockResolvedValue({ data: { data: [], total: 0 } });

    const doA = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.queryKey.includes('e1u1'));

    montar();
    await waitFor(() => expect(doA().length).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    /* Some do cache e não volta: o clear apaga, e o escopo da key impede que a próxima
       sessão (ou o refetch pós-logout) reocupe a mesma entrada. */
    await waitFor(() => expect(doA()).toHaveLength(0));
  });
});
