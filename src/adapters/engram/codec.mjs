import { createHash } from 'node:crypto';

import { validateRecord } from '../../domain/record.mjs';
import { memoryPortError } from '../../ports/memory.mjs';

export const ENGRAM_MAX_OBSERVATION_BYTES = 50000;
export const ENGRAM_MAX_SEARCH_RESULTS = 20;
export const ENGRAM_PROJECT_SCAN_LIMIT = 20;

const KIND_TO_TYPE = Object.freeze({
  change: 'sdd_change',
  decision: 'sdd_decision',
  evidence: 'sdd_evidence',
  knowledge: 'sdd_knowledge',
});

const TYPE_TO_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(KIND_TO_TYPE).map(([kind, type]) => [type, kind]),
  ),
);

export function physicalProject(projectId) {
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throw memoryPortError('invalid', 'project_id must be a non-empty string');
  }

  return `sddv2-${sha256(projectId).slice(0, 24)}`;
}

export function physicalTopic(kind, id) {
  physicalType(kind);
  if (typeof id !== 'string' || id === '') {
    throw memoryPortError('invalid', 'record id must be a non-empty string');
  }
  return `sdd/v2/${kind}/${sha256(id)}`;
}

export function physicalType(kind) {
  const type = KIND_TO_TYPE[kind];
  if (!type) {
    throw memoryPortError('invalid', `Unsupported SDD record kind: ${String(kind)}`);
  }
  return type;
}

export function kindFromPhysicalType(type) {
  return TYPE_TO_KIND[type] ?? null;
}

export function physicalSessionId(projectId) {
  return `sddv2-repository-${sha256(projectId).slice(0, 24)}`;
}

export function encodeRecord(record) {
  let normalized;
  try {
    normalized = validateRecord(record);
  } catch (error) {
    throw memoryPortError(
      'invalid',
      'SDD record violates the Memory Contract envelope',
      {},
      error,
    );
  }

  let content;
  try {
    content = JSON.stringify(normalized).replaceAll('<', '\\u003c');
  } catch (error) {
    throw memoryPortError(
      'invalid',
      'SDD record cannot be serialized as JSON',
      {},
      error,
    );
  }

  const byteLength = Buffer.byteLength(content, 'utf8');

  if (byteLength > ENGRAM_MAX_OBSERVATION_BYTES) {
    throw memoryPortError(
      'invalid',
      'Serialized SDD record exceeds Engram observation limit',
      {
        bytes: byteLength,
        max_bytes: ENGRAM_MAX_OBSERVATION_BYTES,
      },
    );
  }

  return {
    record: normalized,
    content,
    project: physicalProject(normalized.project_id),
    scope: 'project',
    type: physicalType(normalized.kind),
    topic_key: physicalTopic(normalized.kind, normalized.id),
    title: `SDD ${normalized.kind} ${normalized.id}`,
  };
}

export function decodeObservation(observation, {
  expectedProjectId,
  expectedKind,
  expectedId,
} = {}) {
  if (!observation || typeof observation !== 'object') {
    throw memoryPortError('backend_error', 'Engram returned an invalid observation');
  }

  const physicalKind = kindFromPhysicalType(observation.type);
  if (!physicalKind) {
    throw memoryPortError(
      'backend_error',
      'Engram observation is not an SDD canonical record',
      { observation_id: observation.id },
    );
  }

  let record;
  try {
    record = JSON.parse(observation.content);
  } catch (error) {
    throw memoryPortError(
      'backend_error',
      'Engram SDD observation contains invalid JSON',
      { observation_id: observation.id },
      error,
    );
  }

  let normalized;
  try {
    normalized = validateRecord(record, {
      expectedProjectId,
      expectedKind: expectedKind ?? physicalKind,
      expectedId,
    });
  } catch (error) {
    throw memoryPortError(
      'backend_error',
      'Persisted Engram SDD record violates its logical envelope',
      { observation_id: observation.id },
      error,
    );
  }

  const expectedProject = physicalProject(normalized.project_id);
  const expectedTopic = physicalTopic(normalized.kind, normalized.id);
  const expectedType = physicalType(normalized.kind);

  if (
    observation.project !== expectedProject
    || observation.scope !== 'project'
    || observation.type !== expectedType
    || observation.topic_key !== expectedTopic
  ) {
    throw memoryPortError(
      'backend_error',
      'Engram physical identity does not match the logical SDD record',
      { observation_id: observation.id },
    );
  }

  return normalized;
}

export function isExactPhysicalMatch(observation, ref) {
  return (
    observation
    && observation.project === physicalProject(ref.project_id)
    && observation.scope === 'project'
    && observation.type === physicalType(ref.kind)
    && observation.topic_key === physicalTopic(ref.kind, ref.id)
  );
}

function sha256(value) {
  return createHash('sha256')
    .update(String(value))
    .digest('hex');
}
