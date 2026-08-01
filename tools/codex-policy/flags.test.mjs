// Flags perigosas e lacunas apontadas por revisão adversarial.
//
// Origem de cada bloco:
//  - `--prefix=<dir>` foi RCE FORA da worktree, comprovada com o Codex real:
//    `FLAGS_PROIBIDAS` comparava o token inteiro, e `--prefix=X` é um token só;
//  - `git diff --output=<path>` escrevia arquivo arbitrário, inclusive em
//    `.git/hooks/`, porque argumento começado com `-` pulava a checagem;
//  - `node --require=`/`--import=`/`--env-file=` carregavam código externo;
//  - três guardas passaram em teste de mutação (removê-las não quebrava nada):
//    flag antes do subcomando, executável externo com nome da allowlist, e
//    ofuscação por base64 depois de `-Command`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { criarPolitica, nomeDaFlag, candidatosDeCaminho } from "./approval-policy.mjs";

if (process.platform !== "win32") {
  throw new Error("Esta suíte assume semântica de caminho do Windows; rode em win32.");
}

const RAIZ = "C:\\Users\\x\\proj";
const FORA = "C:\\Users\\Public\\alvo";
const PS = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const { decidir } = criarPolitica(RAIZ);

const aprova = (params, contexto) => {
  const r = decidir(params);
  assert.equal(r.aprovado, true, `${contexto}: esperava aprovar, negou por "${r.motivo}"`);
};
const nega = (params, contexto) => {
  const r = decidir(params);
  assert.equal(r.aprovado, false, `${contexto}: esperava negar, aprovou por "${r.motivo}"`);
};

test("nomeDaFlag separa a flag do valor", () => {
  assert.equal(nomeDaFlag("--prefix=C:\\x"), "--prefix");
  assert.equal(nomeDaFlag("--prefix"), "--prefix");
  assert.equal(nomeDaFlag("arquivo.js"), "arquivo.js");
  assert.equal(nomeDaFlag("-C=x"), "-C");
});

test("candidatosDeCaminho extrai valor de flag e alvo depois de dois-pontos", () => {
  assert.deepEqual(candidatosDeCaminho("--output=saida.txt"), ["saida.txt"]);
  assert.deepEqual(candidatosDeCaminho("HEAD:.env"), ["HEAD:.env", ".env"]);
  // Letra de unidade não é separador de revisão.
  assert.deepEqual(candidatosDeCaminho("C:\\x\\y"), ["C:\\x\\y"]);
  assert.deepEqual(candidatosDeCaminho("--flag"), []);
});

test("flag=valor é negada pelo NOME (a RCE do --prefix)", () => {
  nega({ codex_command: ["npm", "test", `--prefix=${FORA}`] }, "--prefix= fora");
  nega({ codex_command: ["npm", "test", "--prefix=."] }, "--prefix= dentro (flag proibida por si)");
  nega({ codex_command: ["npm", "test", `--cwd=${FORA}`] }, "--cwd=");
  nega({ codex_command: ["npm", "test", `--config=${FORA}\\cfg`] }, "--config=");
  nega({ codex_command: [PS, "-Command", `npm test --prefix=${FORA}`] }, "--prefix= dentro do envoltório");
});

test("flags de saída não viram escrita arbitrária", () => {
  nega({ codex_command: ["git", "diff", `--output=${FORA}\\x.txt`] }, "git diff --output= fora");
  nega({ codex_command: ["git", "diff", "--output=.git/hooks/pre-commit"] }, "--output= em .git");
  nega({ codex_command: ["git", "diff", "--output=saida.txt"] }, "--output= mesmo dentro");
  nega({ codex_command: ["git", "log", `--output=${FORA}\\y.txt`] }, "git log --output=");
  nega({ codex_command: ["eslint", `--output-file=${FORA}\\z.txt`] }, "eslint --output-file=");
  nega({ codex_command: ["vitest", `--outputFile=${FORA}\\w.txt`] }, "vitest --outputFile=");
  nega({ codex_command: ["tsc", `--outDir=${FORA}`] }, "tsc --outDir=");
  nega({ codex_command: ["prettier", `--config=${FORA}\\p.json`] }, "prettier --config=");
});

test("node não carrega módulo externo nem lê .env", () => {
  for (const flag of [
    "--require",
    "-r",
    "--import",
    "--loader",
    "--experimental-loader",
    "--env-file",
    "--input-type",
    "--conditions",
  ]) {
    nega({ codex_command: ["node", flag, `${FORA}\\evil.js`, "app.js"] }, `node ${flag} separado`);
    nega({ codex_command: ["node", `${flag}=${FORA}\\evil.js`, "app.js"] }, `node ${flag}=`);
  }
  nega({ codex_command: [PS, "-Command", `node --require=${FORA}\\evil.js app.js`] }, "via envoltório");
  // Continua permitido o uso legítimo.
  aprova({ codex_command: ["node", "--test", "tools/x.test.mjs"] }, "node --test segue permitido");
});

test("git show <rev>:<caminho> não exfiltra segredo", () => {
  nega({ codex_command: ["git", "show", "HEAD:.env"] }, "HEAD:.env");
  nega({ codex_command: ["git", "show", "HEAD:chaveiro-bot/.env"] }, "HEAD:subdir/.env");
  nega({ codex_command: ["git", "show", "main:.git/config"] }, "rev:.git");
  aprova({ codex_command: ["git", "show", "HEAD:README.md"] }, "arquivo comum segue permitido");
  // Ler a política é legítimo; o que se proíbe é ESCREVER nela (bloco acima).
  aprova({ codex_command: ["git", "show", "HEAD:tools/codex-policy/approval-policy.mjs"] }, "leitura da política");
});

test("a política protege a si mesma e aos próprios testes", () => {
  for (const caminho of [
    "tools/codex-policy/approval-policy.mjs",
    "tools/codex-policy/approval-policy.test.mjs",
    "tools/codex-policy/envoltorio.test.mjs",
    "tools/codex-policy/README.md",
    "tools\\codex-policy\\flags.test.mjs",
  ]) {
    nega({ codex_changes: { [caminho]: {} } }, `auto-modificação: ${caminho}`);
  }
  // Não bloqueia o resto de tools/.
  aprova({ codex_changes: { "tools/outro/x.js": {} } }, "outro diretório em tools");
});

// ── Mutantes que sobreviveram ao teste de mutação ──────────────────────────

test("flag global antes do subcomando é negada (guarda sem teste antes)", () => {
  nega({ codex_command: ["git", "--exec-path=" + FORA, "status"] }, "--exec-path antes do subcomando");
  nega({ codex_command: ["git", "--no-pager", "status"] }, "flag antes do subcomando");
  nega({ codex_command: ["git", "--git-dir=.git", "status"] }, "--git-dir antes do subcomando");
  aprova({ codex_command: ["git", "status", "--short"] }, "flag DEPOIS do subcomando segue ok");
});

test("executável externo com nome da allowlist é negado (guarda sem teste antes)", () => {
  nega({ codex_command: [`${FORA}\\node.exe`, "--version"] }, "node.exe plantado fora");
  nega({ codex_command: [`${FORA}\\npm.cmd`, "test"] }, "npm.cmd plantado fora");
  nega({ codex_command: ["C:\\Windows\\System32\\git.exe", "status"] }, "git fora da worktree");
  aprova({ codex_command: ["node", "--test", "x.test.mjs"] }, "node do PATH segue ok");
});

test("ofuscação base64 depois de -Command é negada (guarda sem teste antes)", () => {
  // `-enc` sozinho já cairia em "sem comando explícito"; este caso força a
  // flag a conviver com um `-Command` válido, isolando a guarda de ofuscação.
  nega({ codex_command: [PS, "-Command", "npm test", "-enc", "SQBFAFgA"] }, "-enc após -Command");
  nega({ codex_command: [PS, "-EncodedCommand", "SQBFAFgA", "-Command", "npm test"] }, "-EncodedCommand antes");
});
