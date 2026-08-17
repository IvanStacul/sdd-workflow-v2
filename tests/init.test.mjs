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
  assert.match(codex, /enabled_tools = \["mem_save", "mem_search", "mem_get_observation", "mem_current_project"\]/);
  assert.doesNotMatch(codex, /mem_session_start/);

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

function runUpdate(dir, ...extra) {
  return execFileSync(process.execPath, [cli, 'update', dir, ...extra], { encoding: 'utf8' });
}

test('update previews and applies compatible runtime changes while preserving project-owned config', () => {
  const dir = tempProject();
  runInit(dir);

  const configPath = path.join(dir, '.sdd', 'config.json');
  const manifestPath = path.join(dir, '.sdd', 'manifest.json');
  const kernelPath = path.join(dir, '.sdd', 'runtime', 'kernel.md');
  const agentsPath = path.join(dir, 'AGENTS.md');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.custom_project_setting = 'keep-me';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  const oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  oldManifest.runtime_version = '0.1.0-alpha.2';
  fs.writeFileSync(manifestPath, JSON.stringify(oldManifest, null, 2) + '\n');
  fs.writeFileSync(kernelPath, '# stale kernel\n');
  fs.appendFileSync(agentsPath, '\nProject-owned tail.\n');

  const beforeDryRunKernel = fs.readFileSync(kernelPath, 'utf8');
  const dryRun = runUpdate(dir, '--dry-run');
  assert.match(dryRun, /0\.1\.0-alpha\.2 -> 0\.1\.0-alpha\.3/);
  assert.match(dryRun, /mode: dry-run/);
  assert.equal(fs.readFileSync(kernelPath, 'utf8'), beforeDryRunKernel);

  const output = runUpdate(dir);
  assert.match(output, /Update applied/);
  assert.match(output, /config schema: 1 -> 1 \(compatible\)/);

  const updatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(updatedManifest.runtime_version, '0.1.0-alpha.3');
  assert.deepEqual(updatedManifest.managed_sections, ['AGENTS.md#sdd-v2', '.codex/config.toml#sdd-v2']);

  const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(updatedConfig.custom_project_setting, 'keep-me');

  const kernel = fs.readFileSync(kernelPath, 'utf8');
  assert.match(kernel, /Evolution feedback/);
  assert.match(kernel, /Route no decide por sí sola/);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /durability: `ephemeral \| receipt \| continuity`/);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /do not pass host absolute paths/);
  assert.match(fs.readFileSync(agentsPath, 'utf8'), /Project-owned tail\./);
});

test('update fails closed when a schema migration is required', () => {
  const dir = tempProject();
  runInit(dir);

  const manifestPath = path.join(dir, '.sdd', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.schemas.memory = 2;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  assert.throws(
    () => runUpdate(dir),
    (error) => {
      const stderr = String(error.stderr ?? '');
      assert.match(stderr, /newer than supported schema 1/);
      return true;
    },
  );

  const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(after.schemas.memory, 2);
});
