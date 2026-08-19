import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  initProject,
} from '../../src/project/install.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-b3-init-'));
}

test('init installs only project binding and Codex bootstrap surfaces', () => {
  const root = tempDir();

  const result = initProject(root, {
    projectId: 'demo-app',
  });

  assert.equal(result.config_created, true);
  assert.equal(result.config.project_id, 'demo-app');

  assert(fs.existsSync(path.join(root, '.sdd', 'config.json')));
  assert(fs.existsSync(path.join(root, 'AGENTS.md')));
  assert(fs.existsSync(path.join(root, '.codex', 'config.toml')));

  assert.equal(
    fs.existsSync(path.join(root, '.sdd', 'state.json')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, '.agents', 'skills')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, '.sdd', 'runtime')),
    false,
  );
});

test('init is idempotent and preserves project-owned config', () => {
  const root = tempDir();

  initProject(root, {
    projectId: 'demo-app',
  });

  const before = fs.readFileSync(
    path.join(root, '.sdd', 'config.json'),
    'utf8',
  );

  const second = initProject(root, {
    projectId: 'demo-app',
  });

  const after = fs.readFileSync(
    path.join(root, '.sdd', 'config.json'),
    'utf8',
  );

  assert.equal(second.config_created, false);
  assert.equal(before, after);
});

test('init fails closed on project identity mismatch', () => {
  const root = tempDir();

  initProject(root, {
    projectId: 'demo-app',
  });

  assert.throws(
    () => initProject(root, {
      projectId: 'other-app',
    }),
    /does not match requested/,
  );
});


test('init preflights Codex ownership conflicts before creating project config', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.codex', 'config.toml'),
    '[mcp_servers.sdd]\ncommand = "user-owned"\n',
  );

  assert.throws(
    () => initProject(root, {
      projectId: 'demo-app',
    }),
    /user-owned \[mcp_servers\.sdd\] conflicts/,
  );

  assert.equal(
    fs.existsSync(path.join(root, '.sdd', 'config.json')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(root, 'AGENTS.md')),
    false,
  );
});
