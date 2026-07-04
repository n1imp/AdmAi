import { describe, it, expect } from 'vitest';
import { normalizarInboundCloud, soDigitos, configCloudFaltando } from '../cloud-gateway.js';
import { schema } from '../../../config/env.js';

describe('cloud-gateway: soDigitos', () => {
  it('extrai apenas dígitos de um jid', () => {
    expect(soDigitos('5511999998888@s.whatsapp.net')).toBe('5511999998888');
  });
  it('remove +, espaços e símbolos', () => {
    expect(soDigitos('+55 (11) 99999-8888')).toBe('5511999998888');
  });
  it('tolera null/undefined', () => {
    expect(soDigitos(null)).toBe('');
    expect(soDigitos(undefined)).toBe('');
  });
});

describe('cloud-gateway: normalizarInboundCloud', () => {
  it('converte mensagens de texto da Meta em eventos shape Evolution', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '123', display_phone_number: '5511...' },
                contacts: [{ wa_id: '5511999998888', profile: { name: 'Cliente' } }],
                messages: [
                  { from: '5511999998888', id: 'wamid.X', timestamp: '1700000000', type: 'text', text: { body: 'serviço' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const eventos = normalizarInboundCloud(body);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toEqual({
      event: 'MESSAGES_UPSERT',
      data: {
        key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
        message: { conversation: 'serviço' },
      },
    });
  });

  it('extrai texto de respostas interativas (botão)', () => {
    const body = {
      entry: [
        { changes: [{ value: { messages: [{ from: '551130000000', type: 'interactive', interactive: { button_reply: { id: 'b1', title: '5' } } }] } }] },
      ],
    };
    const [ev] = normalizarInboundCloud(body);
    expect(ev.data.message.conversation).toBe('5');
  });

  it('ignora payloads de status (sem messages)', () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid', status: 'delivered' }] } }] }] };
    expect(normalizarInboundCloud(body)).toEqual([]);
  });

  it('tolera payload vazio/sem entry', () => {
    expect(normalizarInboundCloud({})).toEqual([]);
    expect(normalizarInboundCloud(null)).toEqual([]);
  });
});

describe('cloud-gateway: configCloudFaltando', () => {
  it('retorna a forma { configIncompleta, faltando }', () => {
    const r = configCloudFaltando();
    expect(r).toHaveProperty('configIncompleta');
    expect(Array.isArray(r.faltando)).toBe(true);
  });
});

describe('env cross-field: WHATSAPP_PROVIDER=cloud', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    API_TOKEN: 'token',
    JWT_SECRET: '0123456789012345678901234567890123456789',
  };
  it('aceita provider cloud com META_APP_SECRET + VERIFY_TOKEN + ENCRYPTION_KEY', () => {
    const r = schema.safeParse({
      ...base,
      WHATSAPP_PROVIDER: 'cloud',
      META_APP_SECRET: 'segredo-app',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      ENCRYPTION_KEY: 'chave-mestra-suficientemente-longa',
    });
    expect(r.success).toBe(true);
  });
  it('rejeita provider cloud sem META_APP_SECRET', () => {
    const r = schema.safeParse({
      ...base,
      WHATSAPP_PROVIDER: 'cloud',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      ENCRYPTION_KEY: 'chave-mestra-suficientemente-longa',
    });
    expect(r.success).toBe(false);
    expect(r.error.issues.map((i) => i.path.join('.'))).toContain('META_APP_SECRET');
  });
  it('default evolution não exige as vars cloud', () => {
    const r = schema.safeParse({ ...base });
    expect(r.success).toBe(true);
    expect(r.data.WHATSAPP_PROVIDER).toBe('evolution');
  });
});
