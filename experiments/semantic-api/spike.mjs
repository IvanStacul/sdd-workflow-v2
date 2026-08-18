import assert from 'node:assert/strict';

import {
  InMemoryMemoryPort,
  MemoryPortError,
  SemanticApiError,
  createSemanticApi,
  createSequenceIdFactory,
} from './semantic-api.mjs';

const IDS = [
  'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW',
  'CHG-01K2Z8E7M4R6J4V9Q1T5X8N2CX',
  'CHG-01K2Z8E7M5R6J4V9Q1T5X8N2CY',
  'CHG-01K2Z8E7M6R6J4V9Q1T5X8N2CZ',
  'CHG-01K2Z8E7M7R6J4V9Q1T5X8N2D0',
  'CHG-01K2Z8E7M8R6J4V9Q1T5X8N2D1',
  'CHG-01K2Z8E7M9R6J4V9Q1T5X8N2D2',
  'CHG-01K2Z8E7MAR6J4V9Q1T5X8N2D3',
  'CHG-01K2Z8E7MBR6J4V9Q1T5X8N2D4',
  'CHG-01K2Z8E7MCR6J4V9Q1T5X8N2D5',
];

const memory = new InMemoryMemoryPort();
const api = createSemanticApi({
  projectId: 'semantic-api-spike',
  memory,
  idFactory: createSequenceIdFactory(IDS),
});

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error });
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function openInput(overrides = {}) {
  return {
    title: 'Estado del ticket desde detalle',
    intent: 'Permitir cambiar open/closed desde detalle.',
    continuity: {
      completed: [],
      next: 'Inspeccionar el flujo actual y localizar el slice mínimo.',
      blockers: [],
    },
    ...overrides,
  };
}

function acceptanceContract() {
  return {
    acceptance: [
      { id: 'A1', condition: 'open persiste' },
      { id: 'A2', condition: 'closed persiste' },
    ],
  };
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => {
      assert(error instanceof SemanticApiError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

console.log('F6B Semantic API pure-domain spike');
console.log('');

await test('B1 ephemeral path performs zero durable writes', async () => {
  const isolatedMemory = new InMemoryMemoryPort();
  createSemanticApi({
    projectId: 'ephemeral-project',
    memory: isolatedMemory,
    idFactory: createSequenceIdFactory([IDS[0]]),
  });

  // Ephemeral means exactly: do not call a durable semantic operation.
  assert.equal(isolatedMemory.putCount, 0);
  assert.equal(isolatedMemory.rawRecords().length, 0);
});

await test('B2 openChange requires an actionable frontier', async () => {
  await expectCode(
    api.openChange(openInput({
      continuity: {
        completed: [],
        next: '   ',
        blockers: [],
      },
    })),
    'invalid_change',
  );
});

await test('B3 caller cannot supply id/lifecycle/project/kind', async () => {
  for (const forbidden of [
    ['id', IDS[9]],
    ['lifecycle', 'closed'],
    ['project_id', 'other-project'],
    ['kind', 'decision'],
  ]) {
    const [key, value] = forbidden;
    await expectCode(
      api.openChange({
        ...openInput(),
        [key]: value,
      }),
      'invalid_change',
    );
  }
});

await test('B4 openChange rejects relations in initial slice', async () => {
  await expectCode(
    api.openChange({
      ...openInput(),
      relations: {
        spawned_from: IDS[9],
      },
    }),
    'invalid_change',
  );
});

let active;
await test('B5 openChange persists one durable open Change', async () => {
  const before = memory.putCount;
  active = await api.openChange(openInput({
    contract: acceptanceContract(),
  }));

  assert.equal(memory.putCount, before + 1);
  assert.match(active.id, /^CHG-/);
  assert.equal(active.lifecycle, 'open');
  assert.equal(
    active.continuity.next,
    'Inspeccionar el flujo actual y localizar el slice mínimo.',
  );
  assert.equal('close' in active, false);
});

await test('B6 exact recovery returns current frontier', async () => {
  const recovered = await api.getChange(active.id);
  assert.deepEqual(recovered, active);
});

await test('B7 refine preserves identity and lifecycle', async () => {
  const updated = await api.updateChange(active.id, [
    {
      type: 'refine',
      title: 'Estado del ticket desde detalle — refinado',
      intent: 'Permitir alternar open/closed desde detalle sin estados nuevos.',
      contract: acceptanceContract(),
    },
  ]);

  assert.equal(updated.id, active.id);
  assert.equal(updated.lifecycle, 'open');
  assert.equal(
    updated.title,
    'Estado del ticket desde detalle — refinado',
  );
  active = updated;
});

await test('B8 refine rejects reserved/arbitrary fields', async () => {
  await expectCode(
    api.updateChange(active.id, [
      {
        type: 'refine',
        lifecycle: 'closed',
      },
    ]),
    'invalid_change',
  );
});

await test('B9 set_frontier replaces current snapshot', async () => {
  const updated = await api.updateChange(active.id, [
    {
      type: 'set_frontier',
      completed: [
        'endpoint localizado',
        'test de dominio confirmado',
      ],
      next: 'Agregar el control en detalle usando el endpoint existente.',
      blockers: [],
    },
  ]);

  assert.deepEqual(updated.continuity.completed, [
    'endpoint localizado',
    'test de dominio confirmado',
  ]);
  assert.equal(
    updated.continuity.next,
    'Agregar el control en detalle usando el endpoint existente.',
  );
  active = updated;
});

await test('B10 completed without outcome is rejected', async () => {
  await expectCode(
    api.closeChange(active.id, {
      reason: 'completed',
      outcome: '',
      evidence: {
        summary: 'Tests pasan.',
        covers: ['A1', 'A2'],
      },
    }),
    'invalid_change',
  );
});

await test('B11 completed without evidence is rejected', async () => {
  await expectCode(
    api.closeChange(active.id, {
      reason: 'completed',
      outcome: 'Estado persiste.',
    }),
    'invalid_change',
  );
});

await test('B12 partial acceptance coverage is rejected', async () => {
  await expectCode(
    api.closeChange(active.id, {
      reason: 'completed',
      outcome: 'Estado persiste.',
      evidence: {
        summary: 'Solo A1 fue comprobado.',
        covers: ['A1'],
      },
    }),
    'closure_rejected',
  );
});

await test('B13 active blocker rejects completed closure', async () => {
  active = await api.updateChange(active.id, [
    {
      type: 'set_frontier',
      completed: ['endpoint localizado'],
      next: 'Resolver incompatibilidad pendiente.',
      blockers: ['API externa todavía no responde'],
    },
  ]);

  await expectCode(
    api.closeChange(active.id, {
      reason: 'completed',
      outcome: 'Pretendido cierre.',
      evidence: {
        summary: 'Evidence insuficiente por blocker.',
        covers: ['A1', 'A2'],
      },
    }),
    'closure_rejected',
  );

  active = await api.updateChange(active.id, [
    {
      type: 'set_frontier',
      completed: [
        'endpoint localizado',
        'incompatibilidad resuelta',
      ],
      next: 'Cerrar con evidence confirmada.',
      blockers: [],
    },
  ]);
});

let completed;
await test('B14 completed closure removes continuity', async () => {
  completed = await api.closeChange(active.id, {
    reason: 'completed',
    outcome: 'open/closed puede cambiarse y persiste.',
    evidence: {
      summary: 'Tests dirigidos cubren open y closed.',
      covers: ['A1', 'A2'],
    },
  });

  assert.equal(completed.lifecycle, 'closed');
  assert.equal(completed.close.reason, 'completed');
  assert.equal('continuity' in completed, false);
});

await test('B15 set_frontier on closed Change is rejected', async () => {
  await expectCode(
    api.updateChange(completed.id, [
      {
        type: 'set_frontier',
        completed: [],
        next: 'No debe persistirse.',
        blockers: [],
      },
    ]),
    'change_closed',
  );
});

let cancelled;
await test('B16 cancelled closure has no completed outcome/evidence', async () => {
  const change = await api.openChange(openInput({
    title: 'Change a cancelar',
    intent: 'Probar cierre cancelled.',
  }));

  cancelled = await api.closeChange(change.id, {
    reason: 'cancelled',
    rationale: 'La capability dejó de ser necesaria.',
  });

  assert.equal(cancelled.lifecycle, 'closed');
  assert.deepEqual(cancelled.close, {
    reason: 'cancelled',
    rationale: 'La capability dejó de ser necesaria.',
  });
  assert.equal('continuity' in cancelled, false);
});

let receipt;
await test('B17 receipt is created directly as closed without continuity', async () => {
  const before = memory.putCount;

  receipt = await api.createReceipt({
    title: 'Validación de estado',
    intent: 'Rechazar pending.',
    contract: {
      acceptance: [
        { id: 'A1', condition: 'pending es rechazado' },
      ],
    },
    outcome: 'pending es rechazado.',
    evidence: {
      summary: 'Test dirigido confirma rechazo de pending.',
      covers: ['A1'],
    },
  });

  assert.equal(memory.putCount, before + 1);
  assert.equal(receipt.lifecycle, 'closed');
  assert.equal(receipt.close.reason, 'completed');
  assert.equal('continuity' in receipt, false);
});

await test('B18 receipt with partial acceptance coverage is rejected', async () => {
  await expectCode(
    api.createReceipt({
      title: 'Receipt incompleto',
      intent: 'Probar coverage.',
      contract: acceptanceContract(),
      outcome: 'Resultado parcial.',
      evidence: {
        summary: 'Solo A1 cubierto.',
        covers: ['A1'],
      },
    }),
    'closure_rejected',
  );
});

await test('B19 listOpenChanges filters closed and preserves completeness', async () => {
  const stillOpen = await api.openChange(openInput({
    title: 'Change todavía abierto',
    intent: 'Quedar visible en listOpenChanges.',
  }));

  const listed = await api.listOpenChanges();
  assert.equal(listed.complete, true);
  assert.deepEqual(
    listed.items.map((item) => item.id),
    [stillOpen.id],
  );
});

await test('B20 complete=false is preserved without claiming exhaustiveness', async () => {
  const partialMemory = new InMemoryMemoryPort({
    complete: false,
  });
  const partialApi = createSemanticApi({
    projectId: 'partial-project',
    memory: partialMemory,
    idFactory: createSequenceIdFactory([IDS[8]]),
  });

  await partialApi.openChange(openInput({
    title: 'Partial list Change',
    intent: 'Probar complete=false.',
  }));

  const listed = await partialApi.listOpenChanges();
  assert.equal(listed.complete, false);
});

await test('B21 memory unavailable never becomes success', async () => {
  const failingMemory = new InMemoryMemoryPort();
  const failingApi = createSemanticApi({
    projectId: 'memory-failure-project',
    memory: failingMemory,
    idFactory: createSequenceIdFactory([IDS[9]]),
  });

  failingMemory.failNext('put', 'unavailable');

  await expectCode(
    failingApi.openChange(openInput({
      title: 'No debe persistir',
      intent: 'Probar memory_unavailable.',
    })),
    'memory_unavailable',
  );

  assert.equal(failingMemory.rawRecords().length, 0);
});

await test('B22 unknown memory errors are normalized', async () => {
  const badMemory = new InMemoryMemoryPort();
  const badApi = createSemanticApi({
    projectId: 'memory-error-project',
    memory: badMemory,
    idFactory: createSequenceIdFactory([IDS[9]]),
  });

  badMemory.failNext('list', 'backend_error');

  await expectCode(
    badApi.listOpenChanges(),
    'memory_error',
  );
});

console.log('');
console.log(`RESULT: PASS (${results.length}/${results.length})`);
console.log(JSON.stringify({
  evidence: {
    ephemeral_zero_writes: true,
    frontier_required: true,
    reserved_fields_rejected: true,
    relations_deferred: true,
    exact_recovery: true,
    refine_preserves_identity: true,
    frontier_snapshot_replacement: true,
    closure_requires_outcome: true,
    closure_requires_evidence: true,
    acceptance_coverage_required: true,
    blockers_prevent_completion: true,
    closure_removes_continuity: true,
    closed_mutation_rejected: true,
    cancelled_semantics: true,
    receipt_direct_closed: true,
    list_filters_open: true,
    incomplete_list_preserved: true,
    memory_unavailable_propagates: true,
    memory_errors_normalized: true,
  },
  writes: memory.putCount,
  durable_records: memory.rawRecords().length,
}, null, 2));
