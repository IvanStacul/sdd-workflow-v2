import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { EngramHttpStore } from './engram-http-store.mjs';
import { SddMemory } from './sdd-memory.mjs';
import { exportChangeMarkdown } from './markdown-export.mjs';

const suffix = Date.now();
const project = process.env.SDD_ENGRAM_PROJECT || `sdd-v2-smoke-${suffix}`;
const baseUrl = process.env.ENGRAM_URL || 'http://127.0.0.1:7437';
const token = process.env.ENGRAM_HTTP_TOKEN || null;
const changeId = `CHG-SMOKE-${suffix}`;

const store = new EngramHttpStore({ project, baseUrl, token, sessionId: `sdd-smoke-${suffix}` });
const memory = new SddMemory(store, project);

await memory.saveChange({
  id: changeId,
  title: 'Engram real smoke',
  status: 'open',
  intent: 'Validar persistencia SDD V2 sobre Engram real.',
  scope: ['adapter'],
  acceptance: ['put hace upsert', 'query recupera WorkUnit por subject', 'Markdown se deriva desde memoria'],
});

await memory.saveWorkUnit(changeId, {
  id: 'WU-01',
  objective: 'Validar round-trip real',
  status: 'ready',
  depends_on: [],
  done_when: 'el registro puede recuperarse desde Engram',
});

await memory.appendDecision(changeId, {
  id: 'D-01',
  title: 'Backend boundary',
  decision: 'Engram almacena; SDD conserva semántica propia.',
});

const first = await memory.currentChange(changeId);
assert.equal(first.payload.id, changeId);

await memory.saveChange({ ...first.payload, status: 'closed' });
const second = await memory.currentChange(changeId);
assert.equal(second.payload.status, 'closed');

const changes = await store.query({ project, kind: 'change' });
assert.equal(changes.filter((record) => record.payload.id === changeId).length, 1, 'topic_key HTTP upsert did not preserve one logical Change');

const workunits = await store.query({ project, kind: 'workunit', subject: changeId });
assert.equal(workunits.length, 1);
assert.equal(workunits[0].payload.id, 'WU-01');

const markdown = await exportChangeMarkdown(store, project, changeId);
await writeFile(new URL('./output/real-smoke.md', import.meta.url), markdown);

console.log(`PASS real Engram smoke: ${project}`);
console.log(`Change: ${changeId}`);
console.log('Validated: topic_key upsert, exact-marker recovery, subject query, Markdown projection.');
