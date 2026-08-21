/**
 * EOS V2 — sonda do Serena MCP (T-02).
 *
 * Fala JSON-RPC direto com o servidor stdio, sem abrir sessao do Claude.
 * Objetivo: provar que as ferramentas da allowlist existem e funcionam, e
 * MEDIR o volume real devolvido — o lado que faltava na comparacao com Grep.
 *
 * Este teste NAO substitui o teste de allowlist do launcher, que exige um
 * subprocesso claude real. Os dois sao reportados separadamente.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONFIG = 'C:\\Users\\n1iag\\dev\\admai-worktrees\\agent-environment\\.claude\\serena-mcp.json';
const ALLOWLIST = [
  'find_symbol', 'find_referencing_symbols', 'find_declaration',
  'find_implementations', 'get_symbols_overview', 'get_diagnostics_for_file'
];

const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
const server = cfg.mcpServers?.serena ?? Object.values(cfg.mcpServers)[0];
console.log(`servidor: ${server.command}`);
console.log(`args    : ${(server.args || []).slice(0, 4).join(' ')} ...\n`);

const child = spawn(server.command, server.args || [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ...(server.env || {}) }
});

let buf = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* linha nao-JSON do servidor */ }
  }
});

const stderrTail = [];
child.stderr.on('data', (d) => { stderrTail.push(d.toString()); if (stderrTail.length > 20) stderrTail.shift(); });

function rpc(method, params, timeoutMs = 90000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout em ${method}`)); }, timeoutMs);
    pending.set(id, (m) => { clearTimeout(t); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

const results = { positive: null, tools: null, measurements: [] };

try {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'eos-selftest', version: '1' }
  }, 120000);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map((t) => t.name);
  results.tools = names;
  console.log(`ferramentas expostas pelo servidor: ${names.length}`);

  const present = ALLOWLIST.filter((a) => names.includes(a));
  const missing = ALLOWLIST.filter((a) => !names.includes(a));
  console.log(`  da allowlist presentes: ${present.length}/${ALLOWLIST.length}`);
  if (missing.length) console.log(`  ausentes: ${missing.join(', ')}`);

  // --- TESTE POSITIVO: ferramenta da allowlist responde ---
  const probes = [
    { tool: 'find_symbol', args: { name_path: 'MODELOS_ESCOPADOS', relative_path: 'chaveiro-bot/src' }, label: 'simbolo distintivo' },
    { tool: 'find_symbol', args: { name_path: 'pode', relative_path: 'chaveiro-bot/src' }, label: 'simbolo curto/comum' }
  ];

  for (const p of probes) {
    if (!names.includes(p.tool)) { console.log(`  ${p.tool}: indisponivel, pulando`); continue; }
    try {
      const r = await rpc('tools/call', { name: p.tool, arguments: p.args }, 120000);
      const text = JSON.stringify(r.result ?? r.error ?? {});
      const bytes = Buffer.byteLength(text, 'utf8');
      const isErr = !!r.error || r.result?.isError;
      results.measurements.push({ tool: p.tool, label: p.label, bytes, error: isErr });
      console.log(`  ${p.tool} (${p.label}): ${bytes} B${isErr ? ' [erro do servidor]' : ''}`);
      if (!isErr) results.positive = true;
    } catch (e) {
      console.log(`  ${p.tool} (${p.label}): ${e.message}`);
    }
  }
} catch (e) {
  console.log(`FALHA na sonda: ${e.message}`);
  if (stderrTail.length) console.log('stderr (fim):\n' + stderrTail.join('').slice(-600));
} finally {
  child.kill();
}

console.log('\n--- RESUMO ---');
console.log(`teste positivo (ferramenta da allowlist respondeu): ${results.positive ? 'PASS' : 'FAIL / NAO CONCLUIDO'}`);
console.log(JSON.stringify(results.measurements, null, 2));
process.exit(results.positive ? 0 : 1);
