import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Documentos from '../Documentos.jsx';

// F9/M4: documentos do funcionário (bucket privado, atrás da flag DOCUMENTOS_ENABLED).
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
    delete: (...a) => mockDelete(...a),
  },
  formatarData: () => '01/07/2026 10:00',
}));

const mockToast = vi.fn();
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => mockToast }));

// EstadoVazio usa Link — evita precisar de Router.
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const erroStatus = (status) => Object.assign(new Error('http'), { response: { status } });
const DOC = {
  id: 1,
  tipo: 'contrato',
  nome: 'contrato.pdf',
  mime: 'application/pdf',
  tamanho: 2048,
  criadoEm: '2026-07-01T10:00:00Z',
  url: '/api/me/documentos/1/arquivo',
};

describe('<Documentos> — F9/M4', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
    mockToast.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('lista os documentos do funcionário', async () => {
    mockGet.mockResolvedValue({ data: { documentos: [DOC] } });
    render(<Documentos />);
    await waitFor(() => expect(screen.getByText('contrato.pdf')).toBeInTheDocument());
    // Ação de baixar identifica o item de forma inequívoca (o rótulo "Contrato" também
    // existe na <option> do formulário de envio).
    expect(screen.getByRole('button', { name: 'Baixar contrato.pdf' })).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('flag off (404): mostra "Documentos indisponíveis"', async () => {
    mockGet.mockRejectedValue(erroStatus(404));
    render(<Documentos />);
    await waitFor(() => expect(screen.getByText('Documentos indisponíveis')).toBeInTheDocument());
  });

  it('estado vazio quando não há documentos', async () => {
    mockGet.mockResolvedValue({ data: { documentos: [] } });
    render(<Documentos />);
    await waitFor(() => expect(screen.getByText('Nenhum documento enviado')).toBeInTheDocument());
  });

  it('envia um documento (arquivo → data URI → POST) e o mostra na lista', async () => {
    mockGet.mockResolvedValue({ data: { documentos: [] } });
    mockPost.mockResolvedValue({ data: { documento: DOC } });
    const { container } = render(<Documentos />);
    await screen.findByText('Nenhum documento enviado');

    const file = new File(['%PDF-1.4 conteudo'], 'contrato.pdf', { type: 'application/pdf' });
    await userEvent.upload(container.querySelector('input[type="file"]'), file);
    await userEvent.click(screen.getByRole('button', { name: /Enviar documento/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0][0]).toBe('/me/documentos');
    expect(mockPost.mock.calls[0][1].tipo).toBe('contrato');
    expect(mockPost.mock.calls[0][1].arquivo).toMatch(/^data:application\/pdf;base64,/);
    await waitFor(() => expect(screen.getByText('contrato.pdf')).toBeInTheDocument());
  });

  it('remove um documento após confirmação', async () => {
    mockGet.mockResolvedValue({ data: { documentos: [DOC] } });
    mockDelete.mockResolvedValue({ data: { removido: true, id: 1 } });
    render(<Documentos />);
    await screen.findByText('contrato.pdf');

    await userEvent.click(screen.getByRole('button', { name: 'Remover contrato.pdf' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/me/documentos/1'));
    await waitFor(() => expect(screen.queryByText('contrato.pdf')).not.toBeInTheDocument());
  });

  it('baixa o documento via blob autenticado (endpoint com responseType blob)', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:x');
    global.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mockGet.mockImplementation((url) => {
      if (url === '/me/documentos') return Promise.resolve({ data: { documentos: [DOC] } });
      return Promise.resolve({ data: new Blob(['x']) });
    });
    render(<Documentos />);
    await screen.findByText('contrato.pdf');

    await userEvent.click(screen.getByRole('button', { name: 'Baixar contrato.pdf' }));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/me/documentos/1/arquivo', { responseType: 'blob' })
    );
  });
});
