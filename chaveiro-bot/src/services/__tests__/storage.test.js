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
const createSignedUrlMock = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
        remove: removeMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
  }),
}));

const mkdirMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ mkdir: mkdirMock, writeFile: writeFileMock }));

import {
  storageHabilitado,
  uploadImagem,
  removerImagem,
  uploadComFallback,
  uploadPrivado,
  urlAssinada,
} from '../storage.js';

const URL_PUBLICA = 'https://x.supabase.co/storage/v1/object/public/estoque/produto-1.png';
const URL_ASSINADA =
  'https://x.supabase.co/storage/v1/object/sign/selfies-ponto/ponto-1.jpg?token=abc';

beforeEach(() => {
  envMock.env = {};
  uploadMock.mockReset().mockResolvedValue({ error: null });
  getPublicUrlMock.mockReset().mockReturnValue({ data: { publicUrl: URL_PUBLICA } });
  removeMock.mockReset().mockResolvedValue({ error: null });
  mkdirMock.mockReset().mockResolvedValue(undefined);
  writeFileMock.mockReset().mockResolvedValue(undefined);
  createSignedUrlMock
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: URL_ASSINADA }, error: null });
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
    expect(uploadMock).toHaveBeenCalledWith('produto-1.png', buffer, {
      contentType: 'image/png',
      upsert: false,
    });
  });

  it('uploadImagem com upsert=true sobrescreve (backfill idempotente)', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const url = await uploadImagem('estoque', 'produto-1.png', Buffer.from('img'), 'image/png', {
      upsert: true,
    });
    expect(url).toBe(URL_PUBLICA);
    expect(uploadMock).toHaveBeenCalledWith('produto-1.png', expect.any(Buffer), {
      contentType: 'image/png',
      upsert: true,
    });
  });

  it('uploadPrivado com upsert=true sobrescreve (backfill idempotente)', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    await uploadPrivado('selfies-ponto', 'ponto-1.jpg', Buffer.from('x'), 'image/jpeg', {
      upsert: true,
    });
    expect(uploadMock).toHaveBeenCalledWith('ponto-1.jpg', expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  });

  it('uploadImagem propaga erro do storage', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    uploadMock.mockResolvedValue({ error: { message: 'bucket not found' } });
    await expect(uploadImagem('estoque', 'p.png', Buffer.from('x'), 'image/png')).rejects.toThrow(
      /bucket not found/
    );
  });

  it('removerImagem é best-effort (não lança em erro)', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    removeMock.mockResolvedValue({ error: { message: 'x' } });
    await expect(removerImagem('estoque', 'p.png')).resolves.toBeUndefined();
  });

  it('uploadComFallback: sem storage grava no disco', async () => {
    envMock.env = {};
    const url = await uploadComFallback(
      'estoque',
      'p.png',
      Buffer.from('x'),
      'image/png',
      '/tmp/up'
    );
    expect(url).toBe('/uploads/p.png');
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('uploadComFallback: com storage OK devolve a URL pública (sem tocar o disco)', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const url = await uploadComFallback(
      'estoque',
      'p.png',
      Buffer.from('x'),
      'image/png',
      '/tmp/up'
    );
    expect(url).toBe(URL_PUBLICA);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uploadComFallback: falha do storage CAI para o disco', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    uploadMock.mockResolvedValue({ error: { message: 'storage down' } });
    const url = await uploadComFallback(
      'estoque',
      'p.png',
      Buffer.from('x'),
      'image/png',
      '/tmp/up'
    );
    expect(url).toBe('/uploads/p.png');
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('uploadComFallback STRICT: falha do storage LANÇA (não grava no disco)', async () => {
    envMock.env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      STORAGE_STRICT: 'true',
    };
    uploadMock.mockResolvedValue({ error: { message: 'storage down' } });
    await expect(
      uploadComFallback('estoque', 'p.png', Buffer.from('x'), 'image/png', '/tmp/up')
    ).rejects.toThrow(/STORAGE_STRICT/);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uploadComFallback STRICT: sem storage configurado LANÇA', async () => {
    envMock.env = { STORAGE_STRICT: 'true' };
    await expect(
      uploadComFallback('estoque', 'p.png', Buffer.from('x'), 'image/png', '/tmp/up')
    ).rejects.toThrow(/STORAGE_STRICT/);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uploadComFallback STRICT: storage OK devolve a URL pública normalmente', async () => {
    envMock.env = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      STORAGE_STRICT: 'true',
    };
    const url = await uploadComFallback(
      'estoque',
      'p.png',
      Buffer.from('x'),
      'image/png',
      '/tmp/up'
    );
    expect(url).toBe(URL_PUBLICA);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uploadPrivado envia o objeto e não devolve URL pública', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    await expect(
      uploadPrivado('selfies-ponto', 'ponto-1.jpg', Buffer.from('x'), 'image/jpeg')
    ).resolves.toBeUndefined();
    expect(uploadMock).toHaveBeenCalledWith('ponto-1.jpg', expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('uploadPrivado propaga erro do storage', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    uploadMock.mockResolvedValue({ error: { message: 'boom' } });
    await expect(
      uploadPrivado('selfies-ponto', 'p.jpg', Buffer.from('x'), 'image/jpeg')
    ).rejects.toThrow(/boom/);
  });

  it('urlAssinada devolve a URL assinada', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    const url = await urlAssinada('selfies-ponto', 'ponto-1.jpg', 60);
    expect(url).toBe(URL_ASSINADA);
    expect(createSignedUrlMock).toHaveBeenCalledWith('ponto-1.jpg', 60);
  });

  it('urlAssinada devolve null quando o objeto não existe', async () => {
    envMock.env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    createSignedUrlMock.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const url = await urlAssinada('selfies-ponto', 'missing.jpg', 60);
    expect(url).toBeNull();
  });
});
