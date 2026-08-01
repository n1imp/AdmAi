/**
 * RBAC do painel — papéis + permissões granulares por módulo.
 *
 * Papéis:
 *   - dono        → acesso total (inclui usuários e configuração). Imutável: nenhum
 *                   override reduz o dono (evita o dono se trancar pra fora).
 *   - gestor      → operação: serviços, técnicos, estoque, avaliações, ponto e
 *                   aprovações + VER financeiro. NÃO gerencia usuários/permissões
 *                   nem configuração/WhatsApp. Customizável por overrides.
 *   - funcionario → escopo "próprio": só os próprios dados (nunca dados de outros
 *                   técnicos). Os toggles dele (namespace `proprio`) ligam/desligam
 *                   features do próprio painel.
 *
 * Permissões EFETIVAS = preset do papel ⊕ overrides (Usuario.permissoes).
 * O acesso é SEMPRE checado no servidor (esconder no front não é segurança).
 */

// Módulos de empresa (acesso amplo — dono/gestor). Ordem = ordem de exibição no painel.
export const MODULOS = [
  'dashboard',
  'servicos',
  'tecnicos',
  'estoque',
  'financeiro',
  'avaliacoes',
  'ponto',
  'aprovacoes',
  'usuarios',
  'configuracao',
];

// Ações disponíveis por módulo (o que pode ser ligado/desligado na matriz do painel).
export const ACOES_POR_MODULO = {
  dashboard: ['ver'],
  servicos: ['ver', 'criar', 'editar', 'deletar'],
  tecnicos: ['ver', 'editar'],
  estoque: ['ver', 'editar'],
  financeiro: ['ver', 'editar'],
  avaliacoes: ['ver', 'editar'],
  ponto: ['ver', 'editar'], // ver = banco de horas de TODOS; editar = ajustar pontos
  aprovacoes: ['ver', 'aprovar'],
  usuarios: ['ver', 'editar'],
  configuracao: ['ver', 'editar'],
};

// Capacidades do escopo "próprio" (painel simplificado do funcionário).
export const CAPACIDADES_PROPRIO = [
  'bater_ponto',
  'ver_metricas',
  'editar_perfil',
  'registrar_servico',
  'documentos',
];

export const PAPEIS = ['dono', 'gestor', 'funcionario'];

// Constrói um mapa { acao: valor } para todas as ações de um módulo.
function todasAcoes(modulo, valor) {
  return Object.fromEntries((ACOES_POR_MODULO[modulo] ?? []).map((a) => [a, valor]));
}

function presetProprio(valor) {
  return Object.fromEntries(CAPACIDADES_PROPRIO.map((c) => [c, valor]));
}

// Grant total (todos os módulos + todas as ações + escopo próprio). Base do "dono".
function grantTotal() {
  const out = { proprio: presetProprio(true) };
  for (const m of MODULOS) out[m] = todasAcoes(m, true);
  return out;
}

// ── PRESETS POR PAPEL ─────────────────────────────────────────────────────────
// dono não tem preset estático (é sempre grantTotal, ver permissoesEfetivas).

const PRESET_GESTOR = {
  dashboard: { ver: true },
  servicos: { ver: true, criar: true, editar: true, deletar: true },
  tecnicos: { ver: true, editar: true },
  estoque: { ver: true, editar: true },
  financeiro: { ver: true, editar: false }, // gestor VÊ financeiro, não edita
  avaliacoes: { ver: true, editar: true },
  ponto: { ver: true, editar: true },
  aprovacoes: { ver: true, aprovar: true },
  usuarios: { ver: false, editar: false }, // só o dono gerencia contas
  configuracao: { ver: false, editar: false },
  proprio: presetProprio(true), // gestor também é pessoa: pode bater o próprio ponto etc.
};

const PRESET_FUNCIONARIO = (() => {
  const out = { proprio: presetProprio(true) };
  for (const m of MODULOS) out[m] = todasAcoes(m, false); // nenhum módulo de empresa
  return out;
})();

const PRESETS = {
  gestor: PRESET_GESTOR,
  funcionario: PRESET_FUNCIONARIO,
};

/** Preset PURO de um papel (sem overrides). dono = grant total. */
export function presetDoPapel(papel) {
  if (papel === 'dono') return grantTotal();
  return PRESETS[papel] ?? PRESET_FUNCIONARIO;
}

// Deep-merge raso (2 níveis: modulo → acao). Override só sobrescreve chaves presentes.
function mesclar(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = {};
  for (const grupo of new Set([...Object.keys(base), ...Object.keys(override)])) {
    out[grupo] = { ...(base[grupo] ?? {}), ...(override[grupo] ?? {}) };
  }
  return out;
}

/**
 * Permissões efetivas de um usuário = preset do papel ⊕ overrides.
 * O dono é imutável (grant total) — overrides são ignorados para ele.
 * @param {{ papel?:string, admin?:boolean, permissoes?:object|null }} usuario
 */
export function permissoesEfetivas(usuario) {
  const papel = usuario?.papel ?? (usuario?.admin ? 'dono' : 'funcionario');
  if (papel === 'dono') return grantTotal();
  return mesclar(presetDoPapel(papel), usuario?.permissoes);
}

/**
 * Pode o usuário executar `acao` no `modulo` (escopo de empresa)?
 * Use no middleware requirePermissao e em checagens pontuais.
 */
export function pode(usuario, modulo, acao) {
  if ((usuario?.papel ?? (usuario?.admin ? 'dono' : null)) === 'dono') return true;
  const ef = usuario?.permissoesEfetivas ?? permissoesEfetivas(usuario);
  return Boolean(ef?.[modulo]?.[acao]);
}

/** Pode o usuário usar uma capacidade do próprio painel (bater ponto, registrar serviço…)? */
export function podeProprio(usuario, capacidade) {
  if ((usuario?.papel ?? (usuario?.admin ? 'dono' : null)) === 'dono') return true;
  const ef = usuario?.permissoesEfetivas ?? permissoesEfetivas(usuario);
  return Boolean(ef?.proprio?.[capacidade]);
}

/**
 * Reduz overrides propostos por um ator ao teto de sua PRÓPRIA autoridade efetiva:
 * nunca permite conceder (a si mesmo ou a outro usuário) uma permissão de módulo/ação
 * ou capacidade "proprio" que o ator não possui. Revogar (valor false) é sempre permitido.
 * Dono não tem teto (grant total, ver permissoesEfetivas). Use em rotas que gravam
 * `Usuario.permissoes` a partir de input do cliente (ex.: PATCH /usuarios/:id).
 * @param {{papel?:string, admin?:boolean, permissoesEfetivas?:object}} ator
 * @param {object|null} overridesPropostos já processado por sanitizarPermissoes()
 */
export function limitarPermissoesAoAtor(ator, overridesPropostos) {
  if (!overridesPropostos) return overridesPropostos;
  const papelAtor = ator?.papel ?? (ator?.admin ? 'dono' : null);
  if (papelAtor === 'dono') return overridesPropostos;
  const efetivasAtor = ator?.permissoesEfetivas ?? permissoesEfetivas(ator);
  const out = {};
  for (const m of MODULOS) {
    if (!overridesPropostos[m]) continue;
    const acoes = {};
    for (const a of Object.keys(overridesPropostos[m])) {
      const valor = overridesPropostos[m][a];
      if (valor === true && !efetivasAtor?.[m]?.[a]) continue; // acima do teto do ator: descarta
      acoes[a] = valor;
    }
    if (Object.keys(acoes).length) out[m] = acoes;
  }
  if (overridesPropostos.proprio) {
    const proprio = {};
    for (const c of Object.keys(overridesPropostos.proprio)) {
      const valor = overridesPropostos.proprio[c];
      if (valor === true && !efetivasAtor?.proprio?.[c]) continue;
      proprio[c] = valor;
    }
    if (Object.keys(proprio).length) out.proprio = proprio;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Nível do papel na hierarquia. `PAPEIS` já está ordenado do mais para o menos
 * privilegiado, então o índice serve de nível: menor = mais poder. Papel
 * desconhecido cai para o fim (menos privilegiado possível) — fail-closed.
 * @param {string|null|undefined} papel
 * @returns {number}
 */
export function nivelDoPapel(papel) {
  const i = PAPEIS.indexOf(String(papel ?? ''));
  return i === -1 ? PAPEIS.length : i;
}

/**
 * O ator pode administrar a CREDENCIAL ou o PAPEL de um usuário-alvo?
 *
 * Regra: o ator precisa superar ESTRITAMENTE o alvo na hierarquia, e nunca
 * pode agir sobre a própria conta por essas rotas.
 *
 * Motivação (achado de auditoria): `POST /tecnicos/:id/acesso/reset` exigia
 * apenas `tecnicos.editar` — que o preset de gestor possui — e não olhava o
 * papel do alvo. Como a conta do dono ganha um `Tecnico` vinculado ao verificar
 * o telefone, um gestor resetava o PIN do dono e recebia o PIN em claro na
 * resposta, tomando a conta.
 *
 * Dono→dono também é negado: com dois donos, cada um tem recuperação por
 * e-mail; permitir o reset lateral só abriria caminho de tomada entre pares.
 *
 * @param {{id?:number, papel?:string, admin?:boolean}} ator
 * @param {{id?:number, papel?:string, admin?:boolean}} alvo
 * @returns {boolean}
 */
export function podeGerenciarUsuario(ator, alvo) {
  if (!ator || !alvo) return false;
  if (ator.id != null && alvo.id != null && ator.id === alvo.id) return false;
  const papelAtor = ator.papel ?? (ator.admin ? 'dono' : 'funcionario');
  const papelAlvo = alvo.papel ?? (alvo.admin ? 'dono' : 'funcionario');
  return nivelDoPapel(papelAtor) < nivelDoPapel(papelAlvo);
}

/**
 * O ator pode ATRIBUIR este papel a alguém? Mesmo critério: só papel
 * estritamente abaixo do seu. Fecha a escalada em que um ator com
 * `usuarios.editar` cria uma conta de papel igual ou superior ao dele.
 * @param {{papel?:string, admin?:boolean}} ator
 * @param {string} papelPretendido
 * @returns {boolean}
 */
export function podeAtribuirPapel(ator, papelPretendido) {
  if (!ator) return false;
  const papelAtor = ator.papel ?? (ator.admin ? 'dono' : 'funcionario');
  return nivelDoPapel(papelAtor) < nivelDoPapel(papelPretendido);
}

/** Sanitiza um objeto de overrides vindo do cliente: mantém só módulos/ações conhecidos. */
export function sanitizarPermissoes(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const m of MODULOS) {
    if (input[m] && typeof input[m] === 'object') {
      const acoes = {};
      for (const a of ACOES_POR_MODULO[m]) {
        if (typeof input[m][a] === 'boolean') acoes[a] = input[m][a];
      }
      if (Object.keys(acoes).length) out[m] = acoes;
    }
  }
  if (input.proprio && typeof input.proprio === 'object') {
    const proprio = {};
    for (const c of CAPACIDADES_PROPRIO) {
      if (typeof input.proprio[c] === 'boolean') proprio[c] = input.proprio[c];
    }
    if (Object.keys(proprio).length) out.proprio = proprio;
  }
  return Object.keys(out).length ? out : null;
}
