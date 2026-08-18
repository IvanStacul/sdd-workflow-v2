import { randomBytes } from 'node:crypto';

const CHANGE_ID_RE = /^CHG-[0-9A-HJKMNP-TV-Z]{26}$/;

const CHANGE_INPUT_KEYS = new Set([
  'title',
  'intent',
  'contract',
  'continuity',
]);

const RECEIPT_INPUT_KEYS = new Set([
  'title',
  'intent',
  'contract',
  'outcome',
  'evidence',
]);

const CONTRACT_KEYS = new Set([
  'scope',
  'acceptance',
  'constraints',
  'risks',
  'edge_cases',
  'rollback',
]);

const CONTINUITY_KEYS = new Set([
  'completed',
  'next',
  'blockers',
]);

const EVIDENCE_KEYS = new Set([
  'summary',
  'covers',
  'refs',
]);

const REFINE_KEYS = new Set([
  'type',
  'title',
  'intent',
  'contract',
]);

const FRONTIER_KEYS = new Set([
  'type',
  'completed',
  'next',
  'blockers',
]);

const COMPLETED_CLOSE_KEYS = new Set([
  'reason',
  'outcome',
  'evidence',
]);

const CANCELLED_CLOSE_KEYS = new Set([
  'reason',
  'rationale',
]);

export class SemanticApiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SemanticApiError';
    this.code = code;
    this.details = details;
  }
}

export class MemoryPortError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MemoryPortError';
    this.code = code;
    this.details = details;
  }
}

export function createSemanticApi({
  projectId,
  memory,
  idFactory = createUlidChangeId,
}) {
  requireNonEmptyString(projectId, 'projectId');
  requireMemoryPort(memory);
  if (typeof idFactory !== 'function') {
    throw invalid('idFactory must be a function');
  }

  return {
    async openChange(input) {
      assertPlainObject(input, 'openChange input');
      assertAllowedKeys(input, CHANGE_INPUT_KEYS, 'openChange input');

      const id = generateChangeId(idFactory);
      const payload = buildOpenPayload(input);

      await memoryPut(memory, {
        schema_version: 1,
        project_id: projectId,
        kind: 'change',
        id,
        payload,
      });

      return toChange({
        schema_version: 1,
        project_id: projectId,
        kind: 'change',
        id,
        payload,
      });
    },

    async createReceipt(input) {
      assertPlainObject(input, 'createReceipt input');
      assertAllowedKeys(input, RECEIPT_INPUT_KEYS, 'createReceipt input');

      const id = generateChangeId(idFactory);
      const payload = buildReceiptPayload(input);

      await memoryPut(memory, {
        schema_version: 1,
        project_id: projectId,
        kind: 'change',
        id,
        payload,
      });

      return toChange({
        schema_version: 1,
        project_id: projectId,
        kind: 'change',
        id,
        payload,
      });
    },

    async getChange(id) {
      validateChangeId(id);

      let record;
      try {
        record = await memory.get({
          project_id: projectId,
          kind: 'change',
          id,
        });
      } catch (error) {
        throw translateMemoryError(error, {
          notFoundCode: 'change_not_found',
          notFoundMessage: `Change not found: ${id}`,
        });
      }

      return validateAndConvertRecord(record, {
        expectedProjectId: projectId,
        expectedId: id,
      });
    },

    async listOpenChanges(options = {}) {
      assertPlainObject(options, 'listOpenChanges options');
      assertAllowedKeys(options, new Set(['limit']), 'listOpenChanges options');

      const selector = {
        project_id: projectId,
        kind: 'change',
      };

      if (options.limit !== undefined) {
        if (!Number.isInteger(options.limit) || options.limit < 1) {
          throw invalid('listOpenChanges limit must be a positive integer');
        }
        selector.limit = options.limit;
      }

      let result;
      try {
        result = await memory.list(selector);
      } catch (error) {
        throw translateMemoryError(error);
      }

      if (!isPlainObject(result) || !Array.isArray(result.items)) {
        throw memoryError('MemoryPort list returned an invalid result shape');
      }

      if (typeof result.complete !== 'boolean') {
        throw memoryError('MemoryPort list must declare complete=true|false');
      }

      const items = result.items
        .map((record) => validateAndConvertRecord(record, {
          expectedProjectId: projectId,
        }))
        .filter((change) => change.lifecycle === 'open');

      const response = {
        items,
        complete: result.complete,
      };

      if (result.next_cursor !== undefined) {
        response.next_cursor = result.next_cursor;
      }

      return response;
    },

    async updateChange(id, mutations) {
      validateChangeId(id);

      if (!Array.isArray(mutations) || mutations.length === 0) {
        throw invalid('updateChange requires at least one mutation');
      }

      const current = await this.getChange(id);
      if (current.lifecycle !== 'open') {
        throw closed(`Cannot update closed Change ${id}`);
      }

      let next = clone(current);
      for (const mutation of mutations) {
        next = applyMutation(next, mutation);
      }

      validateChange(next);

      const record = fromChange(projectId, next);
      await memoryPut(memory, record);

      return next;
    },

    async closeChange(id, input) {
      validateChangeId(id);
      assertPlainObject(input, 'closeChange input');

      const current = await this.getChange(id);
      if (current.lifecycle !== 'open') {
        throw closed(`Change ${id} is already closed`);
      }

      let next;
      if (input.reason === 'completed') {
        assertAllowedKeys(
          input,
          COMPLETED_CLOSE_KEYS,
          'closeChange completed input',
        );
        next = closeCompleted(current, input);
      } else if (input.reason === 'cancelled') {
        assertAllowedKeys(
          input,
          CANCELLED_CLOSE_KEYS,
          'closeChange cancelled input',
        );
        next = closeCancelled(current, input);
      } else {
        throw invalid(
          'closeChange reason must be completed or cancelled in the initial slice',
        );
      }

      validateChange(next);
      await memoryPut(memory, fromChange(projectId, next));

      return next;
    },
  };
}

export class InMemoryMemoryPort {
  constructor({
    complete = true,
  } = {}) {
    this.records = new Map();
    this.complete = complete;
    this.putCount = 0;
    this.getCount = 0;
    this.listCount = 0;
    this.failures = {
      put: null,
      get: null,
      list: null,
    };
  }

  failNext(operation, code, message = `Injected ${operation} failure`) {
    if (!Object.hasOwn(this.failures, operation)) {
      throw new Error(`Unknown operation: ${operation}`);
    }
    this.failures[operation] = new MemoryPortError(code, message);
  }

  async put(record) {
    this.putCount += 1;
    this.#throwInjected('put');

    const key = recordKey(record);
    this.records.set(key, clone(record));
    return clone(record);
  }

  async get(ref) {
    this.getCount += 1;
    this.#throwInjected('get');

    const key = recordKey(ref);
    const record = this.records.get(key);
    if (!record) {
      throw new MemoryPortError(
        'not_found',
        `Record not found: ${key}`,
      );
    }
    return clone(record);
  }

  async list(selector) {
    this.listCount += 1;
    this.#throwInjected('list');

    let items = [...this.records.values()]
      .filter((record) => (
        record.project_id === selector.project_id
        && (!selector.kind || record.kind === selector.kind)
      ));

    const limit = selector.limit;
    let complete = this.complete;

    if (Number.isInteger(limit) && items.length > limit) {
      items = items.slice(0, limit);
      complete = false;
    }

    return {
      items: clone(items),
      complete,
      next_cursor: complete ? undefined : 'in-memory-more',
    };
  }

  rawRecords() {
    return clone([...this.records.values()]);
  }

  #throwInjected(operation) {
    const error = this.failures[operation];
    if (!error) return;
    this.failures[operation] = null;
    throw error;
  }
}

export function createSequenceIdFactory(ids) {
  const queue = [...ids];
  return () => {
    if (queue.length === 0) {
      throw new Error('No deterministic IDs left');
    }
    return queue.shift();
  };
}

function buildOpenPayload(input) {
  requireNonEmptyString(input.title, 'title');
  requireNonEmptyString(input.intent, 'intent');

  if ('relations' in input) {
    throw invalid('relations are not supported in the initial Semantic API slice');
  }

  const continuity = normalizeContinuity(input.continuity, {
    requireNext: true,
  });

  const payload = {
    title: input.title.trim(),
    intent: input.intent.trim(),
    lifecycle: 'open',
    continuity,
  };

  if (input.contract !== undefined) {
    payload.contract = normalizeContract(input.contract);
  }

  return payload;
}

function buildReceiptPayload(input) {
  requireNonEmptyString(input.title, 'title');
  requireNonEmptyString(input.intent, 'intent');
  requireNonEmptyString(input.outcome, 'outcome');

  const evidence = normalizeEvidence(input.evidence);
  const contract = input.contract === undefined
    ? undefined
    : normalizeContract(input.contract);

  validateAcceptanceCoverage(contract, evidence);

  const payload = {
    title: input.title.trim(),
    intent: input.intent.trim(),
    lifecycle: 'closed',
    close: {
      reason: 'completed',
      outcome: input.outcome.trim(),
      evidence,
    },
  };

  if (contract !== undefined) {
    payload.contract = contract;
  }

  return payload;
}

function applyMutation(change, mutation) {
  assertPlainObject(mutation, 'mutation');

  if (mutation.type === 'refine') {
    assertAllowedKeys(mutation, REFINE_KEYS, 'refine mutation');

    if (
      mutation.title === undefined
      && mutation.intent === undefined
      && mutation.contract === undefined
    ) {
      throw invalid('refine mutation must change title, intent, or contract');
    }

    const next = clone(change);

    if (mutation.title !== undefined) {
      requireNonEmptyString(mutation.title, 'refine.title');
      next.title = mutation.title.trim();
    }

    if (mutation.intent !== undefined) {
      requireNonEmptyString(mutation.intent, 'refine.intent');
      next.intent = mutation.intent.trim();
    }

    if (mutation.contract !== undefined) {
      next.contract = normalizeContract(mutation.contract);
    }

    return next;
  }

  if (mutation.type === 'set_frontier') {
    assertAllowedKeys(mutation, FRONTIER_KEYS, 'set_frontier mutation');

    const next = clone(change);
    next.continuity = normalizeContinuity({
      completed: mutation.completed,
      next: mutation.next,
      blockers: mutation.blockers,
    }, {
      requireNext: true,
    });

    return next;
  }

  throw invalid(`Unsupported mutation type: ${String(mutation.type)}`);
}

function closeCompleted(change, input) {
  requireNonEmptyString(input.outcome, 'close outcome');

  const evidence = normalizeEvidence(input.evidence);

  if (change.continuity?.blockers?.length > 0) {
    throw closureRejected(
      `Change ${change.id} has active blockers`,
      { blockers: clone(change.continuity.blockers) },
    );
  }

  validateAcceptanceCoverage(change.contract, evidence);

  const next = clone(change);
  next.lifecycle = 'closed';
  next.close = {
    reason: 'completed',
    outcome: input.outcome.trim(),
    evidence,
  };
  delete next.continuity;

  return next;
}

function closeCancelled(change, input) {
  const next = clone(change);
  next.lifecycle = 'closed';
  next.close = {
    reason: 'cancelled',
  };

  if (input.rationale !== undefined) {
    requireNonEmptyString(input.rationale, 'cancel rationale');
    next.close.rationale = input.rationale.trim();
  }

  delete next.continuity;
  return next;
}

function validateAcceptanceCoverage(contract, evidence) {
  const acceptance = contract?.acceptance;
  if (!Array.isArray(acceptance) || acceptance.length === 0) {
    return;
  }

  const required = acceptance.map((item) => item.id);
  const covers = Array.isArray(evidence?.covers)
    ? new Set(evidence.covers)
    : new Set();

  const missing = required.filter((id) => !covers.has(id));
  if (missing.length > 0) {
    throw closureRejected(
      'Explicit acceptance is not fully covered by evidence',
      { missing },
    );
  }
}

function normalizeContract(value) {
  assertPlainObject(value, 'contract');
  assertAllowedKeys(value, CONTRACT_KEYS, 'contract');

  const out = clone(value);

  if (out.scope !== undefined) {
    assertPlainObject(out.scope, 'contract.scope');
    assertAllowedKeys(
      out.scope,
      new Set(['in', 'out']),
      'contract.scope',
    );
    if (out.scope.in !== undefined) {
      out.scope.in = normalizeStringArray(out.scope.in, 'contract.scope.in');
    }
    if (out.scope.out !== undefined) {
      out.scope.out = normalizeStringArray(out.scope.out, 'contract.scope.out');
    }
  }

  if (out.acceptance !== undefined) {
    if (!Array.isArray(out.acceptance)) {
      throw invalid('contract.acceptance must be an array');
    }

    const ids = new Set();
    out.acceptance = out.acceptance.map((item, index) => {
      assertPlainObject(item, `contract.acceptance[${index}]`);
      assertAllowedKeys(
        item,
        new Set(['id', 'condition']),
        `contract.acceptance[${index}]`,
      );
      requireNonEmptyString(
        item.id,
        `contract.acceptance[${index}].id`,
      );
      requireNonEmptyString(
        item.condition,
        `contract.acceptance[${index}].condition`,
      );

      const id = item.id.trim();
      if (ids.has(id)) {
        throw invalid(`Duplicate acceptance id: ${id}`);
      }
      ids.add(id);

      return {
        id,
        condition: item.condition.trim(),
      };
    });
  }

  if (out.constraints !== undefined) {
    out.constraints = normalizeStringArray(
      out.constraints,
      'contract.constraints',
    );
  }

  if (out.edge_cases !== undefined) {
    out.edge_cases = normalizeStringArray(
      out.edge_cases,
      'contract.edge_cases',
    );
  }

  return out;
}

function normalizeContinuity(value, {
  requireNext,
}) {
  assertPlainObject(value, 'continuity');
  assertAllowedKeys(value, CONTINUITY_KEYS, 'continuity');

  if (requireNext) {
    requireNonEmptyString(value.next, 'continuity.next');
  }

  return {
    completed: value.completed === undefined
      ? []
      : normalizeStringArray(value.completed, 'continuity.completed'),
    next: value.next.trim(),
    blockers: value.blockers === undefined
      ? []
      : normalizeStringArray(value.blockers, 'continuity.blockers'),
  };
}

function normalizeEvidence(value) {
  assertPlainObject(value, 'evidence');
  assertAllowedKeys(value, EVIDENCE_KEYS, 'evidence');
  requireNonEmptyString(value.summary, 'evidence.summary');

  const evidence = {
    summary: value.summary.trim(),
  };

  if (value.covers !== undefined) {
    evidence.covers = uniqueStringArray(
      value.covers,
      'evidence.covers',
    );
  }

  if (value.refs !== undefined) {
    evidence.refs = uniqueStringArray(
      value.refs,
      'evidence.refs',
    );
  }

  return evidence;
}

function validateChange(change) {
  assertPlainObject(change, 'Change');
  validateChangeId(change.id);
  requireNonEmptyString(change.title, 'Change.title');
  requireNonEmptyString(change.intent, 'Change.intent');

  if (!['open', 'closed'].includes(change.lifecycle)) {
    throw invalid('Change.lifecycle must be open or closed');
  }

  if (change.contract !== undefined) {
    normalizeContract(change.contract);
  }

  if (change.lifecycle === 'open') {
    if (change.close !== undefined) {
      throw invalid('Open Change cannot contain close');
    }
    normalizeContinuity(change.continuity, {
      requireNext: true,
    });
    return true;
  }

  if (change.continuity !== undefined) {
    throw invalid('Closed Change cannot contain continuity');
  }

  assertPlainObject(change.close, 'Change.close');
  if (!['completed', 'cancelled'].includes(change.close.reason)) {
    throw invalid(
      'Initial Semantic API supports completed/cancelled closed Changes only',
    );
  }

  if (change.close.reason === 'completed') {
    requireNonEmptyString(change.close.outcome, 'Change.close.outcome');
    const evidence = normalizeEvidence(change.close.evidence);
    validateAcceptanceCoverage(change.contract, evidence);
  }

  return true;
}

function validateAndConvertRecord(record, {
  expectedProjectId,
  expectedId,
}) {
  assertPlainObject(record, 'Memory record');

  if (
    record.schema_version !== 1
    || record.project_id !== expectedProjectId
    || record.kind !== 'change'
    || typeof record.id !== 'string'
    || !isPlainObject(record.payload)
  ) {
    throw invalid(
      'Memory record does not match the expected Change envelope',
    );
  }

  if (expectedId !== undefined && record.id !== expectedId) {
    throw invalid(
      `Memory returned Change ${record.id} for requested ${expectedId}`,
    );
  }

  const change = toChange(record);
  validateChange(change);
  return change;
}

function fromChange(projectId, change) {
  const {
    id,
    ...payload
  } = clone(change);

  return {
    schema_version: 1,
    project_id: projectId,
    kind: 'change',
    id,
    payload,
  };
}

function toChange(record) {
  return {
    id: record.id,
    ...clone(record.payload),
  };
}

async function memoryPut(memory, record) {
  try {
    await memory.put(record);
  } catch (error) {
    throw translateMemoryError(error);
  }
}

function translateMemoryError(error, {
  notFoundCode,
  notFoundMessage,
} = {}) {
  if (error instanceof SemanticApiError) {
    return error;
  }

  const code = error?.code;

  if (code === 'not_found' && notFoundCode) {
    return new SemanticApiError(
      notFoundCode,
      notFoundMessage || error.message,
      { cause: error },
    );
  }

  if (code === 'unavailable') {
    return new SemanticApiError(
      'memory_unavailable',
      'Durable memory is unavailable',
      { cause: error },
    );
  }

  if (code === 'ambiguous') {
    return new SemanticApiError(
      'memory_ambiguous',
      'Durable memory returned an ambiguous result',
      { cause: error },
    );
  }

  if (code === 'unsupported') {
    return new SemanticApiError(
      'memory_unsupported',
      'The configured memory backend does not support this operation',
      { cause: error },
    );
  }

  return memoryError(
    'Durable memory failed',
    { cause: error },
  );
}

function requireMemoryPort(memory) {
  if (
    !memory
    || typeof memory.put !== 'function'
    || typeof memory.get !== 'function'
    || typeof memory.list !== 'function'
  ) {
    throw invalid('memory must implement put/get/list');
  }
}

function generateChangeId(idFactory) {
  let id;
  try {
    id = idFactory();
  } catch (error) {
    throw invalid('idFactory failed to generate a Change ID', {
      cause: error,
    });
  }

  validateChangeId(id);
  return id;
}

function validateChangeId(id) {
  if (typeof id !== 'string' || !CHANGE_ID_RE.test(id)) {
    throw invalid(
      'Change ID must match CHG-<ULID>',
      { id },
    );
  }
}

function normalizeStringArray(value, name) {
  if (!Array.isArray(value)) {
    throw invalid(`${name} must be an array`);
  }

  return value.map((item, index) => {
    requireNonEmptyString(item, `${name}[${index}]`);
    return item.trim();
  });
}

function uniqueStringArray(value, name) {
  const normalized = normalizeStringArray(value, name);
  return [...new Set(normalized)];
}

function assertAllowedKeys(object, allowed, name) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw invalid(`${name} contains unsupported field: ${key}`);
    }
  }
}

function assertPlainObject(value, name) {
  if (!isPlainObject(value)) {
    throw invalid(`${name} must be an object`);
  }
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${name} must be a non-empty string`);
  }
}

function recordKey(value) {
  return `${value.project_id}\u0000${value.kind}\u0000${value.id}`;
}

function clone(value) {
  return structuredClone(value);
}

function invalid(message, details = {}) {
  return new SemanticApiError('invalid_change', message, details);
}

function closed(message, details = {}) {
  return new SemanticApiError('change_closed', message, details);
}

function closureRejected(message, details = {}) {
  return new SemanticApiError('closure_rejected', message, details);
}

function memoryError(message, details = {}) {
  return new SemanticApiError('memory_error', message, details);
}

function createUlidChangeId(now = Date.now()) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  let time = BigInt(now);
  let timePart = '';
  for (let i = 0; i < 10; i += 1) {
    timePart = alphabet[Number(time & 31n)] + timePart;
    time >>= 5n;
  }

  const bytes = randomBytes(10);
  let randomness = 0n;
  for (const byte of bytes) {
    randomness = (randomness << 8n) | BigInt(byte);
  }

  let randomPart = '';
  for (let i = 0; i < 16; i += 1) {
    randomPart = alphabet[Number(randomness & 31n)] + randomPart;
    randomness >>= 5n;
  }

  return `CHG-${timePart}${randomPart}`;
}
