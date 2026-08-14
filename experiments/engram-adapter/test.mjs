import assert from 'node:assert/strict';
import { InMemoryStore, SddMemory, decodeFromEngram, encodeForEngram } from './sdd-memory.mjs';
import { EngramHttpStore } from './engram-http-store.mjs';
import { exportChangeMarkdown } from './markdown-export.mjs';

async function contractScenario(store) {
  const memory = new SddMemory(store, 'sdd-v2-spike');

  await memory.saveChange({
    id: 'CHG-20260813-01',
    title: 'Products V2',
    status: 'open',
    intent: 'Modernizar productos sin preplanificar todo el roadmap.',
    scope: ['variantes', 'listas de precios', 'permisos', 'importación'],
    acceptance: ['mantener compatibilidad del comportamiento existente mientras se migra por slices'],
    edge_cases: ['producto sin precio para una lista'],
    risks: [{ risk: 'scope demasiado amplio', mitigation: 'materializar solo la execution frontier' }],
  });

  await memory.saveWorkUnit('CHG-20260813-01', {
    id: 'WU-01',
    objective: 'Persistir variantes de producto',
    status: 'ready',
    depends_on: [],
    done_when: 'crear y editar productos conserva variantes',
  });

  await memory.appendDecision('CHG-20260813-01', {
    id: 'D-01',
    title: 'Planificación lazy',
    decision: 'No materializar WorkUnits futuros hasta acercarse a su ejecución.',
  });

  await memory.promoteKnowledge('shell-posix', {
    title: 'Shell para scripts POSIX',
    content: 'En Windows usar WSL o Git Bash para scripts POSIX; no asumir PowerShell.',
  });

  const frontier = await memory.executionFrontier('CHG-20260813-01');
  assert.equal(frontier.length, 1);
  assert.equal(frontier[0].payload.id, 'WU-01');

  await memory.appendEvidence('WU-01', {
    type: 'targeted-test',
    summary: 'Fixture de persistencia de variantes pasó.',
  });

  // Canonical update must not create another logical Change.
  const current = (await memory.currentChange('CHG-20260813-01')).payload;
  await memory.saveChange({ ...current, acceptance: [...current.acceptance, 'export Markdown mantiene edge cases y riesgos'] });
  const changes = await store.query({ project: 'sdd-v2-spike', kind: 'change' });
  assert.equal(changes.length, 1);

  return exportChangeMarkdown(store, 'sdd-v2-spike', 'CHG-20260813-01');
}

class FakeEngramApi {
  constructor() {
    this.sessions = new Map();
    this.observations = [];
    this.nextId = 1;
  }

  async request(method, path, body) {
    if (method === 'POST' && path === '/sessions') {
      this.sessions.set(body.id, body);
      return body;
    }

    if (method === 'POST' && path === '/observations') {
      let obs = body.topic_key ? this.observations.find((item) => item.project === body.project && item.scope === body.scope && item.topic_key === body.topic_key) : null;
      if (obs) Object.assign(obs, body, { revision_count: (obs.revision_count || 1) + 1 });
      else {
        obs = { id: this.nextId++, revision_count: 1, ...body };
        this.observations.push(obs);
      }
      return structuredClone(obs);
    }

    if (method === 'GET' && path.startsWith('/observations/')) {
      const id = Number(path.split('/').at(-1));
      const obs = this.observations.find((item) => item.id === id);
      if (!obs) throw new Error('not found');
      return structuredClone(obs);
    }

    if (method === 'GET' && path.startsWith('/search?')) {
      const url = new URL(`http://fake${path}`);
      const q = url.searchParams.get('q') || '';
      const project = url.searchParams.get('project');
      return this.observations
        .filter((item) => !project || item.project === project)
        .filter((item) => `${item.title}\n${item.content}`.includes(q))
        .map((item) => ({ id: item.id, title: item.title, content: item.content }));
    }

    throw new Error(`unhandled fake route: ${method} ${path}`);
  }
}

const inMemory = new InMemoryStore();
const markdown = await contractScenario(inMemory);
assert.match(markdown, /Products V2/);
assert.match(markdown, /scope demasiado amplio/);
assert.match(markdown, /producto sin precio/);
assert.match(markdown, /Planificación lazy/);

const sample = (await inMemory.query({ kind: 'change' }))[0];
assert.deepEqual(decodeFromEngram(encodeForEngram(sample)), sample);

const fake = new FakeEngramApi();
const engram = new EngramHttpStore({
  project: 'sdd-v2-spike',
  directory: '/repo',
  sessionId: 'session-1',
  request: fake.request.bind(fake),
});
const markdownViaAdapter = await contractScenario(engram);
assert.match(markdownViaAdapter, /Project knowledge/);
assert.equal(fake.observations.filter((item) => item.topic_key?.includes('change-chg-20260813-01')).length, 1);

console.log('PASS: Memory Contract scenario works with InMemoryStore and Engram adapter simulation.');
console.log(`Observations created in fake Engram: ${fake.observations.length}`);
