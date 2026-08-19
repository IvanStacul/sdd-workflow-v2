import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApplicationApi,
  createEngramRepository,
} from '../../src/index.mjs';
import {
  encodeRecord,
  physicalProject,
} from '../../src/adapters/engram/codec.mjs';
import { createId } from '../../src/domain/ids.mjs';
import { makeRecord } from '../../src/domain/record.mjs';
import { MemoryPortError } from '../../src/ports/memory.mjs';
import { FakeEngramTransport } from '../helpers/fake-engram-transport.mjs';

const CHG1 = 'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW';
const CHG2 = 'CHG-01K2Z8E7M4R6J4V9Q1T5X8N2CX';

function changeRecord({
  id = CHG1,
  projectId = 'Project--A',
  title = 'Ticket state',
  next = 'Inspect endpoint.',
  extra = {},
} = {}) {
  return makeRecord({
    projectId,
    kind: 'change',
    id,
    payload: {
      title,
      intent: 'Preserve <private>literal</private> text.',
      lifecycle: 'open',
      continuity: { next },
      ...extra,
    },
  });
}

function knowledgeRecord({
  id = createId('knowledge'),
  projectId = 'Project--A',
  statement = 'tag_ticket is the pivot',
} = {}) {
  return makeRecord({
    projectId,
    kind: 'knowledge',
    id,
    payload: { statement },
  });
}

async function expectMemoryCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert(error instanceof MemoryPortError);
    assert.equal(error.code, code);
    return true;
  });
}

test('empty Engram search null normalizes to not_found', async () => {
  const transport = new FakeEngramTransport();
  transport.emptyCollectionsAsNull = true;
  const repo = createEngramRepository({ transport });

  await expectMemoryCode(
    repo.get({
      project_id: 'Project--A',
      kind: 'change',
      id: CHG1,
    }),
    'not_found',
  );
});

test('put/get round-trip preserves literal private tags and creates one deterministic session', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const record = changeRecord();

  assert.deepEqual(await repo.put(record), record);
  assert.deepEqual(await repo.get({
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
  }), record);

  assert.equal(transport.sessions.size, 1);
  assert.equal(transport.observations.length, 1);
  assert.match(
    transport.observations[0].content,
    /\\u003cprivate>/,
  );
});

test('idempotent put of identical content does not create a revision', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const record = changeRecord();

  await repo.put(record);
  const revision = transport.observations[0].revision_count;
  await repo.put(record);

  assert.equal(transport.observations.length, 1);
  assert.equal(transport.observations[0].revision_count, revision);
});

test('sequential update uses the same logical record and fresh repository recovers it', async () => {
  const transport = new FakeEngramTransport();
  const first = createEngramRepository({ transport });
  const original = changeRecord();

  await first.put(original);

  const updated = changeRecord({
    next: 'Implement the control.',
  });
  await first.put(updated);

  assert.equal(transport.observations.length, 1);
  assert.equal(transport.observations[0].revision_count, 2);

  const fresh = createEngramRepository({ transport });
  assert.deepEqual(await fresh.get({
    project_id: updated.project_id,
    kind: updated.kind,
    id: updated.id,
  }), updated);
});

test('similar logical IDs do not break exact identity', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const first = changeRecord({ id: CHG1, title: 'First' });
  const second = changeRecord({ id: CHG2, title: 'Second' });

  await repo.put(first);
  await repo.put(second);

  assert.equal((await repo.get({
    project_id: first.project_id,
    kind: 'change',
    id: CHG1,
  })).payload.title, 'First');

  assert.equal((await repo.get({
    project_id: second.project_id,
    kind: 'change',
    id: CHG2,
  })).payload.title, 'Second');
});

test('logical project identity survives Engram normalization', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const first = changeRecord({
    projectId: 'SDD-V2--Project-A',
  });
  const second = changeRecord({
    projectId: 'sdd-v2-project-a',
  });

  await repo.put(first);
  await repo.put(second);

  assert.notEqual(
    physicalProject(first.project_id),
    physicalProject(second.project_id),
  );

  assert.deepEqual(await repo.get({
    project_id: first.project_id,
    kind: 'change',
    id: first.id,
  }), first);
  assert.deepEqual(await repo.get({
    project_id: second.project_id,
    kind: 'change',
    id: second.id,
  }), second);
});

test('duplicate exact physical rows surface ambiguous instead of selecting newest', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const record = changeRecord();
  const encoded = encodeRecord(record);

  transport.injectObservation({
    id: 1,
    session_id: 'legacy-1',
    type: encoded.type,
    title: encoded.title,
    content: encoded.content,
    project: encoded.project,
    scope: encoded.scope,
    topic_key: encoded.topic_key,
    revision_count: 1,
    duplicate_count: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  });
  transport.injectObservation({
    id: 2,
    session_id: 'legacy-2',
    type: encoded.type,
    title: encoded.title,
    content: encoded.content,
    project: encoded.project,
    scope: encoded.scope,
    topic_key: encoded.topic_key,
    revision_count: 1,
    duplicate_count: 1,
    created_at: '2026-01-02',
    updated_at: '2026-01-02',
    deleted_at: null,
  });

  await expectMemoryCode(
    repo.get({
      project_id: record.project_id,
      kind: record.kind,
      id: record.id,
    }),
    'ambiguous',
  );
});

test('physical exact topic with incompatible logical identity is ambiguous', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });
  const requested = changeRecord();
  const encoded = encodeRecord(requested);
  const incompatible = changeRecord({ id: CHG2 });

  transport.injectObservation({
    id: 1,
    session_id: 'legacy',
    type: encoded.type,
    title: encoded.title,
    content: encodeRecord(incompatible).content,
    project: encoded.project,
    scope: encoded.scope,
    topic_key: encoded.topic_key,
    revision_count: 1,
    duplicate_count: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  });

  await expectMemoryCode(
    repo.get({
      project_id: requested.project_id,
      kind: requested.kind,
      id: requested.id,
    }),
    'ambiguous',
  );
});

test('bounded list reports complete=true when project scan and requested limit are complete', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });

  await repo.put(changeRecord({ id: CHG1 }));
  await repo.put(changeRecord({ id: CHG2 }));

  const result = await repo.list({
    project_id: 'Project--A',
    kind: 'change',
    limit: 20,
  });

  assert.equal(result.complete, true);
  assert.equal(result.items.length, 2);
});

test('bounded list reports complete=false instead of silently truncating project scan', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });

  for (let index = 0; index < 21; index += 1) {
    await repo.put(knowledgeRecord({
      id: createId('knowledge', 1000 + index),
      statement: `knowledge-${index}`,
    }));
  }

  const result = await repo.list({
    project_id: 'Project--A',
    kind: 'knowledge',
    limit: 20,
  });

  assert.equal(result.items.length, 20);
  assert.equal(result.complete, false);
});

test('list cursor is explicit unsupported capability', async () => {
  const repo = createEngramRepository({
    transport: new FakeEngramTransport(),
  });

  await expectMemoryCode(
    repo.list({
      project_id: 'Project--A',
      kind: 'change',
      cursor: 'next',
    }),
    'unsupported',
  );
});

test('Memory ref, selector, and search filters reject unsupported fields', async () => {
  const repo = createEngramRepository({
    transport: new FakeEngramTransport(),
  });

  await expectMemoryCode(
    repo.get({
      project_id: 'Project--A',
      kind: 'change',
      id: CHG1,
      fuzzy: true,
    }),
    'invalid',
  );

  await expectMemoryCode(
    repo.list({
      project_id: 'Project--A',
      kind: 'change',
      lifecycle: 'open',
    }),
    'invalid',
  );

  await expectMemoryCode(
    repo.search('ticket', {
      project_id: 'Project--A',
      kind: 'knowledge',
      limit: 100,
    }),
    'invalid',
  );
});

test('knowledge search uses approximate discovery while returning canonical records', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });

  const relevant = knowledgeRecord({
    statement: 'The project uses tag_ticket as pivot',
  });
  const other = knowledgeRecord({
    id: createId('knowledge', 2000),
    statement: 'Unrelated deployment detail',
  });

  await repo.put(relevant);
  await repo.put(other);

  const result = await repo.search('tag_ticket', {
    project_id: 'Project--A',
    kind: 'knowledge',
  });

  assert.deepEqual(result.items, [relevant]);
});

test('lost POST response reconciles through exact get without phantom failure', async () => {
  const transport = new FakeEngramTransport();
  transport.failNext({
    method: 'POST',
    pathPrefix: '/observations',
    afterCommit: true,
  });

  const repo = createEngramRepository({ transport });
  const record = changeRecord();

  assert.deepEqual(await repo.put(record), record);
  assert.deepEqual(await repo.get({
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
  }), record);
});

test('lost PATCH response reconciles through exact get', async () => {
  const transport = new FakeEngramTransport();
  const repo = createEngramRepository({ transport });

  await repo.put(changeRecord());

  transport.failNext({
    method: 'PATCH',
    pathPrefix: '/observations/',
    afterCommit: true,
  });

  const updated = changeRecord({
    next: 'Recovered after lost PATCH response.',
  });

  assert.deepEqual(await repo.put(updated), updated);
});

test('transport unavailable maps to MemoryPort unavailable', async () => {
  const transport = new FakeEngramTransport();
  transport.failNext({
    method: 'GET',
    pathPrefix: '/search',
  });

  const repo = createEngramRepository({ transport });

  await expectMemoryCode(
    repo.get({
      project_id: 'Project--A',
      kind: 'change',
      id: CHG1,
    }),
    'unavailable',
  );
});

test('capability declaration matches the audited Engram 1.20.0 profile', () => {
  const repo = createEngramRepository({
    transport: new FakeEngramTransport(),
  });

  assert.deepEqual(repo.capabilities(), {
    put: true,
    exact_get: true,
    bounded_list: true,
    durable_ack: true,
    project_isolation: true,
    search: true,
    conditional_put: false,
    max_project_scan_items: 20,
    transport: 'engram-http',
  });
});

test('Application API runs over Engram repository without backend leakage', async () => {
  const transport = new FakeEngramTransport();
  const memory = createEngramRepository({ transport });
  const api = createApplicationApi({
    projectId: 'Application--Project',
    memory,
  });

  const change = await api.openChange({
    title: 'Adapter integration',
    intent: 'Exercise B1 over B2.',
    contract: {
      acceptance: [
        { id: 'A1', condition: 'record recovers exactly' },
      ],
    },
    continuity: {
      next: 'Record evidence.',
    },
  });

  const evidence = await api.recordEvidence({
    subject_id: change.id,
    method: 'test',
    result: 'pass',
    summary: 'Exact recovery confirmed.',
    covers: ['A1'],
  });

  const closed = await api.closeChange(change.id, {
    reason: 'completed',
    outcome: 'B1 runs over B2.',
    evidence_refs: [evidence.id],
  });

  assert.equal(closed.lifecycle, 'closed');
  assert.equal(closed.close.reason, 'completed');
  assert.equal(transport.observations.length, 2);
});
