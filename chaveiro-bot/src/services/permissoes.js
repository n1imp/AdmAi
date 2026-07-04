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
  'dashboard', 'servicos', 'tecnicos', 'estoque',
  'financeiro', 'avaliacoes', 'ponto', 'aprovacoes',
  'usuarios', 'configuracao',
];

// Ações disponíveis por módulo (o que pode ser ligado/desligado na matriz do painel).
export const ACOES_POR_MODULO = {
  dashboard:    ['ver'],
  servicos:     ['ver', 'criar', 'editar', 'deletar'],
  tecnicos:     ['ver', 'editar'],
  estoque:      ['ver', 'editar'],
  financeiro:   ['ver', 'editar'],
  avaliacoes:   ['ver', 'editar'],
  ponto:        ['ver', 'editar'],   // ver = banco de horas de TODOS; editar = ajustar pontos
  aprovacoes:   ['ver', 'aprovar'],
  usuarios:     ['ver', 'editar'],
  configuracao: ['ver', 'editar'],
};

// Capacidades do escopo "próprio" (painel simplificado do funcionário).
export const CAPACIDADES_PROPRIO = ['bater_ponto', 'ver_metricas', 'editar_perfil', 'registrar_servico'];

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
  dashboard:    { ver: true },
  servicos:     { ver: true, criar: true, editar: true, deletar: true },
  tecnicos:     { ver: true, editar: true },
  estoque:      { ver: true, editar: true },
  financeiro:   { ver: true, editar: false },   // gestor VÊ financeiro, não edita
  avaliacoes:   { ver: true, editar: true },
  ponto:        { ver: true, editar: true },
  aprovacoes:   { ver: true, aprovar: true },
  usuarios:     { ver: false, editar: false },  // só o dono gerencia contas
  configuracao: { ver: false, editar: false },
  proprio:      presetProprio(true),            // gestor também é pessoa: pode bater o próprio ponto etc.
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
