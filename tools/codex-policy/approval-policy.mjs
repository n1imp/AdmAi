// Decisão de aprovação para requisições iniciadas pelo Codex.
//
// Este arquivo é VERSIONADO de propósito: não contém caminho absoluto, hash de
// máquina nem credencial — a raiz da worktree entra por parâmetro em
// `criarPolitica(root)`. O que é específico da máquina (launcher, wrapper,
// perfis, pins) fica em `.claude/`, fora do versionamento.
//
// Mantido separado de `.claude/codex-mcp-policy.mjs` porque aqui não há I/O:
// são funções puras, testáveis por `node --test`. O launcher fixa o hash deste
// arquivo — um módulo importado sem pin seria um furo no mecanismo de
// integridade.
//
// ── Por que ALLOWLIST e não denylist ────────────────────────────────────────
// A primeira versão negava por categoria (rede, docker, git destrutivo…) via
// regex sobre a linha de comando. Uma revisão adversarial aprovou 45 de 45
// comandos perigosos contra ela: `git -c core.pager=cat push` escapa porque a
// regex exigia adjacência; `certutil -urlcache`, `bitsadmin`, `iex (irm …)`,
// `powershell -enc`, `pip install`, `rm -rf` simplesmente não estavam na lista.
// Denylist de shell falha ABERTA — não há como enumerar o perigoso.
// Aqui só passa o que está explicitamente listado; todo o resto é negado.
//
// Formato da resposta (extraído do binário codex 0.144.1):
//   `struct ExecApprovalResponse with 1 element` + campo `decision`
//   ReviewDecision snake_case: approved | approved_for_session | denied | abort
//
// Campos dos params (idem):
//   exec:  codex_elicitation, codex_mcp_tool_call_id, codex_event_id,
//          codex_call_id, codex_command, codex_cwd, codex_parsed_cmd
//   patch: codex_elicitation, codex_mcp_tool_call_id, codex_event_id,
//          codex_call_id, codex_reason, codex_grant_root, codex_changes

import { basename, dirname, join, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

/** Encadeamento/expansão de shell: invalida qualquer análise token a token. */
export const METACARACTERES = /[;&|<>`$(){}\n\r]/;

/**
 * Nome curto 8.3 (`CLAUDE~1` = `.claude`, `GIT~1` = `.git`). Está ativo neste
 * volume, e sem esta checagem toda proteção baseada em nome de diretório é
 * contornável — um patch em `GIT~1/hooks/pre-commit` seria RCE aprovada.
 */
export const NOME_CURTO_8_3 = /~\d/;

/** Protegidos mesmo dentro da worktree: segredos, histórico e a própria política. */
export const caminhoProtegido =
  /(^|[\\/])\.env($|[.\\/])|(^|[\\/])\.envrc($|[\\/])|(^|[\\/])\.git([\\/]|$)|(^|[\\/])\.claude([\\/]|$)|(^|[\\/])\.codex([\\/]|$)/i;

/**
 * Subcomandos permitidos por executável. Só leitura e verificação — nada que
 * escreva no repositório, toque a rede ou instale dependência.
 */
export const SUBCOMANDOS_PERMITIDOS = new Map([
  ["git", new Set(["status", "diff", "log", "show", "branch", "rev-parse", "ls-files", "blame", "describe"])],
  ["npm", new Set(["test", "run"])],
]);

/**
 * Scripts npm liberados. `npm run` é restrito porque os package.json do projeto
 * expõem `prisma:migrate`, `validate:staging` e `bucket:provision` — rodar
 * qualquer script seria contornar a política pelo próprio repositório.
 */
export const SCRIPTS_NPM_PERMITIDOS = new Set([
  "test",
  "test:coverage",
  "lint",
  "format:check",
  "typecheck",
  "build",
]);

/** Executáveis que rodam sem subcomando. */
export const EXECUTAVEIS_SIMPLES = new Set(["prettier", "eslint", "vitest", "tsc"]);

/** Flags que redirecionam diretório/config e escapariam das checagens de caminho. */
export const FLAGS_PROIBIDAS = /^(-C|--cwd|--prefix|--config|-c|-e|--eval|--exec|--global|-g)$/i;

export const textoDoComando = (params) => {
  const bruto = params.codex_command ?? params.command ?? params.codex_parsed_cmd ?? params.parsedCmd;
  if (typeof bruto === "string") return bruto;
  if (Array.isArray(bruto)) return bruto.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  return bruto === undefined || bruto === null ? "" : JSON.stringify(bruto);
};

/** Tokens do comando. Prefere o argv já separado; só cai para split em string. */
export const tokensDoComando = (params) => {
  const bruto = params.codex_command ?? params.command ?? params.codex_parsed_cmd ?? params.parsedCmd;
  if (Array.isArray(bruto) && bruto.every((p) => typeof p === "string")) return bruto.filter(Boolean);
  if (typeof bruto === "string") return bruto.trim().split(/\s+/).filter(Boolean);
  return [];
};

export const caminhosDaMudanca = (mudancas) => {
  if (Array.isArray(mudancas)) return mudancas.map((m) => (typeof m === "string" ? m : m?.path)).filter(Boolean);
  if (mudancas && typeof mudancas === "object") return Object.keys(mudancas);
  return [];
};

/** Normaliza o executável: tira diretório, extensão do Windows e caixa. */
const nomeDoExecutavel = (token) =>
  basename(String(token))
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, "");

/**
 * Resolve links/junctions até o ancestral existente mais próximo. Sem isto
 * `dentroDaRaiz` é puramente léxico: uma junction criada DENTRO da worktree
 * apontando para fora aprovaria escrita fora dela.
 */
const caminhoReal = (absoluto) => {
  let atual = absoluto;
  const pendentes = [];
  for (;;) {
    try {
      const real = realpathSync.native(atual);
      return pendentes.length ? join(real, ...pendentes.reverse()) : real;
    } catch {
      const pai = dirname(atual);
      if (pai === atual) return absoluto;
      pendentes.push(basename(atual));
      atual = pai;
    }
  }
};

export const criarPolitica = (root) => {
  const raizReal = caminhoReal(resolve(root)).toLowerCase();

  /** Caminho real, já resolvido, ou null se não for utilizável. */
  const resolverDentro = (alvo) => {
    if (typeof alvo !== "string" || !alvo.trim()) return null;
    // 8.3 é rejeitado ANTES de resolver: `CLAUDE~1` resolveria para `.claude`
    // e passaria pela checagem de raiz, driblando `caminhoProtegido`.
    if (NOME_CURTO_8_3.test(alvo)) return null;
    const real = caminhoReal(resolve(root, alvo));
    const comparavel = real.toLowerCase();
    if (comparavel !== raizReal && !comparavel.startsWith(raizReal + sep.toLowerCase())) return null;
    return real;
  };

  const dentroDaRaiz = (alvo) => resolverDentro(alvo) !== null;

  /** Relativo à raiz REAL — é sobre esta forma que `caminhoProtegido` decide. */
  const relativoReal = (real) => real.slice(raizReal.length).replace(/^[\\/]+/, "");

  const avaliarCaminho = (alvo) => {
    const real = resolverDentro(alvo);
    if (real === null) return { ok: false, motivo: `fora da worktree ou nome curto 8.3: ${alvo}` };
    // Checa as duas formas: a informada e a real (junction pode apontar para
    // dentro da raiz mas em área protegida).
    if (caminhoProtegido.test(alvo) || caminhoProtegido.test(relativoReal(real.toLowerCase()))) {
      return { ok: false, motivo: `caminho protegido: ${alvo}` };
    }
    return { ok: true };
  };

  const decidirPatch = (params, mudancas) => {
    const caminhos = caminhosDaMudanca(mudancas);
    if (!caminhos.length) return { aprovado: false, motivo: "patch sem caminhos identificáveis" };
    for (const caminho of caminhos) {
      const r = avaliarCaminho(caminho);
      if (!r.ok) return { aprovado: false, motivo: r.motivo };
    }
    const raizPedida = params.codex_grant_root ?? params.grantRoot;
    if (raizPedida !== undefined && raizPedida !== null && !dentroDaRaiz(String(raizPedida))) {
      return { aprovado: false, motivo: "grant root fora da worktree" };
    }
    return { aprovado: true, motivo: `patch em ${caminhos.length} arquivo(s) da worktree` };
  };

  const decidirComando = (params) => {
    const tokens = tokensDoComando(params);
    if (!tokens.length) return { aprovado: false, motivo: "comando vazio" };
    // Testa o texto ORIGINAL, não os tokens re-unidos: o split por espaço em
    // branco consome `\n`, e `npm test\ncurl …` viraria um comando inofensivo.
    if (METACARACTERES.test(textoDoComando(params))) {
      return { aprovado: false, motivo: "metacaractere de shell (encadeamento possível)" };
    }

    const cwd = params.codex_cwd ?? params.cwd;
    if (cwd !== undefined && cwd !== null && !dentroDaRaiz(String(cwd))) {
      return { aprovado: false, motivo: "cwd fora da worktree" };
    }

    const exe = nomeDoExecutavel(tokens[0]);
    // Executável informado por caminho precisa estar dentro da worktree.
    if (/[\\/]/.test(tokens[0]) && !dentroDaRaiz(tokens[0])) {
      return { aprovado: false, motivo: `executável fora da worktree: ${tokens[0]}` };
    }

    const argumentos = tokens.slice(1);
    for (const argumento of argumentos) {
      if (FLAGS_PROIBIDAS.test(argumento)) {
        return { aprovado: false, motivo: `flag que redireciona diretório/execução: ${argumento}` };
      }
      // Nome protegido conta mesmo sem separador: `prettier --check .env`.
      if (caminhoProtegido.test(argumento)) {
        return { aprovado: false, motivo: `caminho protegido no argumento: ${argumento}` };
      }
      // Qualquer token com separador é tratado como caminho.
      if (/[\\/]/.test(argumento) && !argumento.startsWith("-")) {
        const r = avaliarCaminho(argumento);
        if (!r.ok) return { aprovado: false, motivo: r.motivo };
      }
      if (NOME_CURTO_8_3.test(argumento)) {
        return { aprovado: false, motivo: `nome curto 8.3 no argumento: ${argumento}` };
      }
    }

    if (EXECUTAVEIS_SIMPLES.has(exe)) {
      return { aprovado: true, motivo: `${exe} (verificação local)` };
    }

    const subcomandos = SUBCOMANDOS_PERMITIDOS.get(exe);
    if (!subcomandos) return { aprovado: false, motivo: `executável fora da allowlist: ${exe}` };

    const subcomando = argumentos.find((a) => !a.startsWith("-"));
    if (!subcomando || !subcomandos.has(subcomando)) {
      return { aprovado: false, motivo: `subcomando não permitido para ${exe}: ${subcomando ?? "(nenhum)"}` };
    }
    // Flag global antes do subcomando (`git -c … push`) é o bypass clássico.
    if (argumentos.indexOf(subcomando) !== 0) {
      return { aprovado: false, motivo: `flag antes do subcomando de ${exe}` };
    }
    if (exe === "npm" && subcomando === "run") {
      const script = argumentos[1];
      if (!script || !SCRIPTS_NPM_PERMITIDOS.has(script)) {
        return { aprovado: false, motivo: `script npm não permitido: ${script ?? "(nenhum)"}` };
      }
    }
    return { aprovado: true, motivo: `${exe} ${subcomando}` };
  };

  const decidir = (params = {}) => {
    const mudancas = params.codex_changes ?? params.fileChanges;
    if (mudancas !== undefined && mudancas !== null) return decidirPatch(params, mudancas);
    if (tokensDoComando(params).length) return decidirComando(params);
    return { aprovado: false, motivo: "sem comando nem mudanças — fail-closed" };
  };

  return { dentroDaRaiz, decidir };
};

// Esquemas reduzidos expostos ao cliente: o Codex só recebe prompt/threadId.
export const esquemaDaFerramenta = (nome) =>
  nome === "codex"
    ? {
        type: "object",
        properties: { prompt: { type: "string", description: "Tarefa delimitada para o Codex." } },
        required: ["prompt"],
        additionalProperties: false,
      }
    : {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Continuação delimitada." },
          threadId: { type: "string", description: "Thread retornada pela chamada inicial." },
        },
        required: ["prompt", "threadId"],
        additionalProperties: false,
      };

export const metodosDeAprovacao = new Set(["elicitation/create", "execCommandApproval", "applyPatchApproval"]);

/**
 * Tratador das linhas vindas do Codex. Recebe os sinks por injeção para ser
 * testável sem processo filho.
 *
 * Responder é obrigatório: silêncio trava o Codex até o timeout. Toda mensagem
 * com `id` sai daqui com resposta ou com erro JSON-RPC — nunca sem nada.
 */
export const criarTratadorDoServidor = ({
  root,
  pending,
  ferramentasPermitidas,
  sendClient,
  sendServer,
  registrar = () => {},
}) => {
  const { decidir } = criarPolitica(root);

  const responder = (message) => {
    const params = message.params ?? {};
    const ehAprovacao =
      message.method === "execCommandApproval" ||
      message.method === "applyPatchApproval" ||
      params.codex_command !== undefined ||
      params.codex_changes !== undefined;

    if (message.method === "elicitation/create" && !ehAprovacao) {
      // Elicitation genérica do MCP: recusa no formato padrão (ElicitResult).
      sendServer({ jsonrpc: "2.0", id: message.id, result: { action: "decline" } });
      registrar("elicitation genérica recusada");
      return;
    }
    if (!metodosDeAprovacao.has(message.method)) {
      sendServer({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Método iniciado pelo servidor não suportado: ${message.method}` },
      });
      registrar(`método desconhecido negado: ${message.method}`);
      return;
    }
    const { aprovado, motivo } = decidir(params);
    sendServer({ jsonrpc: "2.0", id: message.id, result: { decision: aprovado ? "approved" : "denied" } });
    registrar(`${message.method} -> ${aprovado ? "approved" : "denied"} (${motivo})`);
  };

  const tratarMensagem = (message) => {
    if (!message || typeof message !== "object") return;

    // Requisição/notificação iniciada pelo servidor: tem `method`. Precisa sair
    // antes do fluxo de resposta abaixo, senão o `pending.delete` derrubaria o
    // `tools/call` do cliente por colisão de id — os contadores são independentes.
    if (typeof message.method === "string") {
      if (message.id === undefined) sendClient(message);
      else responder(message);
      return;
    }

    // Sem `method`, sem `result` e sem `error` não é resposta válida. Encaminhar
    // ao cliente deixaria passar um pedido de aprovação disfarçado.
    if (message.id !== undefined && !("result" in message) && !("error" in message)) {
      sendServer({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32600, message: "Mensagem malformada: sem method, result ou error." },
      });
      registrar(`mensagem malformada com id ${message.id} descartada`);
      return;
    }

    const metodo = message.id !== undefined ? pending.get(message.id) : null;
    if (metodo === "tools/list" && Array.isArray(message.result?.tools)) {
      message.result.tools = message.result.tools.filter((f) => ferramentasPermitidas.has(f.name));
      for (const ferramenta of message.result.tools) {
        ferramenta.inputSchema = esquemaDaFerramenta(ferramenta.name);
      }
    }
    if (message.id !== undefined) pending.delete(message.id);
    sendClient(message);
  };

  return (linha) => {
    if (!linha.trim()) return;
    let carga;
    try {
      carga = JSON.parse(linha);
    } catch {
      // Violação de enquadramento: sem id não há a quem responder. Registrar é
      // a única ação possível — silêncio silencioso mascararia o problema.
      registrar("linha não-JSON descartada (violação de enquadramento)");
      return;
    }
    // Lote JSON-RPC: cada elemento precisa ser tratado, senão pedidos de
    // aprovação dentro do array ficariam sem resposta.
    if (Array.isArray(carga)) {
      for (const item of carga) tratarMensagem(item);
      return;
    }
    tratarMensagem(carga);
  };
};
