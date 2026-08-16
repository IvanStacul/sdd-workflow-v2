import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli', 'sdd.mjs');

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-v2-init-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

function runInit(dir, ...extra) {
  return execFileSync(process.execPath, [cli, 'init', dir, '--project-id', 'demo-app', ...extra], {
    encoding: 'utf8',
  });
}

test('init installs minimal SDD runtime and Codex adapter', () => {
  const dir = tempProject();
  const output = runInit(dir);

  assert.match(output, /SDD V2 initialized/);
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'config.json')));
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'runtime', 'kernel.md')));
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')));
  assert.ok(fs.existsSync(path.join(dir, '.codex', 'config.toml')));

  const config = JSON.parse(fs.readFileSync(path.join(dir, '.sdd', 'config.json')));
  assert.equal(config.project_id, 'demo-app');
  assert.equal(config.adapter, 'codex');

  const codex = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  assert.match(codex, /\[mcp_servers\.engram\]/);
  assert.match(codex, /ENGRAM_PROJECT=demo-app/);
  assert.match(codex, /sdd-engram/);

  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /<!-- sdd-v2:start -->/);
  assert.match(agents, /\.sdd\/runtime\/kernel\.md/);
});

test('init is idempotent and preserves user content', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project Rules\n\nKeep this.\n');
  fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "example"\n');

  runInit(dir);
  const firstAgents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  const firstCodex = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  runInit(dir);
  const secondAgents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  const secondCodex = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');

  assert.equal(firstAgents, secondAgents);
  assert.equal(firstCodex, secondCodex);
  assert.match(secondAgents, /Keep this\./);
  assert.match(secondCodex, /model = "example"/);
  assert.equal((secondAgents.match(/<!-- sdd-v2:start -->/g) ?? []).length, 1);
  assert.equal((secondCodex.match(/# sdd-v2:start/g) ?? []).length, 1);
});

test('init preserves user-owned Engram MCP config', () => {
  const dir = tempProject();
  fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
  const userConfig = '[mcp_servers.engram]\ncommand = "custom-engram"\n';
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), userConfig);

  const output = runInit(dir);
  assert.match(output, /user-owned/);
  assert.equal(fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8'), userConfig);
});
