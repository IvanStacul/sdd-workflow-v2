import {
  SddError,
  invalidState,
  sddError,
} from '../domain/errors.mjs';
import {
  createIdFactory,
  validateId,
} from '../domain/ids.mjs';
import {
  makeRecord,
  validateRecord,
} from '../domain/record.mjs';
import {
  assertMemoryPort,
  isMemoryPortError,
} from '../ports/memory.mjs';
import {
  assertPlainObject,
  requiredString,
} from '../domain/validation.mjs';

export function createApplicationContext({
  projectId,
  memory,
  idFactory = createIdFactory(),
  maxIdAttempts = 5,
}) {
  return {
    projectId: requiredString(projectId, 'projectId'),
    memory: assertMemoryPort(memory),
    idFactory: assertIdFactory(idFactory),
    maxIdAttempts: assertMaxIdAttempts(maxIdAttempts),
  };
}

export async function allocateRecordId(context, kind) {
  for (
    let attempt = 1;
    attempt <= context.maxIdAttempts;
    attempt += 1
  ) {
    let candidate;
    try {
      candidate = context.idFactory(kind);
      validateId(candidate, kind);
    } catch (error) {
      throw invalidState(
        `ID factory failed for ${kind}`,
        { kind, attempt },
        error,
      );
    }

    try {
      await context.memory.get({
        project_id: context.projectId,
        kind,
        id: candidate,
      });
    } catch (error) {
      if (isMemoryPortError(error) && error.code === 'not_found') {
        return candidate;
      }
      throw translateMemoryError(error);
    }
  }

  throw invalidState(
    `Could not allocate a unique ${kind} id after ${context.maxIdAttempts} attempts`,
    {
      kind,
      attempts: context.maxIdAttempts,
    },
  );
}

export async function putDomainRecord(
  context,
  {
    kind,
    id,
    subjectId,
    payload,
  },
) {
  const record = makeRecord({
    projectId: context.projectId,
    kind,
    id,
    subjectId,
    payload,
  });

  try {
    await context.memory.put(record);
  } catch (error) {
    throw translateMemoryError(error);
  }

  return record;
}

export async function readDomainRecord(
  context,
  {
    kind,
    id,
    fromPayload,
  },
) {
  validateId(id, kind);

  let raw;
  try {
    raw = await context.memory.get({
      project_id: context.projectId,
      kind,
      id,
    });
  } catch (error) {
    throw translateMemoryError(error);
  }

  return decodePersistedRecord(
    raw,
    {
      expectedProjectId: context.projectId,
      expectedKind: kind,
      expectedId: id,
    },
    fromPayload,
  );
}

export function decodePersistedRecord(
  raw,
  expectations,
  fromPayload,
) {
  try {
    const record = validateRecord(raw, expectations);
    return fromPayload(
      record.id,
      record.payload,
      record.subject_id,
    );
  } catch (error) {
    if (error instanceof SddError) {
      throw sddError(
        'memory_error',
        'Persisted SDD record violates the domain contract',
        {
          kind: expectations.expectedKind,
          id: expectations.expectedId,
        },
        error,
      );
    }
    throw error;
  }
}

export function translateMemoryError(error) {
  if (!isMemoryPortError(error)) {
    return sddError(
      'memory_error',
      'Durable memory failed',
      {},
      error,
    );
  }

  switch (error.code) {
    case 'not_found':
      return sddError(
        'not_found',
        'SDD record not found',
        {},
        error,
      );
    case 'ambiguous':
      return sddError(
        'memory_ambiguous',
        'Durable memory returned an ambiguous result',
        {},
        error,
      );
    case 'unavailable':
      return sddError(
        'memory_unavailable',
        'Durable memory is unavailable',
        {},
        error,
      );
    case 'unsupported':
      return sddError(
        'memory_unsupported',
        'Durable memory does not support this capability',
        {},
        error,
      );
    case 'invalid':
    case 'backend_error':
    default:
      return sddError(
        'memory_error',
        'Durable memory failed',
        {},
        error,
      );
  }
}

export function assertMemoryCollectionResult(result, operation) {
  assertPlainObject(result, `${operation} result`);

  if (!Array.isArray(result.items)) {
    throw sddError(
      'memory_error',
      `${operation} returned an invalid items collection`,
    );
  }

  return result;
}

function assertIdFactory(idFactory) {
  if (typeof idFactory !== 'function') {
    throw new TypeError('idFactory must be a function');
  }
  return idFactory;
}

function assertMaxIdAttempts(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError(
      'maxIdAttempts must be an integer between 1 and 100',
    );
  }
  return value;
}
