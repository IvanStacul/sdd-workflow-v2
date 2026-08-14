import { createHash, randomUUID } from 'node:crypto';

const CANONICAL_KINDS = new Set(['change', 'workunit', 'knowledge']);
const APPEND_KINDS = new Set(['decision', 'evidence', 'event', 'session_summary']);

export function stableMarker(prefix, value) {
  const hash = createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
  return `sdd${String(prefix).replace(/[^a-z0-9]/gi, '')}${hash}`;
}

export function makeRecord({ kind, project, key = null, subject = null, payload, id = randomUUID(), now = new Date().toISOString() }) {
  if (!kind || !project || payload === undefined) throw new Error('kind, project and payload are required');
  return { id, kind, project, key, subject, payload, created_at: now, updated_at: now };
}

export function canonicalRecord(args) {
  if (!args.key) throw new Error('canonical record requires key');
  if (!CANONICAL_KINDS.has(args.kind)) throw new Error(`kind ${args.kind} is not canonical in v0.1`);
  return makeRecord(args);
}

export function historicalRecord(args) {
  if (!APPEND_KINDS.has(args.kind)) throw new Error(`kind ${args.kind} is not append-only in v0.1`);
  return makeRecord({ ...args, key: null });
}

export class InMemoryStore {
  constructor() {
    this.records = [];
  }

  async put(record) {
    if (!record.key) throw new Error('put requires record.key');
    const index = this.records.findIndex((item) => item.project === record.project && item.key === record.key);
    if (index === -1) {
      this.records.push(structuredClone(record));
      return structuredClone(record);
    }
    const previous = this.records[index];
    const next = {
      ...structuredClone(record),
      id: previous.id,
      created_at: previous.created_at,
      updated_at: record.updated_at || new Date().toISOString(),
    };
    this.records[index] = next;
    return structuredClone(next);
  }

  async append(record) {
    if (record.key) throw new Error('append records must not have a canonical key');
    this.records.push(structuredClone(record));
    return structuredClone(record);
  }

  async get(ref) {
    const found = this.records.find((item) => item.id === ref || item.key === ref);
    return found ? structuredClone(found) : null;
  }

  async query(selector = {}) {
    return this.records
      .filter((item) => !selector.project || item.project === selector.project)
      .filter((item) => !selector.kind || item.kind === selector.kind)
      .filter((item) => !selector.subject || item.subject === selector.subject)
      .filter((item) => !selector.key || item.key === selector.key)
      .map((item) => structuredClone(item));
  }

  async search(text, filters = {}) {
    const needle = String(text).toLowerCase();
    const candidates = await this.query(filters);
    return candidates.filter((item) => JSON.stringify(item).toLowerCase().includes(needle));
  }
}

export class SddMemory {
  constructor(store, project) {
    this.store = store;
    this.project = project;
  }

  async saveChange(change) {
    return this.store.put(canonicalRecord({
      kind: 'change',
      project: this.project,
      key: `change:${change.id}`,
      subject: change.id,
      payload: change,
    }));
  }

  async saveWorkUnit(changeId, workUnit) {
    return this.store.put(canonicalRecord({
      kind: 'workunit',
      project: this.project,
      key: `workunit:${changeId}:${workUnit.id}`,
      subject: changeId,
      payload: workUnit,
    }));
  }

  async appendDecision(changeId, decision) {
    return this.store.append(historicalRecord({
      kind: 'decision', project: this.project, subject: changeId, payload: decision,
    }));
  }

  async appendEvidence(workUnitId, evidence) {
    return this.store.append(historicalRecord({
      kind: 'evidence', project: this.project, subject: workUnitId, payload: evidence,
    }));
  }

  async promoteKnowledge(key, knowledge) {
    return this.store.put(canonicalRecord({
      kind: 'knowledge', project: this.project, key: `knowledge:${key}`, subject: null, payload: knowledge,
    }));
  }

  async currentChange(changeId) {
    return this.store.get(`change:${changeId}`);
  }

  async executionFrontier(changeId) {
    const units = await this.store.query({ project: this.project, kind: 'workunit', subject: changeId });
    const done = new Set(units.filter((unit) => unit.payload.status === 'done').map((unit) => unit.payload.id));
    return units.filter((unit) => {
      if (unit.payload.status !== 'ready') return false;
      return (unit.payload.depends_on || []).every((dep) => done.has(dep));
    });
  }
}

export function encodeForEngram(record) {
  const markers = [
    stableMarker('kind', record.kind),
    record.key ? stableMarker('key', record.key) : null,
    record.subject ? stableMarker('subject', record.subject) : null,
  ].filter(Boolean);

  return [
    'SDD_V2_RECORD',
    ...markers,
    JSON.stringify(record),
  ].join('\n');
}

export function decodeFromEngram(content) {
  const lines = String(content).split('\n');
  const jsonLine = lines.findLast((line) => line.trim().startsWith('{'));
  if (!jsonLine) throw new Error('Engram observation does not contain an SDD record');
  return JSON.parse(jsonLine);
}
