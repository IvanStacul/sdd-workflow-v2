import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('critical design invariants are projected into runtime', () => {
  const changeModel = read('docs/change-model.md');
  const memoryContract = read('docs/memory-contract.md');
  const kernel = read('runtime/kernel.md');
  const memory = read('runtime/memory.md');

  assert.match(changeModel, /CHG-YYYYMMDD-NN/);
  assert.match(memory, /CHG-YYYYMMDD-NN/);
  assert.match(memory, /nunca uses el slug como Change ID/i);

  assert.match(memoryContract, /receipt/i);
  assert.match(memoryContract, /continuity/i);
  assert.match(kernel, /receipt/);
  assert.match(kernel, /continuity/);
  assert.match(memory, /Status: closed/);
  assert.match(memory, /Status: open/);

  assert.match(memory, /## WorkUnit/);
  assert.match(memory, /Project Knowledge/);
  assert.match(memory, /WorkflowSignal/);
  assert.match(memory, /capture_prompt=false/);
  assert.match(memory, /STOP RETRIEVAL -> ACT/);
});

test('runtime keeps memory conditional and Engram value-driven', () => {
  const kernel = read('runtime/kernel.md');
  const adapter = read('adapters/codex.mjs');

  assert.match(kernel, /Cargarlo solo/);
  assert.match(adapter, /memory\.md` only when durable SDD memory or recovery is required/);
  assert.match(adapter, /Engram usage is value-driven/);
  assert.match(adapter, /--tools=agent/);
  assert.doesNotMatch(adapter, /enabled_tools\s*=/);
});
