import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRefinement,
  buildOpenChange,
  buildReceipt,
  changeFromPayload,
  closeCompleted,
  normalizeChange,
  normalizeContract,
} from '../../src/domain/change.mjs';
import {
  assertExactCoverage,
  normalizeEvidence,
} from '../../src/domain/evidence.mjs';
import {
  buildDecision,
} from '../../src/domain/decision.mjs';
import {
  buildKnowledge,
} from '../../src/domain/knowledge.mjs';
import {
  makeRecord,
  validateRecord,
} from '../../src/domain/record.mjs';
import { SddError } from '../../src/domain/errors.mjs';

const CHG1 = 'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW';
const CHG2 = 'CHG-01K2Z8E7M4R6J4V9Q1T5X8N2CX';
const DEC1 = 'DEC-01K2Z8E7M5R6J4V9Q1T5X8N2CY';
const KNW1 = 'KNW-01K2Z8E7M6R6J4V9Q1T5X8N2CZ';

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

function evidence(overrides = {}) {
  return {
    method: 'test',
    result: 'pass',
    summary: 'Tests dirigidos pasan.',
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert(error instanceof SddError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

test('contract validates rich adaptive sections strictly', () => {
  const contract = normalizeContract({
    scope: {
      in: ['detalle'],
      out: ['nuevos estados'],
    },
    acceptance: [
      { id: 'A1', condition: 'open persiste' },
      { id: 'A2', condition: 'closed persiste' },
    ],
    constraints: ['preservar API'],
    risks: ['cliente legacy'],
    edge_cases: ['mismo estado'],
    open_questions: ['autorización existente'],
    rollback: {
      strategy: 'revert',
      note: 'revertir control UI',
    },
  });

  assert.deepEqual(contract.risks, ['cliente legacy']);
  assert.deepEqual(contract.open_questions, ['autorización existente']);
  assert.deepEqual(contract.rollback, {
    strategy: 'revert',
    note: 'revertir control UI',
  });
});

test('contract rejects schema holes in risks and rollback', () => {
  expectCode(
    () => normalizeContract({ risks: { arbitrary: true } }),
    'invalid_input',
  );

  expectCode(
    () => normalizeContract({
      rollback: {
        strategy: 'revert',
      },
    }),
    'invalid_input',
  );

  expectCode(
    () => normalizeContract({
      rollback: {
        strategy: 'teleport',
        note: 'no',
      },
    }),
    'invalid_input',
  );
});

test('empty optional contract arrays normalize away', () => {
  const contract = normalizeContract({
    constraints: [],
    risks: [],
    edge_cases: [],
    open_questions: [],
  });
  assert.equal(contract, undefined);
});

test('open Change requires actionable continuity', () => {
  expectCode(
    () => buildOpenChange(CHG1, openInput({
      continuity: { next: '   ' },
    })),
    'invalid_input',
  );
});

test('refinement patch preserves omitted contract sections', () => {
  const change = buildOpenChange(CHG1, openInput({
    contract: {
      scope: { in: ['detalle'] },
      acceptance: [
        { id: 'A1', condition: 'open persiste' },
      ],
      risks: ['legacy'],
    },
  }));

  const refined = applyRefinement(change, {
    contract_patch: {
      risks: ['legacy', 'cache'],
    },
  });

  assert.deepEqual(refined.contract.scope, { in: ['detalle'] });
  assert.deepEqual(refined.contract.acceptance, [
    { id: 'A1', condition: 'open persiste' },
  ]);
  assert.deepEqual(refined.contract.risks, ['legacy', 'cache']);
});

test('refinement null removes and empty array normalizes away', () => {
  const change = buildOpenChange(CHG1, openInput({
    contract: {
      constraints: ['mantener API'],
      risks: ['legacy'],
    },
  }));

  const refined = applyRefinement(change, {
    contract_patch: {
      constraints: null,
      risks: [],
    },
  });

  assert.equal(refined.contract, undefined);
});

test('refinement cannot mutate reserved fields', () => {
  const change = buildOpenChange(CHG1, openInput());

  expectCode(
    () => applyRefinement(change, {
      lifecycle: 'closed',
    }),
    'invalid_input',
  );
});

test('Evidence requires structured method/result/summary', () => {
  expectCode(
    () => normalizeEvidence({ summary: 'tests pass' }),
    'invalid_input',
  );

  assert.deepEqual(
    normalizeEvidence(evidence()),
    {
      method: 'test',
      result: 'pass',
      summary: 'Tests dirigidos pasan.',
    },
  );
});

test('exact coverage rejects missing and unknown acceptance ids', () => {
  expectCode(
    () => assertExactCoverage(
      [evidence({ covers: ['A1'] })],
      ['A1', 'A2'],
    ),
    'closure_rejected',
  );

  expectCode(
    () => assertExactCoverage(
      [evidence({ covers: ['A1', 'A9'] })],
      ['A1'],
    ),
    'closure_rejected',
  );
});

test('receipt is directly closed and requires passing structured Evidence', () => {
  const receipt = buildReceipt(CHG1, {
    title: 'Validación',
    intent: 'Rechazar pending.',
    contract: {
      acceptance: [
        { id: 'A1', condition: 'pending es rechazado' },
      ],
    },
    outcome: 'pending es rechazado',
    evidence: [
      evidence({ covers: ['A1'] }),
    ],
  });

  assert.equal(receipt.lifecycle, 'closed');
  assert.equal(receipt.close.reason, 'completed');
  assert.equal('continuity' in receipt, false);

  expectCode(
    () => buildReceipt(CHG2, {
      title: 'Falló',
      intent: 'No debe cerrar.',
      outcome: 'pretendido',
      evidence: [
        evidence({ result: 'fail' }),
      ],
    }),
    'closure_rejected',
  );
});

test('completed close removes continuity', () => {
  const open = buildOpenChange(CHG1, openInput({
    contract: {
      acceptance: [
        { id: 'A1', condition: 'open persiste' },
      ],
    },
  }));

  const closed = closeCompleted(open, {
    reason: 'completed',
    outcome: 'Estado persiste.',
    evidence: [
      evidence({ covers: ['A1'] }),
    ],
  });

  assert.equal(closed.lifecycle, 'closed');
  assert.equal('continuity' in closed, false);
});

test('persisted closed Change cannot carry continuity', () => {
  expectCode(
    () => normalizeChange({
      id: CHG1,
      title: 'X',
      intent: 'Y',
      lifecycle: 'closed',
      continuity: { next: 'stale' },
      close: {
        reason: 'cancelled',
      },
    }),
    'invalid_input',
  );
});

test('relations reject self references', () => {
  expectCode(
    () => buildOpenChange(
      CHG1,
      openInput(),
      {
        relations: {
          spawned_from: CHG1,
        },
      },
    ),
    'relation_invalid',
  );
});

test('Decision and Knowledge are strict typed domain records', () => {
  const decision = buildDecision(DEC1, {
    subject_id: CHG1,
    statement: 'Usar MCP como primer transport.',
    rationale: 'Los harnesses objetivo consumen tools.',
  });

  assert.equal(decision.subject_id, CHG1);

  const knowledge = buildKnowledge(KNW1, {
    statement: 'El proyecto usa tag_ticket.',
    source_refs: ['CHG-reference'],
  });

  assert.equal(knowledge.statement, 'El proyecto usa tag_ticket.');
});

test('record envelope rejects physical or arbitrary fields', () => {
  const record = makeRecord({
    projectId: 'project-a',
    kind: 'change',
    id: CHG1,
    payload: changeFromPayload(CHG1, {
      title: 'X',
      intent: 'Y',
      lifecycle: 'open',
      continuity: { next: 'Actuar' },
    }),
  });

  const valid = validateRecord({
    ...record,
    payload: {
      title: 'X',
      intent: 'Y',
      lifecycle: 'open',
      continuity: { next: 'Actuar' },
    },
  });
  assert.equal(valid.kind, 'change');

  expectCode(
    () => validateRecord({
      ...record,
      topic_key: 'physical',
    }),
    'invalid_input',
  );
});
