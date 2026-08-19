import { isDeepStrictEqual } from 'node:util';

import {
  decodeObservation,
  encodeRecord,
  ENGRAM_MAX_SEARCH_RESULTS,
  ENGRAM_PROJECT_SCAN_LIMIT,
  isExactPhysicalMatch,
  physicalProject,
  physicalTopic,
  physicalType,
} from './codec.mjs';
import { memoryPortError } from '../../ports/memory.mjs';
import {
  normalizeEngramCollection,
  normalizeEngramError,
} from './errors.mjs';
import { createEngramSessionManager } from './session.mjs';
import {
  validateRecord,
} from '../../domain/record.mjs';

const SUPPORTED_KINDS = new Set([
  'change',
  'decision',
  'evidence',
  'knowledge',
]);

export function createEngramRepository({
  transport,
  sessionDirectory = 'sdd-v2',
} = {}) {
  if (!transport || typeof transport.request !== 'function') {
    throw new TypeError('transport must implement request(method, path, body?)');
  }

  if (
    typeof sessionDirectory !== 'string'
    || sessionDirectory.trim() === ''
  ) {
    throw new TypeError('sessionDirectory must be a non-empty string');
  }

  const sessions = createEngramSessionManager({
    transport,
    sessionDirectory,
  });

  async function get(ref) {
    validateRef(ref);
    const exact = await findExact(ref);

    if (exact === null) {
      throw memoryPortError(
        'not_found',
        `SDD record not found: ${ref.kind}/${ref.id}`,
      );
    }

    return exact.record;
  }

  async function put(record) {
    const normalized = normalizeInputRecord(record);
    const ref = {
      project_id: normalized.project_id,
      kind: normalized.kind,
      id: normalized.id,
    };

    const encoded = encodeRecord(normalized);
    let existing;

    try {
      existing = await findExact(ref);
    } catch (error) {
      throw normalizeEngramError(error);
    }

    if (existing !== null && isDeepStrictEqual(existing.record, normalized)) {
      return normalized;
    }

    if (existing === null) {
      const sessionId = await sessions.ensure(normalized.project_id);

      try {
        await transport.request('POST', '/observations', {
          session_id: sessionId,
          type: encoded.type,
          title: encoded.title,
          content: encoded.content,
          project: encoded.project,
          scope: encoded.scope,
          topic_key: encoded.topic_key,
        });
      } catch (error) {
        return reconcileWrite(ref, normalized, error);
      }

      return confirmWrite(ref, normalized);
    }

    try {
      await transport.request(
        'PATCH',
        `/observations/${encodeURIComponent(existing.observation.id)}`,
        {
          type: encoded.type,
          title: encoded.title,
          content: encoded.content,
          project: encoded.project,
          scope: encoded.scope,
          topic_key: encoded.topic_key,
        },
      );
    } catch (error) {
      return reconcileWrite(ref, normalized, error);
    }

    return confirmWrite(ref, normalized);
  }

  async function list(selector) {
    validateSelector(selector);

    if (selector.cursor !== undefined) {
      throw memoryPortError(
        'unsupported',
        'Engram 1.20.0 repository does not support list cursors',
      );
    }

    const requestedLimit = selector.limit ?? ENGRAM_PROJECT_SCAN_LIMIT;
    if (
      !Number.isInteger(requestedLimit)
      || requestedLimit < 1
      || requestedLimit > ENGRAM_PROJECT_SCAN_LIMIT
    ) {
      throw memoryPortError(
        'invalid',
        `Engram list limit must be between 1 and ${ENGRAM_PROJECT_SCAN_LIMIT}`,
      );
    }

    const project = physicalProject(selector.project_id);
    const params = new URLSearchParams({
      project,
      scope: 'project',
      limit: String(ENGRAM_PROJECT_SCAN_LIMIT + 1),
      sort: 'created_at:desc',
    });

    let raw;
    try {
      raw = await transport.request(
        'GET',
        `/observations?${params.toString()}`,
      );
    } catch (error) {
      throw normalizeEngramError(error);
    }

    const observations = normalizeEngramCollection(raw);
    const projectScanComplete = observations.length <= ENGRAM_PROJECT_SCAN_LIMIT;
    const scan = observations.slice(0, ENGRAM_PROJECT_SCAN_LIMIT);

    const records = scan.map((observation) =>
      decodeObservation(observation, {
        expectedProjectId: selector.project_id,
      }),
    );

    const filtered = selector.kind === undefined
      ? records
      : records.filter((record) => record.kind === selector.kind);

    const limitComplete = filtered.length <= requestedLimit;
    const items = filtered.slice(0, requestedLimit);

    return {
      items,
      complete: projectScanComplete && limitComplete,
    };
  }

  async function search(text, filters = {}) {
    if (typeof text !== 'string' || text.trim() === '') {
      throw memoryPortError('invalid', 'search text must be non-empty');
    }
    if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
      throw memoryPortError('invalid', 'search filters must be an object');
    }
    assertOnlyKeys(
      filters,
      new Set(['project_id', 'kind']),
      'search filters',
    );
    if (
      typeof filters.project_id !== 'string'
      || filters.project_id.trim() === ''
    ) {
      throw memoryPortError(
        'invalid',
        'Engram knowledge discovery requires project_id',
      );
    }
    if (filters.kind !== undefined) {
      assertKind(filters.kind);
    }

    const params = new URLSearchParams({
      q: text.trim(),
      project: physicalProject(filters.project_id),
      scope: 'project',
      limit: String(ENGRAM_MAX_SEARCH_RESULTS),
      match_mode: 'all',
    });

    if (filters.kind !== undefined) {
      params.set('type', physicalType(filters.kind));
    }

    let raw;
    try {
      raw = await transport.request(
        'GET',
        `/search?${params.toString()}`,
      );
    } catch (error) {
      throw normalizeEngramError(error);
    }

    const observations = normalizeEngramCollection(raw);
    const items = [];

    for (const observation of observations) {
      if (observation.project !== physicalProject(filters.project_id)) {
        continue;
      }
      if (observation.scope !== 'project') {
        continue;
      }
      if (
        filters.kind !== undefined
        && observation.type !== physicalType(filters.kind)
      ) {
        continue;
      }

      items.push(decodeObservation(observation, {
        expectedProjectId: filters.project_id,
        expectedKind: filters.kind,
      }));
    }

    return { items };
  }

  function capabilities() {
    return Object.freeze({
      put: true,
      exact_get: true,
      bounded_list: true,
      durable_ack: true,
      project_isolation: true,
      search: true,
      conditional_put: false,
      max_project_scan_items: ENGRAM_PROJECT_SCAN_LIMIT,
      transport: 'engram-http',
    });
  }


  async function findExact(ref) {
    validateRef(ref);

    const params = new URLSearchParams({
      q: physicalTopic(ref.kind, ref.id),
      type: physicalType(ref.kind),
      project: physicalProject(ref.project_id),
      scope: 'project',
      limit: '2',
      match_mode: 'all',
    });

    let raw;
    try {
      raw = await transport.request(
        'GET',
        `/search?${params.toString()}`,
      );
    } catch (error) {
      throw normalizeEngramError(error);
    }

    const exact = normalizeEngramCollection(raw).filter((observation) =>
      isExactPhysicalMatch(observation, ref),
    );

    if (exact.length === 0) return null;

    if (exact.length > 1) {
      throw memoryPortError(
        'ambiguous',
        `Multiple Engram observations match ${ref.kind}/${ref.id}`,
        { matches: exact.length },
      );
    }

    let record;
    try {
      record = decodeObservation(exact[0], {
        expectedProjectId: ref.project_id,
        expectedKind: ref.kind,
        expectedId: ref.id,
      });
    } catch (error) {
      if (error?.code === 'backend_error') {
        throw memoryPortError(
          'ambiguous',
          'Engram physical identity resolved to incompatible logical content',
          { observation_id: exact[0].id },
          error,
        );
      }
      throw error;
    }

    return {
      record,
      observation: exact[0],
    };
  }

  async function confirmWrite(ref, expected) {
    let confirmed;
    try {
      confirmed = await findExact(ref);
    } catch (error) {
      throw normalizeEngramError(error);
    }

    if (confirmed === null) {
      throw memoryPortError(
        'backend_error',
        'Engram acknowledged a write that cannot be read back',
      );
    }

    if (!isDeepStrictEqual(confirmed.record, expected)) {
      throw memoryPortError(
        'ambiguous',
        'Engram readback differs from the requested SDD record',
      );
    }

    return expected;
  }

  async function reconcileWrite(ref, expected, originalError) {
    let reconciled;
    try {
      reconciled = await findExact(ref);
    } catch (readError) {
      if (readError?.code === 'not_found') {
        throw normalizeEngramError(originalError);
      }
      if (readError?.code === 'ambiguous') throw readError;
      throw normalizeEngramError(originalError);
    }

    if (reconciled === null) {
      throw normalizeEngramError(originalError);
    }

    if (isDeepStrictEqual(reconciled.record, expected)) {
      return expected;
    }

    throw memoryPortError(
      'ambiguous',
      'Engram write outcome is ambiguous after reconciliation',
      {},
      originalError,
    );
  }

  return Object.freeze({
    put,
    get,
    list,
    search,
    capabilities,
  });
}

function normalizeInputRecord(record) {
  try {
    return validateRecord(record);
  } catch (error) {
    throw memoryPortError(
      'invalid',
      'SDD record violates the Memory Contract envelope',
      {},
      error,
    );
  }
}

function validateRef(ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) {
    throw memoryPortError('invalid', 'Memory ref must be an object');
  }
  assertOnlyKeys(ref, new Set(['project_id', 'kind', 'id']), 'Memory ref');
  if (
    typeof ref.project_id !== 'string'
    || ref.project_id.trim() === ''
  ) {
    throw memoryPortError('invalid', 'Memory ref.project_id is required');
  }
  assertKind(ref.kind);
  if (typeof ref.id !== 'string' || ref.id === '') {
    throw memoryPortError('invalid', 'Memory ref.id is required');
  }
}

function validateSelector(selector) {
  if (!selector || typeof selector !== 'object' || Array.isArray(selector)) {
    throw memoryPortError('invalid', 'Memory selector must be an object');
  }
  assertOnlyKeys(
    selector,
    new Set(['project_id', 'kind', 'limit', 'cursor']),
    'Memory selector',
  );
  if (
    typeof selector.project_id !== 'string'
    || selector.project_id.trim() === ''
  ) {
    throw memoryPortError('invalid', 'Memory selector.project_id is required');
  }
  if (selector.kind !== undefined) {
    assertKind(selector.kind);
  }
}

function assertOnlyKeys(object, allowed, name) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw memoryPortError(
        'invalid',
        `${name} contains unsupported field: ${key}`,
      );
    }
  }
}

function assertKind(kind) {
  if (!SUPPORTED_KINDS.has(kind)) {
    throw memoryPortError(
      'invalid',
      `Unsupported SDD record kind: ${String(kind)}`,
    );
  }
}

