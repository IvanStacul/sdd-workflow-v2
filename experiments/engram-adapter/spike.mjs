import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import {
  AdapterError,
  DockerEngramHttpTransport,
  EngramHttpAdapter,
  FailOnceAfterCommitTransport,
  refOf,
} from './engram-http-adapter.mjs';

const keepData = process.env.SDD_SPIKE_KEEP_DATA === '1';
const container = process.env.ENGRAM_CONTAINER || 'sdd-engram';

const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const projectA = `sdd-v2-adapter-spike-a-${runId}`.toLowerCase();
const projectB = `sdd-v2-adapter-spike-b-${runId}`.toLowerCase();

const transport = new DockerEngramHttpTransport({ container });
const adapterA = new EngramHttpAdapter({
  projectId: projectA,
  transport,
});
const adapterB = new EngramHttpAdapter({
  projectId: projectB,
  transport,
});

const created = [];
const adaptersWithSessions = new Set();

function record(projectId, id, title, intent, next) {
  return {
    schema_version: 1,
    project_id: projectId,
    kind: 'change',
    id,
    payload: {
      title,
      lifecycle: 'open',
      intent,
      continuity: {
        completed: [],
        next,
        blockers: [],
      },
    },
  };
}

async function putTracked(adapter, item) {
  const result = await adapter.put(item);
  created.push({ adapter, ref: refOf(item) });
  if (adapter.sessionCreated) {
    adaptersWithSessions.add(adapter);
  }
  return result;
}

async function main() {
  console.log(`F5 Engram adapter spike`);
  console.log(`container: ${container}`);
  console.log(`project A: ${projectA}`);
  console.log(`project B: ${projectB}`);
  console.log('');

  const health = await adapterA.health();
  console.log(`PASS A0 health: ${health.service} ${health.status}`);

  const id1 = `CHG-${ulid()}`;
  const id2 = `CHG-${ulid()}`;

  const first = record(
    projectA,
    id1,
    'Adapter exact recovery A',
    'Demostrar put/get exacto sobre Engram público.',
    'Actualizar la frontier y recuperar desde una nueva instancia.',
  );

  const put1 = await putTracked(adapterA, first);
  assert.deepEqual(stripTimes(put1.record), first);
  console.log('PASS A1 put/get round-trip');

  const recovered1 = await adapterA.get(refOf(first));
  assert.deepEqual(stripTimes(recovered1.record), first);
  console.log('PASS A1 exact get');

  const updated = structuredClone(first);
  updated.payload.continuity.completed = ['put/get inicial confirmado'];
  updated.payload.continuity.next =
    'Crear una instancia nueva del adapter y comprobar la frontier actualizada.';

  const put2 = await adapterA.put(updated);
  assert.equal(put2.record.payload.continuity.next, updated.payload.continuity.next);

  const freshAdapterA = new EngramHttpAdapter({
    projectId: projectA,
    transport: new DockerEngramHttpTransport({ container }),
  });
  const freshRecovery = await freshAdapterA.get(refOf(updated));
  assert.deepEqual(stripTimes(freshRecovery.record), updated);
  console.log('PASS A2 sequential update + fresh adapter recovery');

  const similar = record(
    projectA,
    id2,
    'Adapter exact recovery B',
    'Crear un Change deliberadamente parecido al primero.',
    'No confundir esta identidad con la primera.',
  );
  await putTracked(adapterA, similar);

  const exactAgain = await adapterA.get(refOf(updated));
  assert.equal(exactAgain.record.id, id1);
  assert.equal(
    exactAgain.record.payload.continuity.next,
    updated.payload.continuity.next,
  );
  console.log('PASS A3 similar records do not break exact identity');

  const listed = await adapterA.list({
    project_id: projectA,
    kind: 'change',
    limit: 19,
  });
  const ids = new Set(listed.items.map((item) => item.record.id));
  assert(ids.has(id1));
  assert(ids.has(id2));
  assert.equal(listed.complete, true);
  console.log(
    `PASS A5 bounded list: ${listed.items.length} item(s), complete=${listed.complete}`,
  );

  const sameIdOtherProject = record(
    projectB,
    id1,
    'Same logical id, other project',
    'Demostrar aislamiento de proyecto.',
    'No mezclar project B con project A.',
  );
  await putTracked(adapterB, sameIdOtherProject);

  const isolatedA = await adapterA.get(refOf(updated));
  const isolatedB = await adapterB.get(refOf(sameIdOtherProject));
  assert.equal(isolatedA.record.project_id, projectA);
  assert.equal(isolatedB.record.project_id, projectB);
  assert.notDeepEqual(
    isolatedA.record.payload,
    isolatedB.record.payload,
  );
  console.log('PASS A6 project isolation');

  const ambiguousId = `CHG-${ulid()}`;
  const ambiguousRecord = record(
    projectA,
    ambiguousId,
    'Lost response reconciliation',
    'Simular una respuesta perdida después de que Engram ya confirmó el POST.',
    'Confirmar el record mediante get exacto.',
  );

  const failAfterCommit = new FailOnceAfterCommitTransport(
    new DockerEngramHttpTransport({ container }),
  );
  const reconciliationAdapter = new EngramHttpAdapter({
    projectId: projectA,
    transport: failAfterCommit,
  });

  const reconciled = await reconciliationAdapter.put(ambiguousRecord);
  created.push({
    adapter: reconciliationAdapter,
    ref: refOf(ambiguousRecord),
  });
  if (reconciliationAdapter.sessionCreated) {
    adaptersWithSessions.add(reconciliationAdapter);
  }

  assert.equal(reconciled.write_reconciled, true);
  assert.deepEqual(stripTimes(reconciled.record), ambiguousRecord);
  console.log('PASS A8 lost write response reconciled by exact get');

  const missingAdapter = new EngramHttpAdapter({
    projectId: projectA,
    transport: new DockerEngramHttpTransport({
      container: `missing-${runId}`,
      timeoutMs: 2_000,
    }),
  });

  await assert.rejects(
    () => missingAdapter.health(),
    (error) => {
      assert(error instanceof AdapterError);
      assert.equal(error.code, 'unavailable');
      return true;
    },
  );
  console.log('PASS A9 missing backend -> unavailable');

  const caps = adapterA.capabilities();
  assert.equal(caps.conditional_put, false);
  assert.equal(caps.max_complete_list_items, 19);
  console.log('PASS capability declaration matches first-Alpha contract');

  console.log('');
  console.log('RESULT: PASS');
  console.log(JSON.stringify({
    capabilities: caps,
    evidence: {
      put_get: true,
      sequential_update: true,
      fresh_instance_recovery: true,
      exact_identity: true,
      bounded_list: listed.complete,
      project_isolation: true,
      ambiguous_write_recovery: true,
      unavailable_normalization: true,
    },
  }, null, 2));
}

async function cleanup() {
  if (keepData) {
    console.log('');
    console.log('SDD_SPIKE_KEEP_DATA=1 -> preserving spike records.');
    return;
  }

  console.log('');
  console.log('Cleaning spike data...');

  const unique = new Map();
  for (const entry of created) {
    unique.set(
      `${entry.ref.project_id}/${entry.ref.kind}/${entry.ref.id}`,
      entry,
    );
  }

  for (const { adapter, ref } of [...unique.values()].reverse()) {
    try {
      await adapter.deleteRecord(ref);
    } catch (error) {
      console.warn(
        `WARN cleanup observation ${ref.project_id}/${ref.id}: ${formatError(error)}`,
      );
    }
  }

  for (const adapter of adaptersWithSessions) {
    try {
      await adapter.cleanupSession();
    } catch (error) {
      console.warn(
        `WARN cleanup session ${adapter.sessionId}: ${formatError(error)}`,
      );
    }
  }
}

function stripTimes(value) {
  const cloned = structuredClone(value);
  delete cloned.created_at;
  delete cloned.updated_at;
  return cloned;
}

function formatError(error) {
  if (error instanceof AdapterError) {
    return `${error.code}: ${error.message}`;
  }
  return error?.stack || String(error);
}

function ulid(now = Date.now()) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  let time = BigInt(now);
  let timePart = '';
  for (let i = 0; i < 10; i += 1) {
    timePart = alphabet[Number(time & 31n)] + timePart;
    time >>= 5n;
  }

  const bytes = randomBytes(10);
  let random = 0n;
  for (const byte of bytes) {
    random = (random << 8n) | BigInt(byte);
  }

  let randomPart = '';
  for (let i = 0; i < 16; i += 1) {
    randomPart = alphabet[Number(random & 31n)] + randomPart;
    random >>= 5n;
  }

  return `${timePart}${randomPart}`;
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error('');
  console.error('RESULT: FAIL');
  console.error(formatError(error));
  if (error instanceof AdapterError && Object.keys(error.details).length > 0) {
    console.error(JSON.stringify(error.details, null, 2));
  }
} finally {
  await cleanup();
  process.exitCode = exitCode;
}
