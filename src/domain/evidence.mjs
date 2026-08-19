import {
  assertAllowedKeys,
  assertPlainObject,
  compactObject,
  optionalUniqueStrings,
  requiredString,
  uniqueStrings,
} from './validation.mjs';
import { closureRejected, invalidInput } from './errors.mjs';
import { validateId } from './ids.mjs';

const METHODS = new Set([
  'test',
  'build',
  'lint',
  'runtime',
  'inspection',
  'diff',
  'external',
  'other',
]);

const RESULTS = new Set(['pass', 'fail', 'observed']);

const EVIDENCE_KEYS = new Set([
  'method',
  'result',
  'summary',
  'covers',
  'source',
]);

const SOURCE_KEYS = new Set(['command', 'reference']);

export function normalizeEvidence(input, name = 'evidence') {
  assertPlainObject(input, name);
  assertAllowedKeys(input, EVIDENCE_KEYS, name);

  if (!METHODS.has(input.method)) {
    throw invalidInput(`${name}.method is invalid`, {
      method: input.method,
    });
  }

  if (!RESULTS.has(input.result)) {
    throw invalidInput(`${name}.result is invalid`, {
      result: input.result,
    });
  }

  return compactObject({
    method: input.method,
    result: input.result,
    summary: requiredString(input.summary, `${name}.summary`),
    covers: optionalUniqueStrings(input.covers, `${name}.covers`),
    source: normalizeSource(input.source, `${name}.source`),
  });
}

export function normalizeEvidenceList(value, name = 'evidence') {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidInput(`${name} must be a non-empty array`);
  }

  return value.map((item, index) =>
    normalizeEvidence(item, `${name}[${index}]`),
  );
}

export function normalizeOptionalEvidenceList(value, name = 'evidence') {
  if (value === undefined) return undefined;
  return normalizeEvidenceList(value, name);
}

export function normalizeEvidenceRefs(value, name = 'evidence_refs') {
  if (value === undefined) return undefined;

  const refs = uniqueStrings(value, name, { min: 1 });
  refs.forEach((id) => validateId(id, 'evidence'));
  return refs;
}

export function assertCompletionEvidence(evidences, acceptanceIds) {
  if (!Array.isArray(evidences) || evidences.length === 0) {
    throw closureRejected(
      'Completion requires at least one supporting Evidence',
    );
  }

  const failed = evidences.filter((item) => item.result === 'fail');
  if (failed.length > 0) {
    throw closureRejected(
      'Evidence with result=fail cannot support completion',
      { failed: failed.map((item) => item.summary) },
    );
  }

  assertExactCoverage(evidences, acceptanceIds);
}

export function assertKnownCoverage(evidence, acceptanceIds) {
  const known = new Set(acceptanceIds);
  for (const id of evidence.covers ?? []) {
    if (!known.has(id)) {
      throw invalidInput(
        `Evidence references unknown acceptance id: ${id}`,
        { unknown: id },
      );
    }
  }
}

export function assertExactCoverage(evidences, acceptanceIds) {
  const required = new Set(acceptanceIds);
  const covered = new Set();

  for (const evidence of evidences) {
    for (const id of evidence.covers ?? []) {
      if (!required.has(id)) {
        throw closureRejected(
          `Evidence references unknown acceptance id: ${id}`,
          { unknown: id },
        );
      }
      covered.add(id);
    }
  }

  const missing = [...required].filter((id) => !covered.has(id));
  if (missing.length > 0) {
    throw closureRejected(
      'Explicit acceptance is not fully covered by Evidence',
      { missing },
    );
  }
}


function normalizeSource(value, name) {
  if (value === undefined) return undefined;

  assertPlainObject(value, name);
  assertAllowedKeys(value, SOURCE_KEYS, name);

  const command = value.command === undefined
    ? undefined
    : requiredString(value.command, `${name}.command`);
  const reference = value.reference === undefined
    ? undefined
    : requiredString(value.reference, `${name}.reference`);

  if (command === undefined && reference === undefined) {
    throw invalidInput(`${name} requires command or reference`);
  }

  return compactObject({ command, reference });
}


const EVIDENCE_RECORD_INPUT_KEYS = new Set([
  'subject_id',
  'method',
  'result',
  'summary',
  'covers',
  'source',
]);

const EVIDENCE_RECORD_KEYS = new Set([
  'id',
  'subject_id',
  'method',
  'result',
  'summary',
  'covers',
  'source',
]);

const EVIDENCE_RECORD_PAYLOAD_KEYS = new Set([
  'method',
  'result',
  'summary',
  'covers',
  'source',
]);

export function normalizeEvidenceRecordInput(input) {
  assertPlainObject(input, 'recordEvidence input');
  assertAllowedKeys(
    input,
    EVIDENCE_RECORD_INPUT_KEYS,
    'recordEvidence input',
  );

  const subjectId = validateId(input.subject_id, 'change');
  const evidence = normalizeEvidence({
    method: input.method,
    result: input.result,
    summary: input.summary,
    covers: input.covers,
    source: input.source,
  });

  return {
    subject_id: subjectId,
    evidence,
  };
}

export function buildEvidenceRecord(id, input) {
  validateId(id, 'evidence');
  const normalized = normalizeEvidenceRecordInput(input);

  return {
    id,
    subject_id: normalized.subject_id,
    ...normalized.evidence,
  };
}

export function normalizeEvidenceRecord(record) {
  assertPlainObject(record, 'Evidence');
  assertAllowedKeys(record, EVIDENCE_RECORD_KEYS, 'Evidence');

  return buildEvidenceRecord(record.id, {
    subject_id: record.subject_id,
    method: record.method,
    result: record.result,
    summary: record.summary,
    covers: record.covers,
    source: record.source,
  });
}

export function evidenceRecordPayload(record) {
  const normalized = normalizeEvidenceRecord(record);
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

export function evidenceRecordFromPayload(id, payload, subjectId) {
  assertPlainObject(payload, 'Evidence payload');
  assertAllowedKeys(
    payload,
    EVIDENCE_RECORD_PAYLOAD_KEYS,
    'Evidence payload',
  );

  return normalizeEvidenceRecord({
    id,
    subject_id: subjectId,
    ...payload,
  });
}
