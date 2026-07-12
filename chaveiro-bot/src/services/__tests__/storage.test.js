/**
 * Unit — object storage (F1b). Mocka @supabase/supabase-js e o env.
 * Prova o gate storageHabilitado() e o contrato de uploadImagem (chama upload
 * com o buffer/contentType e devolve a URL pública; propaga erro do storage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const envMock = vi.hoisted(() => ({ env: {} }));
vi.mock('../../config/env.js', () => envMock);

const uploadMock = vi.hoisted(() => vi.fn());
const getPublicUrlMock = vi.hoisted(() => vi.fn());
const removeMock = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock, remove: removeMock }) },
  }),
}));

import { storageHabilitado, uploadImagem, removerImagem } from '../storage.js';

const URL_PUBLICA = 'https://x.supabase.co/storage/v1/object/public/estoque/produto-1.png';

beforeEach(() => {
  envMock.env = {};
  uploadMock.mockReset().mockResolvedValue({ error: null });
  getPublicUrlMock.mockReset().mockReturnValue({ data: { publicUrl: URL_PUBLICA } });
  removeMock.mockReset().mockResolvedValue({ error: null });
});

describe('storage (F1b)', () => {
  it('storageHabilitado(): false sem credenciais, true com as duas', () => {
    expect(storageHabilitado()).toBe(false);
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    expect(storageHabilitado()).toBe(true);
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co' }; // só metade → false
    expect(storageHabilitado()).toBe(false);
  });

  it('uploadImagem envia o buffer e devolve a URL pública', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const buffer = Buffer.from('img');
    const url = await uploadImagem('estoque', 'produto-1.png', buffer, 'image/png');
    expect(url).toBe(URL_PUBLICA);
    expect(uploadMock).toHaveBeenCalledWith('produto-1.png', buffer, { contentType: 'image/png', upsert: false });
  });

  it('uploadImagem propaga erro do storage', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    uploadMock.mockResolvedValue({ error: { message: 'bucket not found' } });
    await expect(uploadImagem('estoque', 'p.png', Buffer.from('x'), 'image/png')).rejects.toThrow(/bucket not found/);
  });

  it('removerImagem é best-effort (não lança em erro)', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    removeMock.mockResolvedValue({ error: { message: 'x' } });
    await expect(removerImagem('estoque', 'p.png')).resolves.toBeUndefined();
  });
});
