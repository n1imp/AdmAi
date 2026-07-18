import { Lock, ShieldCheck, UserCog } from 'lucide-react';

// Rótulos pt-BR dos módulos e ações (espelham o catálogo do backend).
export const ROTULO_MODULO = {
  dashboard: 'Painel',
  servicos: 'Serviços',
  tecnicos: 'Técnicos',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
  avaliacoes: 'Avaliações',
  ponto: 'Banco de horas',
  aprovacoes: 'Aprovações',
  usuarios: 'Usuários',
  configuracao: 'Configuração',
};

export const ROTULO_ACAO = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  deletar: 'Excluir',
  aprovar: 'Aprovar',
};

export const ROTULO_PROPRIO = {
  bater_ponto: 'Bater ponto',
  ver_metricas: 'Ver próprias métricas',
  editar_perfil: 'Editar perfil',
  registrar_servico: 'Registrar serviços',
};

// Toggle (chave) reutilizável no padrão dark/âmbar do painel.
function Toggle({ ligado, onToggle, desabilitado, rotulo }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={desabilitado}
      aria-pressed={ligado}
      aria-label={rotulo}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        ligado ? 'bg-accent-400' : 'bg-dark-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          ligado ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

/**
 * Matriz de permissões: um toggle por (módulo, ação) + seção de capacidades próprias.
 *
 * @param {object}   props.matriz            { modulo: { acao: bool }, proprio: { cap: bool } }
 * @param {object}   props.acoesPorModulo    { modulo: [acoes] } do catálogo
 * @param {string[]} props.capacidadesProprio lista de capacidades do catálogo
 * @param {function} props.onToggleModulo    (modulo, acao) => void
 * @param {function} props.onToggleProprio   (capacidade) => void
 * @param {boolean}  props.bloqueado         dono: tudo ligado e imutável
 * @param {boolean}  props.destacarProprio   funcionário: realça as permissões próprias
 */
export default function MatrizPermissoes({
  matriz,
  acoesPorModulo = {},
  capacidadesProprio = [],
  onToggleModulo,
  onToggleProprio,
  bloqueado = false,
  destacarProprio = false,
}) {
  const modulos = Object.keys(acoesPorModulo);

  return (
    <div className="flex flex-col gap-4">
      {bloqueado && (
        <div className="flex items-center gap-2 rounded-md bg-indigo-400/10 border border-indigo-400/20 px-3 py-2 text-xs text-indigo-300">
          <ShieldCheck size={14} className="shrink-0" />O dono tem acesso total a todos os módulos.
          Estas permissões não podem ser alteradas.
        </div>
      )}

      {/* ── Permissões por módulo ─────────────────────────────────────────── */}
      <div>
        <p className="kpi-label mb-2 flex items-center gap-1.5">
          {bloqueado && <Lock size={11} />}
          Acesso aos módulos
          {destacarProprio && (
            <span className="text-muted normal-case font-normal tracking-normal">
              (desativados para funcionário)
            </span>
          )}
        </p>
        <div className={`flex flex-col gap-2 ${destacarProprio ? 'opacity-60' : ''}`}>
          {modulos.map((modulo) => {
            const acoes = acoesPorModulo[modulo] ?? [];
            return (
              <div key={modulo} className="rounded-md border border-dark-600 bg-dark-700/40 p-3">
                <p className="text-sm font-medium text-white mb-2">
                  {ROTULO_MODULO[modulo] ?? modulo}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                  {acoes.map((acao) => (
                    <label
                      key={acao}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <Toggle
                        ligado={Boolean(matriz?.[modulo]?.[acao])}
                        onToggle={() => onToggleModulo(modulo, acao)}
                        desabilitado={bloqueado}
                        rotulo={`${ROTULO_MODULO[modulo] ?? modulo} — ${ROTULO_ACAO[acao] ?? acao}`}
                      />
                      <span className="text-xs text-muted">{ROTULO_ACAO[acao] ?? acao}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Permissões próprias ───────────────────────────────────────────── */}
      <div>
        <p className="kpi-label mb-2 flex items-center gap-1.5">
          <UserCog size={11} />
          Permissões próprias
          {destacarProprio && (
            <span className="text-accent-300 normal-case font-normal tracking-normal">
              (foco do funcionário)
            </span>
          )}
        </p>
        <div
          className={`rounded-md border p-3 flex flex-col gap-2.5 ${
            destacarProprio
              ? 'border-accent-400/30 bg-accent-400/5'
              : 'border-dark-600 bg-dark-700/40'
          }`}
        >
          {capacidadesProprio.map((cap) => (
            <label key={cap} className="flex items-center gap-3 cursor-pointer select-none">
              <Toggle
                ligado={Boolean(matriz?.proprio?.[cap])}
                onToggle={() => onToggleProprio(cap)}
                desabilitado={bloqueado}
                rotulo={ROTULO_PROPRIO[cap] ?? cap}
              />
              <span className="text-sm text-white">{ROTULO_PROPRIO[cap] ?? cap}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
