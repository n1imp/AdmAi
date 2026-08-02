import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const agents = read("AGENTS.md");
const claude = read("CLAUDE.md");
const ledger = read("docs/agent-environment/AGENT_DECISIONS.md");
const readme = read("README.md");
const instructions = `${agents}\n${claude}\n${readme}`;

test("Claude e README carregam a governanca sem orquestracao conflitante", () => {
  assert.match(claude, /^@AGENTS\.md$/m);
  assert.match(claude, /unico writer/);
  assert.match(readme, /Claude [ée] o [uú]nico writer/);
  assert.match(readme, /Codex delegado atua somente como Decisor,\s*\n?>? ?[ÁA]rbitro ou Revisor em leitura/);
  assert.doesNotMatch(instructions, /^# Ruflo|^## Swarm|@claude-flow|multiplos writers autorizados|Codex atua como executor\/revisor/im);
  assert.doesNotMatch(readme, /@claude-flow|Teto de paralelismo|Autorizado sem confirma[cç][aã]o|Codex atua como executor\/revisor/i);
});

test("os tres modos delegados sao explicitos e somente leitura", () => {
  for (const mode of ["DECISOR", "REVISOR", "ARBITRO"]) {
    assert.match(agents, new RegExp(`MODO_CODEX: ${mode}`));
  }
  assert.match(agents, /MODO_OBRIGATORIO/);
  assert.match(agents, /nao edita arquivos, nao executa mutacoes, nao cria commits/);
  assert.match(agents, /pedido direto do usuario ao Codex segue normalmente/);
});

test("o protocolo de decisao possui todos os campos fixos", () => {
  for (const field of [
    "DECISAO_ID:",
    "MISSAO_AUTORIZADA:",
    "PERGUNTA_TECNICA:",
    "EVIDENCIAS:",
    "ARQUIVOS_E_LINHAS:",
    "OPCOES:",
    "POSICAO_CLAUDE:",
    "LIMITES_DE_ESCOPO:",
    "RESULTADO: CONCORDO | DISCORDO | EVIDENCIA_INSUFICIENTE | USUARIO_NECESSARIO",
    "RESTRICOES_DE_IMPLEMENTACAO:",
    "TESTES_OBRIGATORIOS:",
    "ESCOPO_CONFIRMADO:",
    "CONFIANCA: ALTA | MEDIA | BAIXA",
  ]) {
    assert.ok(agents.includes(field), `campo ausente: ${field}`);
  }
});

test("arbitragem e revisao exigem conversas novas e impedem autoaprovacao", () => {
  assert.match(agents, /novo `codex`, nunca `codex-reply`, em modo `ARBITRO`/);
  assert.match(agents, /revisao usa uma conversa Codex nova/);
  assert.match(agents, /nao aprova o proprio trabalho/);
  assert.match(agents, /Nao existe aprovacao condicional/);
  assert.match(agents, /Teste obrigatorio nao executado mantem `CORRECOES_NECESSARIAS`/);
});

test("autoridade humana e seguranca nao podem ser delegadas", () => {
  assert.match(agents, /Reduzir protecao ou aceitar risco exige decisao do usuario/);
  assert.match(agents, /usuario decide regras de negocio, custos, duracao de trial, mudanca de escopo/);
  assert.match(agents, /merge, push, deploy e acoes externas/);
  assert.match(agents, /nunca decide que uma nova missao esta autorizada/);
});

test("controles operacionais e de aplicacao permanecem obrigatorios", () => {
  for (const requirement of [
    "docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md",
    ".ai/PROJECT_CONTEXT.md",
    ".ai/coordination.yaml",
    "raiz, branch, commit-base, worktree, status, locks, writer e gates",
    "worktree dedicada e exatamente um writer",
    "PostgreSQL e migrations; o runtime usa Redis",
    ".github/workflows/ci.yml",
    "Dados multi-tenant usam `req.db`",
    "nao use Prisma global em queries tenant",
    "`requireAuth` e `requirePermissao`",
    "preserve self-scope e contratos de 2FA/OAuth",
  ]) {
    assert.ok(agents.includes(requirement), `controle ausente: ${requirement}`);
  }
  assert.match(agents, /Nao instale dependencias nem execute integracao, Docker, migrations, staging, deploy ou auditoria online/);
  assert.match(agents, /Se Codex estiver indisponivel, uma decisao material fica bloqueada/);
  assert.match(agents, /\| Desenvolvimento \| `npm run dev` \| `npm run dev` \|/);
  assert.match(agents, /`git diff --check` limpo/);
  assert.match(agents, /Atualize o plano ou contrato ativo com handoff, review, gates e limitacoes reais/);
  for (const path of [
    ".claude/start-baseline.ps1",
    ".github/workflows/ci.yml",
    "docs/DEPLOYMENT.md",
    "docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md",
  ]) {
    assert.ok(existsSync(resolve(root, path)), `referencia obrigatoria ausente: ${path}`);
  }
  assert.match(claude, /docs\/agent-environment\/EOS_SECURITY_CLOSURE_V2_PLAN\.md/);
  assert.match(agents, /EXECUTION_STATE\.md` somente quando existirem/);
  assert.match(claude, /Inicie somente pelo launcher local `\.claude\/start-baseline\.ps1`/);
});

test("o ledger fallback contem o schema minimo", () => {
  for (const field of [
    "DECISAO_ID",
    "MISSAO",
    "EVIDENCIAS",
    "POSICAO_CLAUDE",
    "POSICAO_CODEX",
    "DECISAO_FINAL",
    "THREAD",
    "IMPACTO",
    "TESTES",
  ]) {
    assert.ok(ledger.includes(`\`${field}\``), `campo ausente no ledger: ${field}`);
  }
});
