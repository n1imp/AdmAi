import { z } from 'zod';

/**
 * Schema do formulário de Serviço COMPOSTO POR SEÇÕES (DECISOR 01a04bfb §iii).
 * Cada seção valida sozinha e o schema final é a composição — este é o SEAM arquitetural
 * para Catálogo/Orçamento futuros: uma seção nova entra por composição, sem reescrever o
 * form (provado pelos fitness answers; NENHUM campo futuro existe aqui).
 * A validação ESPELHA o backend (local min2, descricao min3, cobrado não-negativo); a regra
 * de UI "cobrado > 0" preserva o comportamento vigente da superfície anterior (não é regra
 * nova de negócio).
 */

export const secaoContexto = z.object({
  tecnico: z.string().trim().min(1, 'Selecione o técnico.'),
  local: z.string().trim().min(2, 'Informe o local.'),
});

/** Variante de campo (F): o técnico deriva da sessão — a seção de contexto só tem local. */
export const secaoContextoCampo = z.object({
  local: z.string().trim().min(2, 'Informe o local.'),
});

export const secaoAtendimento = z.object({
  descricao: z.string().trim().min(3, 'Descreva o serviço.'),
  endereco: z.string().trim().optional(),
  clienteNome: z.string().trim().optional(),
  clienteTelefone: z.string().trim().optional(),
});

export const secaoMateriais = z.object({
  material: z.string().trim().optional(),
  materiais: z
    .array(
      z.object({
        materialId: z.coerce.number().int().positive(),
        quantidade: z.coerce.number().positive('Informe a quantidade.'),
      })
    )
    .default([]),
});

export const secaoValores = z.object({
  valorCobrado: z.number().positive('Informe o valor cobrado.'),
  valorMaterial: z.number().nonnegative().default(0),
});

export const schemaServicoGestao = secaoContexto
  .merge(secaoAtendimento)
  .merge(secaoMateriais)
  .merge(secaoValores);

export const schemaServicoCampo = secaoContextoCampo
  .merge(secaoAtendimento)
  .merge(secaoMateriais)
  .merge(secaoValores);

/** Zod issues → { campo: mensagem } com o PRIMEIRO erro por campo (foco no primeiro). */
export function errosPorCampo(resultado) {
  if (resultado.success) return {};
  const erros = {};
  for (const issue of resultado.error.issues) {
    const campo = String(issue.path[0] ?? 'form');
    if (!erros[campo]) erros[campo] = issue.message;
  }
  return erros;
}
