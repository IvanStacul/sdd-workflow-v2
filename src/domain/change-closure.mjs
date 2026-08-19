import {
  assertAllowedKeys,
  assertPlainObject,
  compactObject,
  requiredString,
} from './validation.mjs';
import {
  acceptanceIdsFromContract,
} from './change-contract.mjs';
import {
  assertCompletionEvidence,
  assertKnownCoverage,
  normalizeEvidenceList,
  normalizeEvidenceRefs,
  normalizeOptionalEvidenceList,
} from './evidence.mjs';
import {
  invalidInput,
  invalidState,
} from './errors.mjs';

const COMPLETED_KEYS = new Set([
  'reason',
  'outcome',
  'evidence',
  'evidence_refs',
]);

const CANCELLED_KEYS = new Set([
  'reason',
  'rationale',
]);

const FUTURE_KEYS = new Set([
  'reason',
  'rationale',
]);

export function buildCompletedClose(
  input,
  contract,
  referencedEvidence = [],
) {
  assertPlainObject(input, 'closeChange completed input');
  assertAllowedKeys(
    input,
    COMPLETED_KEYS,
    'closeChange completed input',
  );

  if (input.reason !== 'completed') {
    throw invalidInput('closeChange reason must be completed');
  }

  const embedded = normalizeOptionalEvidenceList(
    input.evidence,
    'evidence',
  ) ?? [];
  const refs = normalizeEvidenceRefs(
    input.evidence_refs,
    'evidence_refs',
  );
  const referenced = referencedEvidence.map((item, index) =>
    normalizeResolvedEvidence(
      item,
      `referencedEvidence[${index}]`,
    ),
  );

  if ((refs?.length ?? 0) !== referenced.length) {
    throw invalidState(
      'Resolved Evidence count does not match evidence_refs',
      {
        refs: refs?.length ?? 0,
        resolved: referenced.length,
      },
    );
  }

  assertCompletionEvidence(
    [...embedded, ...referenced],
    acceptanceIdsFromContract(contract),
  );

  return compactObject({
    reason: 'completed',
    outcome: requiredString(input.outcome, 'outcome'),
    evidence: embedded.length > 0 ? embedded : undefined,
    evidence_refs: refs,
  });
}

export function buildCancelledClose(input) {
  assertPlainObject(input, 'closeChange cancelled input');
  assertAllowedKeys(
    input,
    CANCELLED_KEYS,
    'closeChange cancelled input',
  );

  if (input.reason !== 'cancelled') {
    throw invalidInput('closeChange reason must be cancelled');
  }

  return compactObject({
    reason: 'cancelled',
    rationale: input.rationale === undefined
      ? undefined
      : requiredString(input.rationale, 'rationale'),
  });
}

export function normalizePersistedClose(value, contract) {
  assertPlainObject(value, 'Change.close');

  if (value.reason === 'completed') {
    assertAllowedKeys(value, COMPLETED_KEYS, 'Change.close');

    const evidence = normalizeOptionalEvidenceList(
      value.evidence,
      'Change.close.evidence',
    );
    const evidenceRefs = normalizeEvidenceRefs(
      value.evidence_refs,
      'Change.close.evidence_refs',
    );

    if (!evidence && !evidenceRefs) {
      throw invalidInput(
        'Completed Change requires evidence or evidence_refs',
      );
    }

    if (evidence?.some((item) => item.result === 'fail')) {
      throw invalidInput(
        'Completed Change cannot contain supporting Evidence with result=fail',
      );
    }

    if (evidence) {
      const acceptanceIds = acceptanceIdsFromContract(contract);
      evidence.forEach((item) =>
        assertKnownCoverage(item, acceptanceIds),
      );
    }

    if (evidence && !evidenceRefs) {
      assertCompletionEvidence(
        evidence,
        acceptanceIdsFromContract(contract),
      );
    }

    return compactObject({
      reason: 'completed',
      outcome: requiredString(
        value.outcome,
        'Change.close.outcome',
      ),
      evidence,
      evidence_refs: evidenceRefs,
    });
  }

  if (value.reason === 'cancelled') {
    assertAllowedKeys(value, CANCELLED_KEYS, 'Change.close');

    return compactObject({
      reason: 'cancelled',
      rationale: value.rationale === undefined
        ? undefined
        : requiredString(
          value.rationale,
          'Change.close.rationale',
        ),
    });
  }

  if (value.reason === 'superseded' || value.reason === 'split') {
    assertAllowedKeys(value, FUTURE_KEYS, 'Change.close');

    return compactObject({
      reason: value.reason,
      rationale: value.rationale === undefined
        ? undefined
        : requiredString(
          value.rationale,
          'Change.close.rationale',
        ),
    });
  }

  throw invalidInput('Change.close.reason is invalid');
}

function normalizeResolvedEvidence(item, name) {
  assertPlainObject(item, name);

  const value = item.payload !== undefined
    ? item.payload
    : {
        method: item.method,
        result: item.result,
        summary: item.summary,
        covers: item.covers,
        source: item.source,
      };

  return normalizeEvidenceList([value], name)[0];
}
