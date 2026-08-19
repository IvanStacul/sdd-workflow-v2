import {
  assertAllowedKeys,
  assertPlainObject,
  compactObject,
  requiredString,
} from './validation.mjs';
import { validateId } from './ids.mjs';

const INPUT_KEYS = new Set([
  'subject_id',
  'statement',
  'rationale',
  'supersedes',
]);

const DECISION_KEYS = new Set([
  'id',
  'subject_id',
  'statement',
  'rationale',
  'supersedes',
]);

const DECISION_PAYLOAD_KEYS = new Set([
  'statement',
  'rationale',
  'supersedes',
]);

export function normalizeDecisionInput(input) {
  assertPlainObject(input, 'recordDecision input');
  assertAllowedKeys(input, INPUT_KEYS, 'recordDecision input');

  return compactObject({
    subject_id: input.subject_id === undefined
      ? undefined
      : validateId(input.subject_id, 'change'),
    statement: requiredString(input.statement, 'statement'),
    rationale: requiredString(input.rationale, 'rationale'),
    supersedes: input.supersedes === undefined
      ? undefined
      : validateId(input.supersedes, 'decision'),
  });
}

export function buildDecision(id, input) {
  validateId(id, 'decision');
  const normalized = normalizeDecisionInput(input);

  return {
    id,
    ...normalized,
  };
}

export function normalizeDecision(decision) {
  assertPlainObject(decision, 'Decision');
  assertAllowedKeys(decision, DECISION_KEYS, 'Decision');

  return buildDecision(decision.id, {
    subject_id: decision.subject_id,
    statement: decision.statement,
    rationale: decision.rationale,
    supersedes: decision.supersedes,
  });
}

export function decisionPayload(decision) {
  const normalized = normalizeDecision(decision);
  const {
    id,
    subject_id,
    ...payload
  } = normalized;

  return {
    subject_id,
    payload,
  };
}

export function decisionFromPayload(id, payload, subjectId) {
  assertPlainObject(payload, 'Decision payload');
  assertAllowedKeys(
    payload,
    DECISION_PAYLOAD_KEYS,
    'Decision payload',
  );

  return normalizeDecision({
    id,
    subject_id: subjectId,
    ...payload,
  });
}
