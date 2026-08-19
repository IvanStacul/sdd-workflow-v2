import {
  EngramHttpError,
  EngramTransportError,
} from '../../src/adapters/engram/transport.mjs';

export class FakeEngramTransport {
  constructor() {
    this.sessions = new Map();
    this.observations = [];
    this.nextObservationId = 1;
    this.failures = [];
    this.calls = [];
    this.emptyCollectionsAsNull = false;
  }

  failNext({
    method,
    pathPrefix,
    afterCommit = false,
    error = new EngramTransportError(
      'unavailable',
      'Injected transport failure',
    ),
  }) {
    this.failures.push({
      method,
      pathPrefix,
      afterCommit,
      error,
    });
  }

  injectObservation(observation) {
    this.observations.push(structuredClone(observation));
    this.nextObservationId = Math.max(
      this.nextObservationId,
      Number(observation.id) + 1,
    );
  }

  async request(method, path, body) {
    this.calls.push({
      method,
      path,
      body: body === undefined ? undefined : structuredClone(body),
    });

    const failure = this.#takeFailure(method, path, false);
    if (failure) throw failure.error;

    const response = this.#handle(method, path, body);

    const after = this.#takeFailure(method, path, true);
    if (after) throw after.error;

    return structuredClone(response);
  }

  #handle(method, path, body) {
    const url = new URL(path, 'http://fake');

    if (method === 'GET' && url.pathname === '/health') {
      return {
        status: 'ok',
        service: 'engram',
        version: '0.1.0',
      };
    }

    if (method === 'GET' && url.pathname.startsWith('/sessions/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1));
      const session = this.sessions.get(id);
      if (!session) {
        throw new EngramHttpError(404, 'session not found', {
          error: 'session not found',
        });
      }
      return session;
    }

    if (method === 'POST' && url.pathname === '/sessions') {
      const existing = this.sessions.get(body.id);
      if (existing) {
        if (!existing.project) existing.project = body.project;
        if (!existing.directory) existing.directory = body.directory;
      } else {
        this.sessions.set(body.id, {
          id: body.id,
          project: normalizeProject(body.project),
          directory: body.directory ?? '',
          started_at: '2026-01-01 00:00:00',
        });
      }
      return { id: body.id, status: 'created' };
    }

    if (method === 'POST' && url.pathname === '/observations') {
      const session = this.sessions.get(body.session_id);
      if (!session) {
        throw new EngramHttpError(404, 'session not found');
      }
      if (session.project !== normalizeProject(body.project)) {
        throw new EngramHttpError(
          409,
          'session project does not match observation project',
        );
      }

      const project = normalizeProject(body.project);
      const topicKey = normalizeTopicKey(body.topic_key);
      const scope = body.scope || 'project';

      let observation = this.observations.find((item) =>
        item.deleted_at == null
        && item.project === project
        && item.scope === scope
        && item.topic_key === topicKey,
      );

      if (observation) {
        Object.assign(observation, {
          type: body.type,
          title: stripPrivate(body.title),
          content: transformContent(body.content),
          topic_key: topicKey,
          revision_count: (observation.revision_count ?? 1) + 1,
          updated_at: '2026-01-01 00:00:01',
        });
      } else {
        observation = {
          id: this.nextObservationId++,
          sync_id: `sync-${this.nextObservationId}`,
          session_id: body.session_id,
          type: body.type,
          title: stripPrivate(body.title),
          content: transformContent(body.content),
          project,
          scope,
          topic_key: topicKey,
          revision_count: 1,
          duplicate_count: 1,
          created_at: '2026-01-01 00:00:00',
          updated_at: '2026-01-01 00:00:00',
          deleted_at: null,
        };
        this.observations.push(observation);
      }

      return { id: observation.id, status: 'saved' };
    }

    if (method === 'PATCH' && url.pathname.startsWith('/observations/')) {
      const id = Number(url.pathname.split('/').at(-1));
      const observation = this.observations.find((item) =>
        item.id === id && item.deleted_at == null,
      );
      if (!observation) {
        throw new EngramHttpError(404, 'observation not found');
      }

      if (body.type !== undefined) observation.type = body.type;
      if (body.title !== undefined) {
        observation.title = stripPrivate(body.title);
      }
      if (body.content !== undefined) {
        observation.content = transformContent(body.content);
      }
      if (body.project !== undefined) {
        observation.project = normalizeProject(body.project);
      }
      if (body.scope !== undefined) observation.scope = body.scope;
      if (body.topic_key !== undefined) {
        observation.topic_key = normalizeTopicKey(body.topic_key);
      }
      observation.revision_count += 1;
      observation.updated_at = '2026-01-01 00:00:02';

      return observation;
    }

    if (method === 'GET' && url.pathname === '/search') {
      const query = url.searchParams.get('q');
      if (!query) {
        throw new EngramHttpError(400, 'q parameter is required');
      }

      const project = url.searchParams.get('project');
      const type = url.searchParams.get('type');
      const scope = url.searchParams.get('scope');
      const limit = Math.min(
        Number(url.searchParams.get('limit') || 10),
        20,
      );

      const direct = this.observations.filter((item) =>
        item.deleted_at == null
        && item.topic_key === normalizeTopicKey(query)
        && (!project || item.project === normalizeProject(project))
        && (!type || item.type === type)
        && (!scope || item.scope === scope),
      );

      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const fts = this.observations.filter((item) => {
        if (item.deleted_at != null) return false;
        if (project && item.project !== normalizeProject(project)) return false;
        if (type && item.type !== type) return false;
        if (scope && item.scope !== scope) return false;

        const haystack = `${item.title}\n${item.content}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });

      const seen = new Set();
      const result = [...direct, ...fts].filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }).slice(0, limit);

      if (result.length === 0 && this.emptyCollectionsAsNull) {
        return null;
      }
      return result;
    }

    if (method === 'GET' && url.pathname === '/observations') {
      const project = url.searchParams.get('project');
      const scope = url.searchParams.get('scope');
      const limit = Number(url.searchParams.get('limit') || 20);

      const items = this.observations
        .filter((item) =>
          item.deleted_at == null
          && (!project || item.project === normalizeProject(project))
          && (!scope || item.scope === scope),
        )
        .slice()
        .reverse()
        .slice(0, limit);

      if (items.length === 0 && this.emptyCollectionsAsNull) {
        return null;
      }
      return items;
    }

    if (method === 'DELETE' && url.pathname.startsWith('/observations/')) {
      const id = Number(url.pathname.split('/').at(-1));
      const index = this.observations.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new EngramHttpError(404, 'observation not found');
      }
      this.observations.splice(index, 1);
      return {
        id,
        status: 'deleted',
        hard_delete: url.searchParams.get('hard') === 'true',
      };
    }

    if (method === 'DELETE' && url.pathname.startsWith('/sessions/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1));
      if (!this.sessions.has(id)) {
        throw new EngramHttpError(404, 'session not found');
      }
      this.sessions.delete(id);
      return { id, status: 'deleted' };
    }

    throw new EngramHttpError(
      404,
      `Unhandled fake route: ${method} ${path}`,
    );
  }

  #takeFailure(method, path, afterCommit) {
    const index = this.failures.findIndex((failure) =>
      failure.method === method
      && path.startsWith(failure.pathPrefix)
      && failure.afterCommit === afterCommit,
    );

    if (index < 0) return null;
    return this.failures.splice(index, 1)[0];
  }
}

function normalizeProject(project) {
  return String(project)
    .trim()
    .toLowerCase()
    .replace(/[-_]{2,}/g, (value) => value[0]);
}

function normalizeTopicKey(topic) {
  return String(topic)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .slice(0, 120);
}

function stripPrivate(value) {
  return String(value).replace(
    /<private>[\s\S]*?<\/private>/gi,
    '',
  );
}

function transformContent(value) {
  const stripped = stripPrivate(value);
  if (Buffer.byteLength(stripped, 'utf8') <= 50000) {
    return stripped;
  }
  return `${Buffer.from(stripped, 'utf8')
    .subarray(0, 50000)
    .toString('utf8')}... [truncated]`;
}
