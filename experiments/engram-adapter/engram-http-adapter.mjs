import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const MARKER = 'sddrec2';
const HTTP_SENTINEL = '__SDD_HTTP_STATUS__:';
const DEFAULT_CONTAINER = process.env.ENGRAM_CONTAINER || 'sdd-engram';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_COMPLETE_LIST = 19;
const SEARCH_SENTINEL_LIMIT = 20;

const TYPE_BY_KIND = Object.freeze({
  change: 'architecture',
  decision: 'decision',
  evidence: 'manual',
  knowledge: 'pattern',
});

export class AdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
  }
}

export class DockerEngramHttpTransport {
  constructor({
    container = DEFAULT_CONTAINER,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.container = container;
    this.timeoutMs = timeoutMs;
  }

  async request(method, path, body = undefined) {
    const timeoutSeconds = Math.max(1, Math.ceil(this.timeoutMs / 1000));
    const url = `http://127.0.0.1:7437${path}`;

    const args = [
      'exec',
      '-i',
      this.container,
      'curl',
      '-sS',
      '--max-time',
      String(timeoutSeconds),
      '-X',
      method,
      '-H',
      'Accept: application/json',
      '-w',
      `\n${HTTP_SENTINEL}%{http_code}`,
    ];

    if (body !== undefined) {
      args.push(
        '-H',
        'Content-Type: application/json',
        '--data-binary',
        '@-',
      );
    }

    args.push(url);

    const result = await runProcess('docker', args, {
      stdin: body === undefined ? '' : JSON.stringify(body),
      timeoutMs: this.timeoutMs + 2_000,
    });

    if (result.exitCode !== 0) {
      throw new AdapterError(
        'unavailable',
        `docker/curl failed for ${method} ${path}`,
        {
          exitCode: result.exitCode,
          stderr: result.stderr.trim(),
          container: this.container,
        },
      );
    }

    const markerIndex = result.stdout.lastIndexOf(`\n${HTTP_SENTINEL}`);
    if (markerIndex < 0) {
      throw new AdapterError(
        'backend_error',
        `HTTP status marker missing for ${method} ${path}`,
        { stdout: result.stdout },
      );
    }

    const rawBody = result.stdout.slice(0, markerIndex).trim();
    const rawStatus = result.stdout
      .slice(markerIndex + 1 + HTTP_SENTINEL.length)
      .trim();
    const status = Number(rawStatus);

    let parsed = null;
    if (rawBody !== '') {
      try {
        parsed = JSON.parse(rawBody);
      } catch (error) {
        throw new AdapterError(
          'backend_error',
          `Engram returned non-JSON body for ${method} ${path}`,
          { rawBody, status, cause: error.message },
        );
      }
    }

    if (status >= 200 && status < 300) {
      return { status, body: parsed };
    }

    if (status === 404) {
      throw new AdapterError('not_found', `Engram resource not found: ${path}`, {
        status,
        body: parsed,
      });
    }

    if (status === 401 || status === 403) {
      throw new AdapterError(
        'unsupported',
        `Engram HTTP authorization blocks ${method} ${path}`,
        { status, body: parsed },
      );
    }

    throw new AdapterError(
      'backend_error',
      `Engram HTTP ${status} for ${method} ${path}`,
      { status, body: parsed },
    );
  }
}

export class EngramHttpAdapter {
  constructor({
    projectId,
    transport = new DockerEngramHttpTransport(),
    sessionId = `sdd-adapter-${randomUUID()}`,
    directory = '/sdd-adapter-spike',
  }) {
    requireNonEmpty(projectId, 'projectId');
    this.projectId = projectId;
    this.transport = transport;
    this.sessionId = sessionId;
    this.directory = directory;
    this.sessionCreated = false;
  }

  capabilities() {
    return {
      put: true,
      exact_get: true,
      bounded_list: true,
      durable_ack: true,
      project_isolation: true,
      search: true,
      conditional_put: false,
      max_complete_list_items: MAX_COMPLETE_LIST,
      transport: 'engram-http-via-docker-exec',
    };
  }

  async health() {
    const { body } = await this.transport.request('GET', '/health');
    if (body?.status !== 'ok' || body?.service !== 'engram') {
      throw new AdapterError('backend_error', 'Unexpected Engram health payload', {
        body,
      });
    }
    return body;
  }

  async put(record) {
    validateRecord(record, this.projectId);
    const desiredCore = canonicalCore(record);

    let existing = null;
    try {
      existing = await this.get(refOf(record));
    } catch (error) {
      if (!isAdapterError(error, 'not_found')) {
        throw error;
      }
    }

    try {
      if (existing) {
        await this.transport.request(
          'PATCH',
          `/observations/${existing.backend_ref.observation_id}`,
          encodePatch(record),
        );
      } else {
        await this.ensureSession();
        await this.transport.request(
          'POST',
          '/observations',
          encodeCreate(record, this.sessionId),
        );
      }
    } catch (error) {
      // A transport failure can happen after Engram committed the write.
      // Reconcile by exact logical identity before declaring failure.
      if (
        !isAdapterError(error, 'unavailable')
        && !isAdapterError(error, 'backend_error')
      ) {
        throw error;
      }

      try {
        const reconciled = await this.get(refOf(record));
        if (deepEqual(canonicalCore(reconciled.record), desiredCore)) {
          return {
            ...reconciled,
            write_reconciled: true,
          };
        }
      } catch {
        // Preserve the original write uncertainty below.
      }

      throw new AdapterError(
        'ambiguous',
        `Write outcome is ambiguous for ${record.kind}/${record.id}`,
        { cause: error.message, code: error.code },
      );
    }

    const confirmed = await this.get(refOf(record));
    if (!deepEqual(canonicalCore(confirmed.record), desiredCore)) {
      throw new AdapterError(
        'ambiguous',
        `Read-after-write mismatch for ${record.kind}/${record.id}`,
        {
          expected: desiredCore,
          actual: canonicalCore(confirmed.record),
        },
      );
    }

    return {
      ...confirmed,
      write_reconciled: false,
    };
  }

  async get(ref) {
    validateRef(ref, this.projectId);

    const topicKey = physicalTopic(ref.kind, ref.id);
    const params = new URLSearchParams({
      q: topicKey,
      project: ref.project_id,
      scope: 'project',
      limit: String(SEARCH_SENTINEL_LIMIT),
      match_mode: 'all',
    });

    const { body } = await this.transport.request(
      'GET',
      `/search?${params.toString()}`,
    );

    const observations = normalizeSearchResults(body);

    const exactByBackend = dedupeByObservationId(
      observations.filter((observation) => {
        return (
          observation?.topic_key === topicKey
          && observation?.project === ref.project_id
          && observation?.scope === 'project'
        );
      }),
    );

    const decoded = [];
    for (const observation of exactByBackend) {
      const candidate = decodeObservation(observation);
      if (
        candidate.record.project_id === ref.project_id
        && candidate.record.kind === ref.kind
        && candidate.record.id === ref.id
      ) {
        decoded.push(candidate);
      }
    }

    if (decoded.length === 0) {
      throw new AdapterError(
        'not_found',
        `Record not found: ${ref.project_id}/${ref.kind}/${ref.id}`,
      );
    }

    if (decoded.length > 1) {
      throw new AdapterError(
        'ambiguous',
        `Multiple exact records found: ${ref.project_id}/${ref.kind}/${ref.id}`,
        {
          observation_ids: decoded.map(
            (item) => item.backend_ref.observation_id,
          ),
        },
      );
    }

    return decoded[0];
  }

  async list({
    project_id,
    kind,
    limit = MAX_COMPLETE_LIST,
  }) {
    if (project_id !== this.projectId) {
      throw new AdapterError(
        'invalid',
        `Adapter bound to project ${this.projectId}, got ${project_id}`,
      );
    }
    requireKind(kind);

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMPLETE_LIST) {
      throw new AdapterError(
        'unsupported',
        `list limit must be between 1 and ${MAX_COMPLETE_LIST}`,
      );
    }

    const queryLimit = Math.min(limit + 1, SEARCH_SENTINEL_LIMIT);
    const params = new URLSearchParams({
      q: `${MARKER} ${kind}`,
      type: physicalType(kind),
      project: project_id,
      scope: 'project',
      limit: String(queryLimit),
      match_mode: 'all',
    });

    const { body } = await this.transport.request(
      'GET',
      `/search?${params.toString()}`,
    );

    const observations = normalizeSearchResults(body);

    const decoded = [];
    for (const observation of dedupeByObservationId(observations)) {
      if (
        observation?.project !== project_id
        || observation?.scope !== 'project'
      ) {
        continue;
      }

      const item = decodeObservation(observation);
      if (
        item.record.project_id === project_id
        && item.record.kind === kind
      ) {
        decoded.push(item);
      }
    }

    // If Engram filled the sentinel query window, we cannot prove that no more
    // matching records exist because this endpoint has no cursor/total.
    const complete = observations.length < queryLimit;

    return {
      items: decoded.slice(0, limit),
      complete: complete && decoded.length <= limit,
      next_cursor: null,
      adapter_bound: MAX_COMPLETE_LIST,
      candidate_count: observations.length,
    };
  }

  async deleteRecord(ref) {
    const found = await this.get(ref);
    await this.transport.request(
      'DELETE',
      `/observations/${found.backend_ref.observation_id}`,
    );
  }

  async cleanupSession() {
    if (!this.sessionCreated) {
      return;
    }
    await this.transport.request(
      'DELETE',
      `/sessions/${encodeURIComponent(this.sessionId)}`,
    );
    this.sessionCreated = false;
  }

  async ensureSession() {
    if (this.sessionCreated) {
      return;
    }

    await this.transport.request('POST', '/sessions', {
      id: this.sessionId,
      project: this.projectId,
      directory: this.directory,
    });
    this.sessionCreated = true;
  }
}

export class FailOnceAfterCommitTransport {
  constructor(inner, {
    method = 'POST',
    path = '/observations',
  } = {}) {
    this.inner = inner;
    this.method = method;
    this.path = path;
    this.failed = false;
  }

  async request(method, path, body) {
    const result = await this.inner.request(method, path, body);

    if (!this.failed && method === this.method && path === this.path) {
      this.failed = true;
      throw new AdapterError(
        'unavailable',
        `Simulated lost response after committed ${method} ${path}`,
      );
    }

    return result;
  }
}

export function refOf(record) {
  return {
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
  };
}

function physicalTopic(kind, id) {
  return `sdd/v2/${kind}/${id.toLowerCase()}`;
}

function physicalType(kind) {
  requireKind(kind);
  return TYPE_BY_KIND[kind];
}

function encodeCreate(record, sessionId) {
  return {
    session_id: sessionId,
    type: physicalType(record.kind),
    title: physicalTitle(record),
    content: serializeRecord(record),
    project: record.project_id,
    scope: 'project',
    topic_key: physicalTopic(record.kind, record.id),
  };
}

function encodePatch(record) {
  return {
    type: physicalType(record.kind),
    title: physicalTitle(record),
    content: serializeRecord(record),
    scope: 'project',
    topic_key: physicalTopic(record.kind, record.id),
  };
}

function physicalTitle(record) {
  const humanTitle = String(record.payload?.title || record.id).trim();
  return `${MARKER} ${record.kind} ${record.id} :: ${humanTitle}`;
}

function serializeRecord(record) {
  return JSON.stringify({
    schema_version: 1,
    marker: MARKER,
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
    ...(record.subject_id ? { subject_id: record.subject_id } : {}),
    payload: record.payload,
  });
}

function decodeObservation(observation) {
  let stored;
  try {
    stored = JSON.parse(observation.content);
  } catch (error) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} contains invalid SDD JSON`,
      { cause: error.message },
    );
  }

  if (
    stored?.schema_version !== 1
    || stored?.marker !== MARKER
    || typeof stored?.project_id !== 'string'
    || typeof stored?.kind !== 'string'
    || typeof stored?.id !== 'string'
    || !stored?.payload
  ) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} is not a valid ${MARKER} record`,
      { stored },
    );
  }

  const expectedTopic = physicalTopic(stored.kind, stored.id);
  if (observation.topic_key !== expectedTopic) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} topic_key does not match its SDD identity`,
      {
        expectedTopic,
        actualTopic: observation.topic_key,
      },
    );
  }

  if (observation.project !== stored.project_id) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} project does not match its SDD payload`,
      {
        observationProject: observation.project,
        recordProject: stored.project_id,
      },
    );
  }

  return {
    record: {
      schema_version: 1,
      project_id: stored.project_id,
      kind: stored.kind,
      id: stored.id,
      ...(stored.subject_id ? { subject_id: stored.subject_id } : {}),
      payload: stored.payload,
      created_at: observation.created_at,
      updated_at: observation.updated_at,
    },
    backend_ref: {
      observation_id: observation.id,
      sync_id: observation.sync_id,
      topic_key: observation.topic_key,
      revision_count: observation.revision_count,
    },
  };
}

function canonicalCore(record) {
  return {
    schema_version: 1,
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
    ...(record.subject_id ? { subject_id: record.subject_id } : {}),
    payload: record.payload,
  };
}

function validateRecord(record, expectedProject) {
  if (!record || typeof record !== 'object') {
    throw new AdapterError('invalid', 'record must be an object');
  }

  if (record.project_id !== expectedProject) {
    throw new AdapterError(
      'invalid',
      `Adapter bound to project ${expectedProject}, got ${record.project_id}`,
    );
  }

  requireKind(record.kind);
  requireNonEmpty(record.id, 'record.id');

  if (!record.payload || typeof record.payload !== 'object') {
    throw new AdapterError('invalid', 'record.payload must be an object');
  }
}

function validateRef(ref, expectedProject) {
  if (!ref || typeof ref !== 'object') {
    throw new AdapterError('invalid', 'ref must be an object');
  }

  if (ref.project_id !== expectedProject) {
    throw new AdapterError(
      'invalid',
      `Adapter bound to project ${expectedProject}, got ${ref.project_id}`,
    );
  }

  requireKind(ref.kind);
  requireNonEmpty(ref.id, 'ref.id');
}

function requireKind(kind) {
  if (!Object.hasOwn(TYPE_BY_KIND, kind)) {
    throw new AdapterError(
      'invalid',
      `Unsupported SDD record kind: ${String(kind)}`,
    );
  }
}

function requireNonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AdapterError('invalid', `${name} must be a non-empty string`);
  }
}

function normalizeSearchResults(body) {
  // Engram's HTTP handler serializes a nil Go slice as JSON `null` when a
  // search has no matches. Semantically that is an empty result set, not a
  // backend error.
  if (body === null) {
    return [];
  }

  if (!Array.isArray(body)) {
    throw new AdapterError(
      'backend_error',
      'Engram search returned an unexpected JSON shape',
      { body },
    );
  }

  return body;
}

function dedupeByObservationId(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isAdapterError(error, code) {
  return error instanceof AdapterError && error.code === code;
}

function runProcess(command, args, {
  stdin = '',
  timeoutMs = 12_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(
        new AdapterError(
          'unavailable',
          `${command} timed out after ${timeoutMs}ms`,
          { args },
        ),
      );
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      reject(
        new AdapterError(
          'unavailable',
          `Failed to start ${command}`,
          { cause: error.message, args },
        ),
      );
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve({ exitCode, stdout, stderr });
    });

    child.stdin.end(stdin);
  });
}
