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

// Deliberately use mixed case and repeated separators. Logical project identity
// must survive even though Engram normalizes its physical project names.
const projectA = `SDD-V2--Adapter-Spike-A-${runId}`;
const projectB = `sdd_V2__Adapter_Spike_B_${runId}`;

const transport = new DockerEngramHttpTransport({ container });
const adapterA = new EngramHttpAdapter({
  projectId: projectA,
  transport,
});
const adapterB = new EngramHttpAdapter({
  projectId: projectB,
  transport,
});

const cleanupEntries = [];
const knownAdapters = new Set([adapterA, adapterB]);

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
  knownAdapters.add(adapter);
  cleanupEntries.push({ adapter, ref: refOf(item) });

  try {
    return await adapter.put(item);
  } finally {
    knownAdapters.add(adapter);
  }
}

async function runScenario() {
  console.log('F5 Engram adapter spike — audited endpoint contract');
  console.log(`container: ${container}`);
  console.log(`logical project A: ${projectA}`);
  console.log(`logical project B: ${projectB}`);
  console.log('');

  const health = await adapterA.health();
  console.log(`PASS A0 health: ${health.service} ${health.status}`);

  await adapterA.probeCleanupAccess();
  console.log('PASS A0.1 protected cleanup routes accessible');

  const emptyList = await adapterA.list({
    project_id: projectA,
    kind: 'change',
    limit: 20,
  });
  assert.equal(emptyList.items.length, 0);
  assert.equal(emptyList.complete, true);
  console.log('PASS A0.2 empty observation collection normalizes to []');

  const id1 = `CHG-${ulid()}`;
  const id2 = `CHG-${ulid()}`;

  const first = record(
    projectA,
    id1,
    'Adapter exact recovery A',
    'Preservar literalmente <private>not-a-secret-test-token</private> dentro del Change.',
    'Actualizar la frontier y recuperar desde una nueva instancia.',
  );

  const put1 = await putTracked(adapterA, first);
  assert.deepEqual(stripTimes(put1.record), first);
  console.log('PASS A1 put/get round-trip incl. Engram private-tag transform boundary');

  const recovered1 = await adapterA.get(refOf(first));
  assert.deepEqual(stripTimes(recovered1.record), first);
  console.log('PASS A1 exact get');

  const updated = structuredClone(first);
  updated.payload.continuity.completed = ['put/get inicial confirmado'];
  updated.payload.continuity.next =
    'Crear una instancia nueva del adapter y comprobar la frontier actualizada.';

  const put2 = await adapterA.put(updated);
  assert.equal(
    put2.record.payload.continuity.next,
    updated.payload.continuity.next,
  );

  const freshAdapterA = new EngramHttpAdapter({
    projectId: projectA,
    transport: new DockerEngramHttpTransport({ container }),
  });
  knownAdapters.add(freshAdapterA);

  const freshRecovery = await freshAdapterA.get(refOf(updated));
  assert.deepEqual(stripTimes(freshRecovery.record), updated);
  console.log('PASS A2 sequential PATCH + fresh adapter recovery');

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

  const listedSmall = await adapterA.list({
    project_id: projectA,
    kind: 'change',
    limit: 20,
  });
  const smallIds = new Set(
    listedSmall.items.map((item) => item.record.id),
  );
  assert(smallIds.has(id1));
  assert(smallIds.has(id2));
  assert.equal(listedSmall.complete, true);
  console.log(
    `PASS A5 bounded list complete: ${listedSmall.items.length} item(s)`,
  );

  // Fill the canonical bucket beyond the declared scan bound. This proves the
  // adapter reports incompleteness instead of silently presenting a truncated
  // set as "all Changes".
  for (let i = 0; i < 19; i += 1) {
    const extra = record(
      projectA,
      `CHG-${ulid(Date.now() + i + 1)}`,
      `Bound sentinel ${i + 1}`,
      'Ejercitar bounded list.',
      'Ninguna; record de prueba.',
    );
    await putTracked(adapterA, extra);
  }

  const listedBounded = await adapterA.list({
    project_id: projectA,
    kind: 'change',
    limit: 20,
  });
  assert.equal(listedBounded.items.length, 20);
  assert.equal(listedBounded.complete, false);
  assert.equal(listedBounded.project_scan_complete, false);
  console.log(
    'PASS A5.1 list over bound reports complete=false instead of truncating silently',
  );

  const sameIdOtherProject = record(
    projectB,
    id1,
    'Same logical id, other project',
    'Demostrar aislamiento incluso con logical project IDs que Engram normalizaría.',
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
  console.log('PASS A6 logical project isolation survives Engram normalization');

  const ambiguousId = `CHG-${ulid()}`;
  const ambiguousRecord = record(
    projectA,
    ambiguousId,
    'Lost POST response reconciliation',
    'Simular respuesta perdida después de POST confirmado.',
    'Confirmar mediante get exacto.',
  );

  const failPost = new FailOnceAfterCommitTransport(
    new DockerEngramHttpTransport({ container }),
    {
      method: 'POST',
      path: '/observations',
    },
  );
  const postReconciliationAdapter = new EngramHttpAdapter({
    projectId: projectA,
    transport: failPost,
  });
  knownAdapters.add(postReconciliationAdapter);

  const reconciledPost = await putTracked(
    postReconciliationAdapter,
    ambiguousRecord,
  );
  assert.equal(reconciledPost.write_reconciled, true);
  assert.deepEqual(
    stripTimes(reconciledPost.record),
    ambiguousRecord,
  );
  console.log('PASS A8 lost POST response reconciled by exact get');

  const patchTarget = await adapterA.get(refOf(updated));
  const patchLost = structuredClone(updated);
  patchLost.payload.continuity.next =
    'Frontier confirmada después de respuesta PATCH perdida.';

  const failPatch = new FailOnceAfterCommitTransport(
    new DockerEngramHttpTransport({ container }),
    {
      method: 'PATCH',
      path: `/observations/${patchTarget.backend_ref.observation_id}`,
    },
  );
  const patchReconciliationAdapter = new EngramHttpAdapter({
    projectId: projectA,
    transport: failPatch,
  });
  knownAdapters.add(patchReconciliationAdapter);

  const reconciledPatch = await patchReconciliationAdapter.put(
    patchLost,
  );
  assert.equal(reconciledPatch.write_reconciled, true);
  assert.deepEqual(stripTimes(reconciledPatch.record), patchLost);
  console.log('PASS A8.1 lost PATCH response reconciled by exact get');

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
  assert.equal(caps.max_project_scan_items, 20);
  console.log('PASS capability declaration matches first-Alpha contract');

  return {
    capabilities: caps,
    evidence: {
      health: true,
      protected_cleanup_preflight: true,
      empty_collection_normalization: true,
      put_get: true,
      private_tag_boundary: true,
      sequential_update: true,
      fresh_instance_recovery: true,
      exact_identity: true,
      bounded_list_complete: listedSmall.complete,
      bounded_list_overflow_detected: !listedBounded.complete,
      project_isolation: true,
      ambiguous_post_recovery: true,
      ambiguous_patch_recovery: true,
      unavailable_normalization: true,
    },
  };
}

async function cleanupStrict() {
  if (keepData) {
    console.log('');
    console.log('SDD_SPIKE_KEEP_DATA=1 -> preserving spike records.');
    return { skipped: true };
  }

  console.log('');
  console.log('Cleaning spike data...');

  const failures = [];
  const unique = new Map();

  for (const entry of cleanupEntries) {
    unique.set(
      `${entry.ref.project_id}/${entry.ref.kind}/${entry.ref.id}`,
      entry,
    );
  }

  for (const { adapter, ref } of [...unique.values()].reverse()) {
    try {
      await adapter.deleteRecord(ref);
    } catch (error) {
      failures.push(
        `observation ${ref.project_id}/${ref.id}: ${formatError(error)}`,
      );
    }
  }

  for (const adapter of knownAdapters) {
    if (!adapter.sessionCreated) {
      continue;
    }

    try {
      await adapter.cleanupSession();
    } catch (error) {
      failures.push(
        `session ${adapter.sessionId}: ${formatError(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    throw new AdapterError(
      'backend_error',
      `Cleanup failed for ${failures.length} resource(s)`,
      { failures },
    );
  }

  console.log('PASS cleanup: hard-deleted observations and removed sessions');
  return { skipped: false };
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

function printFailure(error) {
  console.error('');
  console.error('RESULT: FAIL');
  console.error(formatError(error));

  if (
    error instanceof AdapterError
    && Object.keys(error.details).length > 0
  ) {
    console.error(JSON.stringify(error.details, null, 2));
  }
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

let scenarioResult = null;
let failure = null;

try {
  scenarioResult = await runScenario();
} catch (error) {
  failure = error;
}

try {
  await cleanupStrict();
} catch (error) {
  if (!failure) {
    failure = error;
  } else {
    failure.details = {
      ...(failure.details || {}),
      cleanup_failure: formatError(error),
      cleanup_details:
        error instanceof AdapterError ? error.details : undefined,
    };
  }
}

if (failure) {
  printFailure(failure);
  process.exitCode = 1;
} else {
  console.log('');
  console.log('RESULT: PASS');
  console.log(JSON.stringify(scenarioResult, null, 2));
  process.exitCode = 0;
}
