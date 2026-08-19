import {
  assertAllowedKeys,
  assertPlainObject,
  clone,
  compactObject,
  requiredString,
} from './validation.mjs';
import { invalidInput } from './errors.mjs';
import { validateId } from './ids.mjs';

const KINDS = new Set([
  'change',
  'decision',
  'evidence',
  'knowledge',
]);

const RECORD_KEYS = new Set([
  'schema_version',
  'project_id',
  'kind',
  'id',
  'subject_id',
  'payload',
  'created_at',
  'updated_at',
]);

export function makeRecord({
  projectId,
  kind,
  id,
  subjectId,
  payload,
}) {
  assertKind(kind);
  validateId(id, kind);
  assertPlainObject(payload, 'record payload');

  return compactObject({
    schema_version: 1,
    project_id: requiredString(projectId, 'projectId'),
    kind,
    id,
    subject_id: subjectId,
    payload: clone(payload),
  });
}

export function validateRecord(
  record,
  {
    expectedProjectId,
    expectedKind,
    expectedId,
  } = {},
) {
  assertPlainObject(record, 'Memory record');
  assertAllowedKeys(record, RECORD_KEYS, 'Memory record');

  if (record.schema_version !== 1) {
    throw invalidInput('Memory record schema_version must be 1');
  }

  const projectId = requiredString(
    record.project_id,
    'Memory record project_id',
  );
  assertKind(record.kind);
  const id = validateId(record.id, record.kind);

  if (
    expectedProjectId !== undefined
    && projectId !== expectedProjectId
  ) {
    throw invalidInput('Memory record belongs to another project');
  }

  if (
    expectedKind !== undefined
    && record.kind !== expectedKind
  ) {
    throw invalidInput('Memory record kind does not match request');
  }

  if (expectedId !== undefined && id !== expectedId) {
    throw invalidInput('Memory record id does not match request');
  }

  if (record.subject_id !== undefined) {
    requiredString(record.subject_id, 'Memory record subject_id');
  }

  assertPlainObject(record.payload, 'Memory record payload');

  if (record.created_at !== undefined) {
    requiredString(record.created_at, 'Memory record created_at');
  }
  if (record.updated_at !== undefined) {
    requiredString(record.updated_at, 'Memory record updated_at');
  }

  return compactObject({
    schema_version: 1,
    project_id: projectId,
    kind: record.kind,
    id,
    subject_id: record.subject_id,
    payload: clone(record.payload),
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

function assertKind(kind) {
  if (!KINDS.has(kind)) {
    throw invalidInput(`Unsupported Memory record kind: ${String(kind)}`);
  }
}
