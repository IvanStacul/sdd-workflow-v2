import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApplicationApi,
  SddError,
} from '../../src/index.mjs';
import {
  buildOpenChange,
  changePayload,
} from '../../src/domain/change.mjs';
import {
  makeRecord,
} from '../../src/domain/record.mjs';
import {
  InMemoryMemory,
  createSequenceIdFactory,
} from '../helpers/in-memory-memory.mjs';

const BODIES = [
  '01K2Z8E7M3R6J4V9Q1T5X8N2CW',
  '01K2Z8E7M4R6J4V9Q1T5X8N2CX',
  '01K2Z8E7M5R6J4V9Q1T5X8N2CY',
  '01K2Z8E7M6R6J4V9Q1T5X8N2CZ',
  '01K2Z8E7M7R6J4V9Q1T5X8N2D0',
  '01K2Z8E7M8R6J4V9Q1T5X8N2D1',
  '01K2Z8E7M9R6J4V9Q1T5X8N2D2',
  '01K2Z8E7MAR6J4V9Q1T5X8N2D3',
  '01K2Z8E7MBR6J4V9Q1T5X8N2D4',
  '01K2Z8E7MCR6J4V9Q1T5X8N2D5',
];

function id(kind, index) {
  const prefix = {
    change: 'CHG',
    decision: 'DEC',
    evidence: 'EVD',
    knowledge: 'KNW',
  }[kind];
  return `${prefix}-${BODIES[index % BODIES.length]}`;
}

function sequenceFactory(overrides = {}) {
  const defaults = {
    change: BODIES.map((_, i) => id('change', i)),
    decision: BODIES.map((_, i) => id('decision', i)),
    evidence: BODIES.map((_, i) => id('evidence', i)),
    knowledge: BODIES.map((_, i) => id('knowledge', i)),
  };

  return createSequenceIdFactory({
    ...defaults,
    ...overrides,
  });
}

function fixture(options = {}) {
  const memory = options.memory ?? new InMemoryMemory();
  const idFactory = options.idFactory ?? sequenceFactory();
  const api = createApplicationApi({
    projectId: options.projectId ?? 'project-a',
    memory,
    idFactory,
    maxIdAttempts: options.maxIdAttempts ?? 5,
  });

  return { api, memory, idFactory };
}

function openInput(overrides = {}) {
  return {
    title: 'Estado del ticket',
    intent: 'Permitir alternar open/closed desde detalle.',
    continuity: {
      next: 'Inspeccionar el endpoint actual.',
    },
    ...overrides,
  };
}

function structuredEvidence(overrides = {}) {
  return {
    method: 'test',
    result: 'pass',
    summary: 'Tests dirigidos pasan.',
    ...overrides,
  };
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => {
      assert(error instanceof SddError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test('ephemeral path performs zero durable writes', async () => {
  const { memory } = fixture();
  assert.equal(memory.putCount, 0);
  assert.equal(memory.rawRecords().length, 0);
});

test('invalid open input is rejected before ID allocation', async () => {
  const { api, idFactory } = fixture();

  await expectCode(
    api.openChange(openInput({
      continuity: { next: '   ' },
    })),
    'invalid_input',
  );

  assert.equal(idFactory.calls(), 0);
});

test('caller cannot supply reserved Change fields', async () => {
  for (const [key, value] of [
    ['id', id('change', 9)],
    ['lifecycle', 'closed'],
    ['project_id', 'other'],
    ['kind', 'decision'],
    ['relations', { spawned_from: id('change', 9) }],
  ]) {
    const { api, idFactory } = fixture();
    await expectCode(
      api.openChange({
        ...openInput(),
        [key]: value,
      }),
      'invalid_input',
    );
    assert.equal(idFactory.calls(), 0);
  }
});

test('openChange persists one open Change after collision preflight', async () => {
  const { api, memory } = fixture();
  const change = await api.openChange(openInput());

  assert.equal(change.lifecycle, 'open');
  assert.equal(change.continuity.next, 'Inspeccionar el endpoint actual.');
  assert.equal(memory.putCount, 1);
  assert.equal(memory.rawRecords().length, 1);
});

test('ID collision preflight regenerates without overwriting existing record', async () => {
  const memory = new InMemoryMemory();
  const existingId = id('change', 0);
  const nextId = id('change', 1);
  const existing = buildOpenChange(
    existingId,
    openInput({ title: 'Existing' }),
  );

  memory.seed(makeRecord({
    projectId: 'project-a',
    kind: 'change',
    id: existingId,
    payload: changePayload(existing),
  }));

  const idFactory = sequenceFactory({
    change: [existingId, nextId],
  });

  const api = createApplicationApi({
    projectId: 'project-a',
    memory,
    idFactory,
    maxIdAttempts: 2,
  });

  const created = await api.openChange(
    openInput({ title: 'New' }),
  );

  assert.equal(created.id, nextId);
  assert.equal(idFactory.calls(), 2);

  const untouched = await api.getChange(existingId);
  assert.equal(untouched.title, 'Existing');
});

test('exact recovery returns current frontier', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  const recovered = await api.getChange(opened.id);
  assert.deepEqual(recovered, opened);
});

test('project binding prevents cross-project exact recovery', async () => {
  const memory = new InMemoryMemory();
  const other = buildOpenChange(id('change', 0), openInput());

  memory.seed(makeRecord({
    projectId: 'project-b',
    kind: 'change',
    id: other.id,
    payload: changePayload(other),
  }));

  const api = createApplicationApi({
    projectId: 'project-a',
    memory,
    idFactory: sequenceFactory(),
  });

  await expectCode(
    api.getChange(other.id),
    'not_found',
  );
});

test('refineChange preserves identity, lifecycle and omitted contract sections', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      scope: { in: ['detalle'] },
      acceptance: [
        { id: 'A1', condition: 'open persiste' },
      ],
      risks: ['legacy'],
    },
  }));

  const refined = await api.refineChange(opened.id, {
    title: 'Estado refinado',
    contract_patch: {
      risks: ['legacy', 'cache'],
    },
  });

  assert.equal(refined.id, opened.id);
  assert.equal(refined.lifecycle, 'open');
  assert.deepEqual(refined.contract.scope, { in: ['detalle'] });
  assert.deepEqual(refined.contract.acceptance, [
    { id: 'A1', condition: 'open persiste' },
  ]);
  assert.deepEqual(refined.contract.risks, ['legacy', 'cache']);
});

test('contract patch null removes and [] normalizes optional sections away', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      constraints: ['mantener API'],
      risks: ['legacy'],
    },
  }));

  const refined = await api.refineChange(opened.id, {
    contract_patch: {
      constraints: null,
      risks: [],
    },
  });

  assert.equal(refined.contract, undefined);
});

test('refineChange rejects arbitrary fields', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  await expectCode(
    api.refineChange(opened.id, {
      lifecycle: 'closed',
    }),
    'invalid_input',
  );
});

test('setFrontier replaces the current continuity snapshot', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  const changed = await api.setFrontier(opened.id, {
    completed: ['endpoint localizado'],
    next: 'Agregar control UI.',
    blockers: [],
  });

  assert.deepEqual(changed.continuity, {
    completed: ['endpoint localizado'],
    next: 'Agregar control UI.',
  });
});

test('setFrontier on closed Change is rejected', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());
  const cancelled = await api.closeChange(opened.id, {
    reason: 'cancelled',
  });

  assert.equal(cancelled.lifecycle, 'closed');

  await expectCode(
    api.setFrontier(cancelled.id, {
      next: 'No debe persistirse.',
    }),
    'invalid_state',
  );
});

test('spawnChange creates a child relation and does not mutate origin', async () => {
  const { api } = fixture();
  const origin = await api.openChange(openInput({
    title: 'Origin',
  }));

  const before = await api.getChange(origin.id);
  const child = await api.spawnChange(
    origin.id,
    openInput({
      title: 'Nueva intención',
      intent: 'Resolver nueva intención separada.',
    }),
  );
  const after = await api.getChange(origin.id);

  assert.equal(child.relations.spawned_from, origin.id);
  assert.notEqual(child.id, origin.id);
  assert.deepEqual(after, before);
});

test('spawnChange validates child input before allocating child ID', async () => {
  const idFactory = sequenceFactory();
  const { api } = fixture({ idFactory });
  const origin = await api.openChange(openInput());
  const callsBefore = idFactory.calls();

  await expectCode(
    api.spawnChange(origin.id, openInput({
      continuity: { next: '' },
    })),
    'invalid_input',
  );

  assert.equal(idFactory.calls(), callsBefore);
});

test('addDependency validates target and stores only depends_on', async () => {
  const { api } = fixture();
  const source = await api.openChange(openInput({
    title: 'Source',
  }));
  const target = await api.openChange(openInput({
    title: 'Target',
  }));

  const changed = await api.addDependency(
    source.id,
    target.id,
  );

  assert.deepEqual(
    changed.relations.depends_on,
    [target.id],
  );
  assert.equal('blocks' in changed.relations, false);

  await expectCode(
    api.addDependency(source.id, target.id),
    'relation_invalid',
  );

  await expectCode(
    api.addDependency(source.id, source.id),
    'relation_invalid',
  );
});

test('createReceipt is directly closed in one write and has no continuity', async () => {
  const { api, memory } = fixture();
  const before = memory.putCount;

  const receipt = await api.createReceipt({
    title: 'Validación de estado',
    intent: 'Rechazar pending.',
    contract: {
      acceptance: [
        { id: 'A1', condition: 'pending es rechazado' },
      ],
    },
    outcome: 'pending es rechazado',
    evidence: [
      structuredEvidence({ covers: ['A1'] }),
    ],
  });

  assert.equal(memory.putCount, before + 1);
  assert.equal(receipt.lifecycle, 'closed');
  assert.equal(receipt.close.reason, 'completed');
  assert.equal('continuity' in receipt, false);
});

test('createReceipt rejects evidence_refs because subject Change does not exist yet', async () => {
  const { api, idFactory } = fixture();

  await expectCode(
    api.createReceipt({
      title: 'Invalid receipt',
      intent: 'No dangling Evidence.',
      outcome: 'X',
      evidence: [structuredEvidence()],
      evidence_refs: [id('evidence', 0)],
    }),
    'invalid_input',
  );

  assert.equal(idFactory.calls(), 0);
});

test('receipt rejects missing, failed, incomplete and unknown Evidence coverage', async () => {
  const cases = [
    {
      evidence: undefined,
      code: 'invalid_input',
    },
    {
      evidence: [
        structuredEvidence({ result: 'fail', covers: ['A1', 'A2'] }),
      ],
      code: 'closure_rejected',
    },
    {
      evidence: [
        structuredEvidence({ covers: ['A1'] }),
      ],
      code: 'closure_rejected',
    },
    {
      evidence: [
        structuredEvidence({ covers: ['A1', 'A2', 'A9'] }),
      ],
      code: 'closure_rejected',
    },
  ];

  for (const item of cases) {
    const { api } = fixture();
    await expectCode(
      api.createReceipt({
        title: 'Receipt',
        intent: 'Probar evidence.',
        contract: {
          acceptance: [
            { id: 'A1', condition: 'uno' },
            { id: 'A2', condition: 'dos' },
          ],
        },
        outcome: 'Resultado',
        ...(item.evidence === undefined
          ? {}
          : { evidence: item.evidence }),
      }),
      item.code,
    );
  }
});

test('active blockers reject completed close', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    continuity: {
      next: 'Resolver blocker.',
      blockers: ['API externa caída'],
    },
  }));

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Pretendido',
      evidence: [structuredEvidence()],
    }),
    'closure_rejected',
  );
});

test('completed close requires outcome and structured Evidence', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: '',
      evidence: [structuredEvidence()],
    }),
    'invalid_input',
  );

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Hecho',
    }),
    'closure_rejected',
  );

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Hecho',
      evidence: [{ summary: 'tests pass' }],
    }),
    'invalid_input',
  );
});

test('completed close enforces exact acceptance coverage and removes continuity', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      acceptance: [
        { id: 'A1', condition: 'uno' },
        { id: 'A2', condition: 'dos' },
      ],
    },
  }));

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Parcial',
      evidence: [
        structuredEvidence({ covers: ['A1'] }),
      ],
    }),
    'closure_rejected',
  );

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Extra',
      evidence: [
        structuredEvidence({ covers: ['A1', 'A2', 'A9'] }),
      ],
    }),
    'closure_rejected',
  );

  const closed = await api.closeChange(opened.id, {
    reason: 'completed',
    outcome: 'Completo',
    evidence: [
      structuredEvidence({ covers: ['A1', 'A2'] }),
    ],
  });

  assert.equal(closed.lifecycle, 'closed');
  assert.equal('continuity' in closed, false);
});

test('recordEvidence accepts partial known coverage and close can use its ref', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      acceptance: [
        { id: 'A1', condition: 'uno' },
      ],
    },
  }));

  const evidence = await api.recordEvidence({
    subject_id: opened.id,
    method: 'test',
    result: 'pass',
    summary: 'A1 pasa.',
    covers: ['A1'],
  });

  const closed = await api.closeChange(opened.id, {
    reason: 'completed',
    outcome: 'Completo',
    evidence_refs: [evidence.id],
  });

  assert.deepEqual(
    closed.close.evidence_refs,
    [evidence.id],
  );
  assert.equal(closed.close.evidence, undefined);
});

test('recordEvidence rejects unknown coverage for current Change', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      acceptance: [
        { id: 'A1', condition: 'uno' },
      ],
    },
  }));

  await expectCode(
    api.recordEvidence({
      subject_id: opened.id,
      method: 'test',
      result: 'pass',
      summary: 'Wrong coverage.',
      covers: ['A9'],
    }),
    'invalid_input',
  );
});

test('Evidence ref must belong to the Change being closed', async () => {
  const { api } = fixture();
  const first = await api.openChange(openInput({
    title: 'First',
  }));
  const second = await api.openChange(openInput({
    title: 'Second',
  }));

  const evidence = await api.recordEvidence({
    subject_id: first.id,
    method: 'inspection',
    result: 'observed',
    summary: 'Observed first Change.',
  });

  await expectCode(
    api.closeChange(second.id, {
      reason: 'completed',
      outcome: 'Wrong relation',
      evidence_refs: [evidence.id],
    }),
    'relation_invalid',
  );
});

test('Evidence with result=fail can be recorded but cannot close Change', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  const evidence = await api.recordEvidence({
    subject_id: opened.id,
    method: 'test',
    result: 'fail',
    summary: 'Test falla.',
  });

  await expectCode(
    api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'No debe cerrar',
      evidence_refs: [evidence.id],
    }),
    'closure_rejected',
  );
});

test('observed Evidence can support completion for an observational method', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput({
    contract: {
      acceptance: [
        { id: 'A1', condition: 'La vista muestra el estado correcto' },
      ],
    },
  }));

  const closed = await api.closeChange(opened.id, {
    reason: 'completed',
    outcome: 'La vista muestra el estado correcto.',
    evidence: [{
      method: 'inspection',
      result: 'observed',
      summary: 'Readback de la vista confirma el estado.',
      covers: ['A1'],
    }],
  });

  assert.equal(closed.lifecycle, 'closed');
});

test('cancelled close removes continuity without inventing completion evidence', async () => {
  const { api } = fixture();
  const opened = await api.openChange(openInput());

  const cancelled = await api.closeChange(opened.id, {
    reason: 'cancelled',
    rationale: 'Ya no se necesita.',
  });

  assert.deepEqual(cancelled.close, {
    reason: 'cancelled',
    rationale: 'Ya no se necesita.',
  });
  assert.equal('continuity' in cancelled, false);
});

test('listOpenChanges excludes closed Changes', async () => {
  const { api } = fixture();
  const first = await api.openChange(openInput({
    title: 'Closed',
  }));
  const second = await api.openChange(openInput({
    title: 'Open',
  }));

  await api.closeChange(first.id, {
    reason: 'cancelled',
  });

  const result = await api.listOpenChanges();
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.items.map((item) => item.id),
    [second.id],
  );
});

test('listOpenChanges preserves complete=false', async () => {
  const memory = new InMemoryMemory({ complete: false });
  const { api } = fixture({ memory });

  await api.openChange(openInput());
  const result = await api.listOpenChanges();

  assert.equal(result.complete, false);
  assert.equal(result.next_cursor, 'in-memory-next');
});

test('memory unavailable never becomes success', async () => {
  const memory = new InMemoryMemory();
  const { api } = fixture({ memory });

  memory.failNext('put', 'unavailable');

  await expectCode(
    api.openChange(openInput()),
    'memory_unavailable',
  );

  assert.equal(memory.rawRecords().length, 0);
});

test('unknown Memory backend errors normalize to memory_error', async () => {
  const memory = new InMemoryMemory();
  const { api } = fixture({ memory });

  memory.failNext('list', 'backend_error');

  await expectCode(
    api.listOpenChanges(),
    'memory_error',
  );
});

test('corrupt persisted Change is reported as memory_error, not caller invalid_input', async () => {
  const memory = new InMemoryMemory();
  const corruptId = id('change', 0);

  memory.seed({
    schema_version: 1,
    project_id: 'project-a',
    kind: 'change',
    id: corruptId,
    payload: {
      title: 'Corrupt',
      intent: 'Missing continuity.',
      lifecycle: 'open',
    },
  });

  const { api } = fixture({ memory });

  await expectCode(
    api.getChange(corruptId),
    'memory_error',
  );
});

test('persisted payload with unknown physical/arbitrary field is memory_error', async () => {
  const memory = new InMemoryMemory();
  const corruptId = id('change', 0);

  memory.seed({
    schema_version: 1,
    project_id: 'project-a',
    kind: 'change',
    id: corruptId,
    payload: {
      title: 'Corrupt',
      intent: 'No physical leakage.',
      lifecycle: 'open',
      continuity: { next: 'Actuar.' },
      topic_key: 'physical-backend-field',
    },
  });

  const { api } = fixture({ memory });

  await expectCode(
    api.getChange(corruptId),
    'memory_error',
  );
});

test('Decision is created as an independent immutable record', async () => {
  const { api } = fixture();
  const change = await api.openChange(openInput());

  const first = await api.recordDecision({
    subject_id: change.id,
    statement: 'Usar MCP.',
    rationale: 'Tool transport estructurado.',
  });

  const second = await api.recordDecision({
    subject_id: change.id,
    statement: 'Mantener MCP.',
    rationale: 'Sigue siendo válido.',
    supersedes: first.id,
  });

  assert.notEqual(first.id, second.id);
  assert.equal(second.supersedes, first.id);
  assert.equal(api.updateDecision, undefined);

  const recovered = await api.getDecision(first.id);
  assert.deepEqual(recovered, first);
});

test('Decision semantic references are validated before ID allocation', async () => {
  const idFactory = sequenceFactory();
  const { api } = fixture({ idFactory });
  const callsBefore = idFactory.calls();

  await expectCode(
    api.recordDecision({
      subject_id: id('change', 9),
      statement: 'No existe.',
      rationale: 'Debe fallar.',
    }),
    'not_found',
  );

  assert.equal(idFactory.calls(), callsBefore);
});

test('Evidence is immutable through the Application API', async () => {
  const { api } = fixture();
  const change = await api.openChange(openInput());

  const evidence = await api.recordEvidence({
    subject_id: change.id,
    method: 'inspection',
    result: 'observed',
    summary: 'Vista inspeccionada.',
  });

  assert.equal(api.updateEvidence, undefined);
  assert.deepEqual(
    await api.getEvidence(evidence.id),
    evidence,
  );
});

test('Knowledge promotion and approximate search remain separate from exact recovery', async () => {
  const { api } = fixture();

  const knowledge = await api.promoteKnowledge({
    statement: 'El proyecto usa tag_ticket como pivot.',
  });

  const result = await api.searchKnowledge('tag_ticket');
  assert.deepEqual(
    result.items.map((item) => item.id),
    [knowledge.id],
  );
});

test('Knowledge search surfaces unsupported capability without side index', async () => {
  const memory = new InMemoryMemory({
    searchSupported: false,
  });
  const { api } = fixture({ memory });

  await expectCode(
    api.searchKnowledge('anything'),
    'memory_unsupported',
  );
});

test('Application API exposes no arbitrary record mutation primitive', async () => {
  const { api } = fixture();

  assert.equal(api.putRecord, undefined);
  assert.equal(api.patchRecord, undefined);
  assert.equal(api.setLifecycle, undefined);
  assert.equal(api.updateChange, undefined);
});

test('listOpenChanges rejects limits outside the first-Alpha public bound before Memory', async () => {
  const { api, memory } = fixture();
  const listCallsBefore = memory.listCount;

  await expectCode(
    api.listOpenChanges({ limit: 100 }),
    'invalid_input',
  );

  assert.equal(memory.listCount, listCallsBefore);
});
