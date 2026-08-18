import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const MARKER = 'sddrec2';
const HTTP_SENTINEL = '__SDD_HTTP_STATUS__:';
const DEFAULT_CONTAINER = process.env.ENGRAM_CONTAINER || 'sdd-engram';
const DEFAULT_TIMEOUT_MS = 10_000;

// Exact get only needs two rows to distinguish 0 / 1 / ambiguous.
const EXACT_SEARCH_LIMIT = 2;

// list() scans a bounded canonical SDD project bucket using GET /observations,
// not FTS. 20 is deliberately small for the first-Alpha proof and is surfaced
// as a capability rather than hidden.
const MAX_PROJECT_SCAN_ITEMS = 20;
const PROJECT_SCAN_SENTINEL = MAX_PROJECT_SCAN_ITEMS + 1;

const TYPE_BY_KIND = Object.freeze({
  change: 'sdd_change',
  decision: 'sdd_decision',
  evidence: 'sdd_evidence',
  knowledge: 'sdd_knowledge',
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
    httpToken = process.env.ENGRAM_HTTP_TOKEN || '',
  } = {}) {
    this.container = container;
    this.timeoutMs = timeoutMs;
    this.httpToken = httpToken;
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

    if (this.httpToken) {
      args.push(
        '-H',
        `Authorization: Bearer ${this.httpToken}`,
      );
    }

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
        {
          status,
          body: parsed,
          hint: 'If ENGRAM_HTTP_TOKEN is configured in the Engram container, set the same ENGRAM_HTTP_TOKEN for this Node process.',
        },
      );
    }

    if (status === 409) {
      throw new AdapterError(
        'backend_error',
        `Engram HTTP 409 conflict for ${method} ${path}`,
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
      max_project_scan_items: MAX_PROJECT_SCAN_ITEMS,
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

  // Verify protected DELETE access before the spike creates any data.
  // Observation id 0 cannot be a normal SQLite AUTOINCREMENT observation.
  async probeCleanupAccess() {
    try {
      await this.transport.request(
        'DELETE',
        '/observations/0?hard=true',
      );
    } catch (error) {
      if (isAdapterError(error, 'not_found')) {
        return true;
      }
      throw error;
    }

    throw new AdapterError(
      'backend_error',
      'Unexpected success deleting observation #0 during cleanup preflight',
    );
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
      // The response can be lost after Engram committed POST/PATCH.
      // Reconcile only through the exact logical identity.
      try {
        const reconciled = await this.get(refOf(record));
        if (deepEqual(canonicalCore(reconciled.record), desiredCore)) {
          return {
            ...reconciled,
            write_reconciled: true,
          };
        }
      } catch {
        // Preserve write uncertainty below.
      }

      throw new AdapterError(
        'ambiguous',
        `Write outcome is ambiguous for ${record.kind}/${record.id}`,
        {
          cause: error?.message || String(error),
          code: error?.code,
        },
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
    const project = physicalProject(ref.project_id);
    const params = new URLSearchParams({
      q: topicKey,
      type: physicalType(ref.kind),
      project,
      scope: 'project',
      limit: String(EXACT_SEARCH_LIMIT),
      match_mode: 'all',
    });

    const { body } = await this.transport.request(
      'GET',
      `/search?${params.toString()}`,
    );

    const observations = normalizeObservationArray(body);

    const exactByBackend = dedupeByObservationId(
      observations.filter((observation) => (
        observation?.topic_key === topicKey
        && observation?.project === project
        && observation?.scope === 'project'
        && observation?.type === physicalType(ref.kind)
      )),
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
    limit = MAX_PROJECT_SCAN_ITEMS,
  }) {
    if (project_id !== this.projectId) {
      throw new AdapterError(
        'invalid',
        `Adapter bound to project ${this.projectId}, got ${project_id}`,
      );
    }
    requireKind(kind);

    if (
      !Number.isInteger(limit)
      || limit < 1
      || limit > MAX_PROJECT_SCAN_ITEMS
    ) {
      throw new AdapterError(
        'unsupported',
        `list limit must be between 1 and ${MAX_PROJECT_SCAN_ITEMS}`,
      );
    }

    const project = physicalProject(project_id);
    const params = new URLSearchParams({
      project,
      scope: 'project',
      limit: String(PROJECT_SCAN_SENTINEL),
      sort: 'created_at:desc',
    });

    const { body } = await this.transport.request(
      'GET',
      `/observations?${params.toString()}`,
    );

    const observations = normalizeObservationArray(body);
    const scanComplete = observations.length < PROJECT_SCAN_SENTINEL;

    const decoded = [];
    for (const observation of dedupeByObservationId(observations)) {
      if (
        observation?.project !== project
        || observation?.scope !== 'project'
        || observation?.type !== physicalType(kind)
        || typeof observation?.topic_key !== 'string'
        || !observation.topic_key.startsWith(`sdd/v2/${kind}/`)
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

    return {
      items: decoded.slice(0, limit),
      complete: scanComplete && decoded.length <= limit,
      next_cursor: null,
      project_scan_complete: scanComplete,
      project_scan_count: observations.length,
      adapter_bound: MAX_PROJECT_SCAN_ITEMS,
    };
  }

  async deleteRecord(ref) {
    let found;
    try {
      found = await this.get(ref);
    } catch (error) {
      if (isAdapterError(error, 'not_found')) {
        return { already_absent: true };
      }
      throw error;
    }

    const { body } = await this.transport.request(
      'DELETE',
      `/observations/${found.backend_ref.observation_id}?hard=true`,
    );

    if (
      body?.status !== 'deleted'
      || body?.hard_delete !== true
      || body?.id !== found.backend_ref.observation_id
    ) {
      throw new AdapterError(
        'backend_error',
        `Engram did not confirm a hard delete for observation #${found.backend_ref.observation_id}`,
        { body },
      );
    }

    try {
      await this.get(ref);
    } catch (error) {
      if (isAdapterError(error, 'not_found')) {
        return {
          observation_id: found.backend_ref.observation_id,
          hard_deleted: true,
        };
      }
      throw error;
    }

    throw new AdapterError(
      'backend_error',
      `Observation #${found.backend_ref.observation_id} is still recoverable after hard delete`,
    );
  }

  async cleanupSession() {
    if (!this.sessionCreated) {
      return { skipped: true };
    }

    const { body } = await this.transport.request(
      'DELETE',
      `/sessions/${encodeURIComponent(this.sessionId)}`,
    );

    if (
      body?.status !== 'deleted'
      || body?.id !== this.sessionId
    ) {
      throw new AdapterError(
        'backend_error',
        `Engram did not confirm deletion of session ${this.sessionId}`,
        { body },
      );
    }

    this.sessionCreated = false;
    return { deleted: true };
  }

  async ensureSession() {
    if (this.sessionCreated) {
      return;
    }

    const physical = physicalProject(this.projectId);
    const { body } = await this.transport.request('POST', '/sessions', {
      id: this.sessionId,
      project: physical,
      directory: this.directory,
    });

    if (
      body?.status !== 'created'
      || body?.id !== this.sessionId
    ) {
      throw new AdapterError(
        'backend_error',
        `Engram did not confirm creation of session ${this.sessionId}`,
        { body },
      );
    }

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

    if (
      !this.failed
      && method === this.method
      && path === this.path
    ) {
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

function physicalProject(projectId) {
  return `sddv2-${sha256(projectId).slice(0, 24)}`;
}

function physicalTopic(kind, id) {
  // Hashing keeps the physical key stable while avoiding Engram's lowercasing,
  // whitespace collapsing and 120-char truncation from changing logical IDs.
  return `sdd/v2/${kind}/${sha256(id)}`;
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
    project: physicalProject(record.project_id),
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
  const json = JSON.stringify({
    schema_version: 1,
    marker: MARKER,
    project_id: record.project_id,
    kind: record.kind,
    id: record.id,
    ...(record.subject_id ? { subject_id: record.subject_id } : {}),
    payload: record.payload,
  });

  // Engram deliberately rewrites literal <private>...</private> before storing.
  // JSON \u003c escapes parse back to the same logical "<" characters but do
  // not match Engram's raw private-tag regex during persistence.
  return json.replaceAll('<', '\\u003c');
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

  requireKind(stored.kind);

  const expectedProject = physicalProject(stored.project_id);
  const expectedTopic = physicalTopic(stored.kind, stored.id);
  const expectedType = physicalType(stored.kind);

  if (observation.project !== expectedProject) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} physical project does not match its SDD identity`,
      {
        expectedProject,
        actualProject: observation.project,
      },
    );
  }

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

  if (observation.type !== expectedType) {
    throw new AdapterError(
      'invalid',
      `Observation #${observation.id} type does not match its SDD kind`,
      {
        expectedType,
        actualType: observation.type,
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

function normalizeObservationArray(body) {
  // Engram serializes a nil Go slice as JSON null for an empty result set.
  if (body === null) {
    return [];
  }

  if (!Array.isArray(body)) {
    throw new AdapterError(
      'backend_error',
      'Engram observation collection returned an unexpected JSON shape',
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

function sha256(value) {
  return createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex');
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
