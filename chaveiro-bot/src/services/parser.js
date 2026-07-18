/**
 * Utilitários de parsing/normalização para o robô de número único.
 *
 * `converterValor` é reusado pela máquina de conversa (passo de valores monetários);
 * as funções de telefone identificam o remetente pelo número (roteamento por telefone).
 */

// Exportado para reuso na máquina de conversa (passo de valores monetários).
export function converterValor(str) {
  if (!str) return 0;
  const strLower = str.toLowerCase().trim();
  if (strLower === 'nenhum' || strLower === 'n/a' || strLower === '0') return 0;
  const numStr = str.replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const valor = parseFloat(numStr);
  return isNaN(valor) ? 0 : valor;
}

/**
 * Normaliza um número de telefone para o formato usado como identificador.
 * Remove espaços, traços, parênteses e o prefixo +.
 * Ex: "+55 (11) 9 9408-9030" → "5511994089030"
 *
 * @param {string} jid - JID do WhatsApp (ex: "5511999999999@s.whatsapp.net")
 * @returns {string} Número normalizado
 */
export function normalizarTelefone(jid) {
  // JIDs multi-device têm formato "numero:dispositivo@host" — strip do sufixo :N antes de remover não-dígitos
  const numero = String(jid ?? '')
    .split('@')[0]
    .split(':')[0];
  return numero.replace(/\D/g, '');
}

/**
 * Canoniza um telefone BR para dígitos com DDI 55 sempre que possível. Aceita JID,
 * número formatado ou dígitos crus — base para identificar o remetente no robô.
 *   "+55 (11) 9 9408-9030" / "5511994089030@s.whatsapp.net" → "5511994089030"
 *   "11994089030" → "5511994089030"  (adiciona o DDI)
 * Best-effort: sem DDD identificável, devolve só os dígitos.
 */
export function canonizarTelefone(valor) {
  const d = normalizarTelefone(valor);
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) return d; // já tem DDI 55
  if (d.length === 10 || d.length === 11) return '55' + d; // DDD + número
  return d; // sem DDD: não dá para inferir o DDI com segurança
}

/**
 * Gera as variantes de um telefone BR para casamento TOLERANTE ao 9º dígito — o mesmo
 * número pode estar gravado com ou sem o 9 (ex.: cadastro vs. o que o WhatsApp entrega).
 *   "5511994089030" → ["5511994089030", "551194089030"]
 *   "551133224455"  → ["551133224455", "5511933224455"]
 * Use em `where: { telefone: { in: variantesTelefone(x) } }`.
 */
export function variantesTelefone(valor) {
  const base = canonizarTelefone(valor);
  if (!base) return [];
  const set = new Set([base]);
  if (base.startsWith('55') && base.length >= 12) {
    const ddd = base.slice(2, 4);
    const local = base.slice(4);
    if (local.length === 9 && local.startsWith('9')) {
      set.add('55' + ddd + local.slice(1)); // remove o 9
    } else if (local.length === 8) {
      set.add('55' + ddd + '9' + local); // adiciona o 9
    }
  }
  return [...set];
}
