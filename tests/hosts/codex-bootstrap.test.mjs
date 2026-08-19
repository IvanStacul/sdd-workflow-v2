import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  installCodexBootstrap,
  renderCodexMcpConfig,
} from '../../src/hosts/codex/bootstrap.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-b3-codex-'));
}

const KERNEL = '## SDD V2\n\n- Keep trivial work ephemeral.\n';

test('Codex bootstrap preserves user content and injects managed SDD blocks', () => {
  const root = tempDir();

  const userAgents = '# Project rules\n\n\nKeep this.  \n';
  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    userAgents,
  );
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  const userCodex = 'model = "gpt-5.6-sol"\n\n\n';
  fs.writeFileSync(
    path.join(root, '.codex', 'config.toml'),
    userCodex,
  );

  installCodexBootstrap(root, KERNEL);

  const agents = fs.readFileSync(
    path.join(root, 'AGENTS.md'),
    'utf8',
  );
  const codex = fs.readFileSync(
    path.join(root, '.codex', 'config.toml'),
    'utf8',
  );

  assert.equal(agents.slice(0, userAgents.length), userAgents);
  assert.equal(codex.slice(0, userCodex.length), userCodex);
  assert.match(agents, /Keep this\./);
  assert.match(agents, /<!-- sdd-v2:start -->/);
  assert.match(agents, /Keep trivial work ephemeral/);

  assert.match(codex, /model = "gpt-5\.6-sol"/);
  assert.match(codex, /\[mcp_servers\.sdd\]/);
  assert.match(codex, /command = "sdd-v2"/);
  assert.match(codex, /args = \["mcp"\]/);
  assert.match(codex, /required = true/);
  assert.match(codex, /env_vars = \["ENGRAM_HTTP_TOKEN", "SDD_ENGRAM_CONTAINER"\]/);
});

test('Codex bootstrap is idempotent', () => {
  const root = tempDir();

  const first = installCodexBootstrap(root, KERNEL);
  const agents1 = fs.readFileSync(first.agents_path, 'utf8');
  const codex1 = fs.readFileSync(first.codex_config_path, 'utf8');

  const second = installCodexBootstrap(root, KERNEL);
  const agents2 = fs.readFileSync(second.agents_path, 'utf8');
  const codex2 = fs.readFileSync(second.codex_config_path, 'utf8');

  assert.equal(agents1, agents2);
  assert.equal(codex1, codex2);
  assert.equal(second.agents_changed, false);
  assert.equal(second.codex_changed, false);
});

test('Codex bootstrap rejects a user-owned conflicting sdd MCP table', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.codex', 'config.toml'),
    '[mcp_servers.sdd]\ncommand = "custom"\n',
  );

  assert.throws(
    () => installCodexBootstrap(root, KERNEL),
    /user-owned \[mcp_servers\.sdd\] conflicts/,
  );
});

test('rendered Codex config contains no Engram tool exposure', () => {
  const text = renderCodexMcpConfig();

  assert.doesNotMatch(text, /mem_save|mem_search|engram mcp/);
  assert.match(text, /mcp_servers\.sdd/);
});
