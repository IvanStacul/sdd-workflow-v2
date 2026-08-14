import { decodeFromEngram, encodeForEngram, stableMarker } from './sdd-memory.mjs';

const TYPE_MAP = {
  change: 'architecture',
  workunit: 'discovery',
  decision: 'decision',
  knowledge: 'pattern',
  evidence: 'discovery',
  event: 'discovery',
  session_summary: 'learning',
};

function topicKey(record) {
  if (!record.key) return undefined;
  const readable = record.key.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  return `sdd/${readable}`;
}

export class EngramHttpStore {
  constructor({ project, directory = process.cwd(), baseUrl = 'http://127.0.0.1:7437', token = null, sessionId = `sdd-${Date.now()}`, request = null }) {
    this.project = project;
    this.directory = directory;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.sessionId = sessionId;
    this.sessionReady = false;
    this.requestImpl = request;
  }

  async request(method, path, body) {
    if (this.requestImpl) return this.requestImpl(method, path, body);
    const headers = { 'content-type': 'application/json' };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Engram ${method} ${path} failed: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }

  async ensureSession() {
    if (this.sessionReady) return;
    await this.request('POST', '/sessions', {
      id: this.sessionId,
      project: this.project,
      directory: this.directory,
    });
    this.sessionReady = true;
  }

  async put(record) {
    if (!record.key) throw new Error('put requires record.key');
    await this.ensureSession();
    const observation = await this.request('POST', '/observations', {
      session_id: this.sessionId,
      type: TYPE_MAP[record.kind] || 'discovery',
      title: `[SDD:${record.kind}] ${record.key}`,
      content: encodeForEngram(record),
      project: record.project,
      scope: 'project',
      topic_key: topicKey(record),
    });
    return this.toRecord(observation);
  }

  async append(record) {
    await this.ensureSession();
    const observation = await this.request('POST', '/observations', {
      session_id: this.sessionId,
      type: TYPE_MAP[record.kind] || 'discovery',
      title: `[SDD:${record.kind}] ${record.subject || record.id}`,
      content: encodeForEngram(record),
      project: record.project,
      scope: 'project',
    });
    return this.toRecord(observation);
  }

  async get(ref) {
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const observation = await this.request('GET', `/observations/${ref}`);
      return this.toRecord(observation);
    }
    const results = await this.searchByMarker(stableMarker('key', ref));
    return results.find((record) => record.key === ref) || null;
  }

  async query(selector = {}) {
    if (selector.key) {
      const one = await this.get(selector.key);
      return one ? [one] : [];
    }

    let marker = null;
    if (selector.subject) marker = stableMarker('subject', selector.subject);
    else if (selector.kind) marker = stableMarker('kind', selector.kind);

    if (!marker) throw new Error('Engram adapter v0.1 query requires key, subject or kind selector');
    const records = await this.searchByMarker(marker);
    return records
      .filter((record) => !selector.project || record.project === selector.project)
      .filter((record) => !selector.kind || record.kind === selector.kind)
      .filter((record) => !selector.subject || record.subject === selector.subject);
  }

  async search(text, filters = {}) {
    const params = new URLSearchParams({ q: text, project: filters.project || this.project, limit: String(filters.limit || 50) });
    if (filters.type) params.set('type', filters.type);
    const response = await this.request('GET', `/search?${params}`);
    const observations = Array.isArray(response) ? response : response.results || response.observations || [];
    const records = [];
    for (const observation of observations) {
      try { records.push(await this.toRecordFull(observation)); } catch { /* ignore non-SDD observations */ }
    }
    return records;
  }

  async searchByMarker(marker) {
    return this.search(marker, { project: this.project, limit: 100 });
  }

  async toRecordFull(observation) {
    const full = await this.request('GET', `/observations/${observation.id}`);
    return decodeFromEngram(full.content);
  }

  async toRecord(observation) {
    if (!observation) return null;
    return this.toRecordFull(observation);
  }
}
