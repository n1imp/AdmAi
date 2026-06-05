/**
 * Parser de mensagens de serviço enviadas no grupo WhatsApp.
 *
 * O técnico NÃO precisa informar o próprio nome — o sistema o identifica
 * automaticamente pelo número de telefone de quem enviou a mensagem.
 *
 * O campo "Líquido" é calculado automaticamente (cobrado − material).
 *
 * O VALOR do material não é mais informado pelo técnico: ele informa apenas
 * o nome e a quantidade, e o valor é calculado a partir do catálogo (ver
 * services/catalogo.js). O campo "Valor do material" do template antigo ainda
 * é lido para retrocompatibilidade, mas é ignorado quando há material de catálogo.
 */

function extrairCampo(texto, ...labels) {
  for (const label of labels) {
    const regex = new RegExp(`${label}:\\s*(.+)`, 'i');
    const match = texto.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

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
 * Parseia uma mensagem de serviço concluído.
 * O técnico é identificado pelo remetente (número de telefone), não pelo template.
 *
 * @param {string} texto - Texto cru da mensagem
 * @returns {{ valido: boolean, camposFaltando?: string[], ... }}
 */
export function parsearMensagem(texto) {
  const local = extrairCampo(texto, 'Local', 'local');
  const endereco = extrairCampo(texto, 'Endereço', 'Endereco', 'endereço', 'endereco');
  const descricao = extrairCampo(texto, 'Serviço', 'Servico', 'serviço', 'servico');
  const material = extrairCampo(texto, 'Material', 'material');

  const valorCobradoStr = extrairCampo(texto, 'Valor cobrado', 'valor cobrado');
  // Lido apenas para retrocompatibilidade — ignorado quando o material vem do catálogo.
  const valorMaterialStr = extrairCampo(texto, 'Valor do material', 'valor do material', 'Valor material');

  // Campo "Técnico" ainda aceito para retrocompatibilidade
  const tecnicoNome = extrairCampo(texto, 'Técnico', 'Tecnico', 'técnico', 'tecnico');

  const valorCobrado = converterValor(valorCobradoStr);
  const valorMaterialInformado = converterValor(valorMaterialStr);

  const camposFaltando = [];
  if (!local) camposFaltando.push('Local');
  if (!descricao) camposFaltando.push('Serviço');
  if (!valorCobradoStr || valorCobrado === 0) camposFaltando.push('Valor cobrado');

  if (camposFaltando.length > 0) {
    return { valido: false, camposFaltando };
  }

  return {
    valido: true,
    tecnicoNome: tecnicoNome?.trim() ?? null, // null = identificar pelo telefone
    local: local.trim(),
    endereco: endereco && endereco.toUpperCase() !== 'N/A' ? endereco.trim() : null,
    descricao: descricao.trim(),
    // Texto cru do material — resolvido contra o catálogo em services/catalogo.js
    material: material && material.toLowerCase() !== 'nenhum' ? material.trim() : null,
    valorCobrado,
    // Fallback legado: usado só se não houver material de catálogo a resolver
    valorMaterialInformado,
  };
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
  const numero = jid.split('@')[0].split(':')[0];
  return numero.replace(/\D/g, '');
}
