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
  return execFileSync(process.execPath, [cli, 'init', dir, '--project-id', 'demo-app', ...extra], { encoding: 'utf8' });
}

function runUpdate(dir, ...extra) {
  return execFileSync(process.execPath, [cli, 'update', dir, ...extra], { encoding: 'utf8' });
}

test('init installs micro-kernel, deterministic control state and on-demand SDD skills', () => {
  const dir = tempProject();
  const output = runInit(dir);

  assert.match(output, /0\.2\.0-alpha\.1/);
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'config.json')));
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'manifest.json')));
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'state.json')));
  assert.ok(fs.existsSync(path.join(dir, '.sdd', '.gitignore')));
  assert.match(fs.readFileSync(path.join(dir, '.sdd', '.gitignore'), 'utf8'), /state\.json/);
  assert.equal(execFileSync('git', ['check-ignore', '.sdd/state.json'], { cwd: dir, encoding: 'utf8' }).trim(), '.sdd/state.json');
  assert.ok(fs.existsSync(path.join(dir, '.sdd', 'runtime', 'kernel.md')));
  assert.ok(!fs.existsSync(path.join(dir, '.sdd', 'runtime', 'memory.md')));

  for (const name of ['sdd-change', 'sdd-recovery', 'sdd-verify', 'sdd-coordinate']) {
    assert.ok(fs.existsSync(path.join(dir, '.agents', 'skills', name, 'SKILL.md')), name);
  }

  const state = JSON.parse(fs.readFileSync(path.join(dir, '.sdd', 'state.json')));
  assert.equal(state.schema_version, 1);
  assert.equal(state.project_id, 'demo-app');
  assert.deepEqual(state.changes, {});

  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.sdd', 'manifest.json')));
  assert.equal(manifest.runtime_version, '0.2.0-alpha.1');
  assert.equal(manifest.schemas.control, 1);
  assert.ok(manifest.persistent_paths.includes('.sdd/state.json'));

  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.match(agents, /\.sdd\/runtime\/kernel\.md/);
  assert.match(agents, /sdd-v2 status --json/);
  assert.match(agents, /sdd-change/);
  assert.doesNotMatch(agents, /direct \| compact \| full/);
  assert.doesNotMatch(agents, /runtime\/memory\.md/);

  const codex = fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8');
  assert.match(codex, /ENGRAM_PROJECT=demo-app/);
  assert.match(codex, /--tools=agent/);
});

test('init is idempotent and preserves user-owned content', () => {
  const dir = tempProject();
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project Rules\n\nKeep this.\n');
  fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), 'model = "example"\n');

  runInit(dir);
  const firstAgents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  const firstState = fs.readFileSync(path.join(dir, '.sdd', 'state.json'), 'utf8');
  runInit(dir);

  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), firstAgents);
  assert.equal(fs.readFileSync(path.join(dir, '.sdd', 'state.json'), 'utf8'), firstState);
  assert.match(firstAgents, /Keep this\./);
  assert.match(fs.readFileSync(path.join(dir, '.codex', 'config.toml'), 'utf8'), /model = "example"/);
  assert.equal((firstAgents.match(/<!-- sdd-v2:start -->/g) ?? []).length, 1);
});

test('update fails closed when Alpha.5 control state needs legacy IDs but Engram is unavailable', () => {
  const dir = tempProject();
  runInit(dir);

  const manifestPath = path.join(dir, '.sdd', 'manifest.json');
  const configPath = path.join(dir, '.sdd', 'config.json');
  const statePath = path.join(dir, '.sdd', 'state.json');
  const legacyMemory = path.join(dir, '.sdd', 'runtime', 'memory.md');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.runtime_version = '0.1.0-alpha.5';
  delete manifest.schemas.control;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(statePath);
  fs.writeFileSync(legacyMemory, '# legacy memory runtime\n');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.custom_project_setting = 'keep-me';
  config.evolution = { capture_signals: true };
  config.memory.container = 'sdd-engram-unavailable-for-test';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  const dryRun = runUpdate(dir, '--dry-run');
  assert.match(dryRun, /0\.1\.0-alpha\.5 -> 0\.2\.0-alpha\.1/);
  assert.match(dryRun, /control schema: 0 -> 1 \(migration-supported\)/);
  assert.ok(!fs.existsSync(statePath));

  assert.throws(
    () => runUpdate(dir),
    (error) => {
      assert.match(String(error.stderr ?? ''), /Cannot establish the legacy Change ID namespace/);
      return true;
    },
  );
  assert.ok(!fs.existsSync(statePath));
  assert.ok(fs.existsSync(legacyMemory));
  const updatedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(updatedConfig.custom_project_setting, 'keep-me');
  assert.deepEqual(updatedConfig.evolution, { capture_signals: true });
  const unchangedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(unchangedManifest.schemas.memory, 1);
  assert.equal(unchangedManifest.schemas.control, undefined);
});

test('update fails closed for newer unsupported memory schema', () => {
  const dir = tempProject();
  runInit(dir);
  const manifestPath = path.join(dir, '.sdd', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.schemas.memory = 2;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  assert.throws(
    () => runUpdate(dir),
    (error) => {
      assert.match(String(error.stderr ?? ''), /newer than supported schema 1/);
      return true;
    },
  );
});
