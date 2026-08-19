import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  helpText,
  runCli,
} from '../../src/cli/run.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-b3-cli-'));
}

function captureIo() {
  const lines = [];
  return {
    lines,
    io: {
      log(value = '') {
        lines.push(String(value));
      },
      error(value = '') {
        lines.push(String(value));
      },
    },
  };
}

test('CLI init requires explicit stable project id', async () => {
  const root = tempDir();
  const { io } = captureIo();

  await assert.rejects(
    runCli(['init', root], io),
    /requires --project-id/,
  );
});

test('CLI init installs binding and prints reload frontier', async () => {
  const root = tempDir();
  const { io, lines } = captureIo();

  const code = await runCli([
    'init',
    root,
    '--project-id',
    'demo-app',
  ], io);

  assert.equal(code, 0);
  assert(fs.existsSync(path.join(root, '.sdd', 'config.json')));
  assert(fs.existsSync(path.join(root, 'AGENTS.md')));
  assert(fs.existsSync(path.join(root, '.codex', 'config.toml')));

  const output = lines.join('\n');
  assert.match(output, /project_id: demo-app/);
  assert.match(output, /restart Codex/i);
});

test('CLI init rejects multiple positional targets', async () => {
  const { io } = captureIo();

  await assert.rejects(
    runCli([
      'init',
      'one',
      'two',
      '--project-id',
      'demo-app',
    ], io),
    /at most one target/,
  );
});

test('CLI help documents only implemented commands', async () => {
  const { io, lines } = captureIo();

  assert.equal(await runCli(['help'], io), 0);
  assert.equal(lines.join('\n'), helpText());

  const text = helpText();
  assert.match(text, /sdd-v2 init/);
  assert.match(text, /sdd-v2 mcp/);
  assert.doesNotMatch(text, /change open|skills|status|update/);
});
