import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('always-loaded kernel is small and delegates conditional semantics to skills', () => {
  const kernel = read('runtime/kernel.md');
  assert.ok(kernel.length < 5000, `kernel too large: ${kernel.length}`);
  assert.match(kernel, /Frontier first/);
  assert.match(kernel, /Minimum sufficient change/);
  assert.match(kernel, /Evidence before completed closure/);
  assert.match(kernel, /Progressive disclosure/);
  assert.match(kernel, /sdd-change/);
  assert.match(kernel, /sdd-recovery/);
  assert.match(kernel, /sdd-verify/);
  assert.doesNotMatch(kernel, /direct.*compact.*full/i);
  assert.doesNotMatch(kernel, /WorkflowSignal/);
  assert.ok(!fs.existsSync(path.join(root, 'runtime', 'memory.md')));
});

test('conditional concepts live in dedicated protocol skills', () => {
  const change = read('skills/sdd-change/SKILL.md');
  const recovery = read('skills/sdd-recovery/SKILL.md');
  const verify = read('skills/sdd-verify/SKILL.md');
  const coordinate = read('skills/sdd-coordinate/SKILL.md');

  assert.match(change, /CHG-YYYYMMDD-NN/);
  assert.match(change, /receipt/);
  assert.match(change, /continuity/);
  assert.match(recovery, /sdd-v2 status --json/);
  assert.match(recovery, /STOP RETRIEVAL -> ACT/);
  assert.match(verify, /rejects completed closure without evidence/i);
  assert.match(coordinate, /Materialize just-in-time/i);
});

test('Codex adapter is bootstrap wiring rather than a second kernel', () => {
  const adapter = read('adapters/codex.mjs');
  assert.match(adapter, /small control plane/);
  assert.match(adapter, /host-native skill discovery/);
  assert.match(adapter, /sdd-v2 status --json/);
  assert.doesNotMatch(adapter, /direct \| compact \| full/);
  assert.doesNotMatch(adapter, /runtime\/memory\.md/);
  assert.match(adapter, /--tools=agent/);
});
