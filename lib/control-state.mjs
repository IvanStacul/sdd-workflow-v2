import fs from 'node:fs';
import path from 'node:path';

export const CONTROL_SCHEMA = 1;
export const ALLOCATOR_SCHEMA = 1;

export function statePath(target) {
  return path.join(target, '.sdd', 'state.json');
}

export function newControlState(projectId) {
  return {
    schema_version: CONTROL_SCHEMA,
    managed_by: 'sdd-v2',
    project_id: projectId,
    changes: {},
    allocator: {
      schema_version: ALLOCATOR_SCHEMA,
      initialized: false,
      high_watermarks: {},
    },
  };
}

export function readControlState(target) {
  const file = statePath(target);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.managed_by !== 'sdd-v2') throw new Error(`Unsupported control state owner in ${file}`);
  if (Number(value.schema_version) !== CONTROL_SCHEMA) throw new Error(`Unsupported control state schema ${value.schema_version}`);
  if (!value.changes || typeof value.changes !== 'object' || Array.isArray(value.changes)) value.changes = {};
  return value;
}

export function ensureControlState(target, projectId, { legacyIds = null } = {}) {
  const existing = readControlState(target);
  if (existing) {
    if (existing.project_id !== projectId) throw new Error(`Control state project_id ${existing.project_id} does not match config project_id ${projectId}`);
    if (!isAllocatorInitialized(existing)) {
      if (!Array.isArray(legacyIds)) throw new Error('Cannot establish the Change ID namespace safely; bootstrap legacy IDs before opening a Change.');
      seedChangeIdNamespace(existing, legacyIds);
      writeControlState(target, existing);
      return { state: existing, created: false, allocatorBootstrapped: true };
    }
    return { state: existing, created: false, allocatorBootstrapped: false };
  }
  if (!Array.isArray(legacyIds)) throw new Error('Cannot establish the Change ID namespace safely; bootstrap legacy IDs before opening a Change.');
  const state = newControlState(projectId);
  seedChangeIdNamespace(state, legacyIds);
  writeControlState(target, state);
  return { state, created: true, allocatorBootstrapped: true };
}

export function writeControlState(target, state) {
  const file = statePath(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

export function allocateChangeId(state, now = new Date()) {
  if (!isAllocatorInitialized(state)) throw new Error('Change ID allocator is not initialized; bootstrap the legacy namespace before opening a Change.');
  const date = localDateStamp(now);
  let max = Number(state.allocator.high_watermarks[date] ?? 0);
  for (const id of Object.keys(state.changes ?? {})) {
    const match = id.match(new RegExp(`^CHG-${date}-(\\d{2,})$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `CHG-${date}-${String(max + 1).padStart(2, '0')}`;
}

export function openChange(state, { slug, title, intent, now = new Date() }) {
  const id = allocateChangeId(state, now);
  const timestamp = now.toISOString();
  const record = {
    id,
    slug,
    title: title || slug,
    intent,
    status: 'open',
    topic_key: `sdd-change/${id}`,
    memory_ref: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
  state.changes[id] = record;
  updateHighWatermark(state, id);
  return record;
}

export function registerChange(state, { id, slug, title, intent, memoryRef = null, now = new Date() }) {
  if (!/^CHG-\d{8}-\d{2,}$/.test(id)) throw new Error(`Invalid canonical Change ID: ${id}`);
  if (state.changes[id]) throw new Error(`Change ${id} already exists in control state.`);
  const timestamp = now.toISOString();
  const record = {
    id,
    slug,
    title: title || slug,
    intent,
    status: 'open',
    topic_key: `sdd-change/${id}`,
    memory_ref: memoryRef ? String(memoryRef) : null,
    created_at: timestamp,
    updated_at: timestamp,
    imported_legacy: true,
  };
  state.changes[id] = record;
  updateHighWatermark(state, id);
  return record;
}

export function isAllocatorInitialized(state) {
  return state?.allocator?.schema_version === ALLOCATOR_SCHEMA
    && state.allocator.initialized === true
    && state.allocator.high_watermarks
    && typeof state.allocator.high_watermarks === 'object'
    && !Array.isArray(state.allocator.high_watermarks);
}

export function seedChangeIdNamespace(state, legacyIds = []) {
  if (!Array.isArray(legacyIds)) throw new Error('Legacy Change IDs must be an array.');
  const highWatermarks = {};
  for (const id of [...Object.keys(state.changes ?? {}), ...legacyIds]) {
    const match = String(id).match(/^CHG-(\d{8})-(\d{2,})$/);
    if (!match) continue;
    highWatermarks[match[1]] = Math.max(highWatermarks[match[1]] ?? 0, Number(match[2]));
  }
  state.allocator = {
    schema_version: ALLOCATOR_SCHEMA,
    initialized: true,
    high_watermarks: highWatermarks,
  };
  return state;
}

export function bindMemoryRef(state, id, memoryRef, now = new Date()) {
  const change = requireChange(state, id);
  change.memory_ref = String(memoryRef);
  change.updated_at = now.toISOString();
  return change;
}

export function closeChange(state, id, { reason, evidence, evidenceRef, now = new Date() }) {
  const change = requireChange(state, id);
  if (change.status !== 'open') throw new Error(`Change ${id} is already closed.`);
  const allowed = new Set(['completed', 'cancelled', 'superseded', 'split']);
  if (!allowed.has(reason)) throw new Error(`Invalid close reason: ${reason}`);
  if (reason === 'completed' && !evidence && !evidenceRef) {
    throw new Error(`Completed Change ${id} requires observed evidence or an evidence reference.`);
  }
  const timestamp = now.toISOString();
  change.status = 'closed';
  change.close_reason = reason;
  change.closed_at = timestamp;
  change.updated_at = timestamp;
  if (evidence) change.closure_evidence = String(evidence);
  if (evidenceRef) change.evidence_ref = String(evidenceRef);
  return change;
}

export function listChanges(state, { status = null } = {}) {
  const all = Object.values(state.changes ?? {});
  const filtered = status ? all.filter((item) => item.status === status) : all;
  return filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function requireChange(state, id) {
  const value = state.changes?.[id];
  if (!value) throw new Error(`Unknown Change: ${id}`);
  return value;
}

function localDateStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function updateHighWatermark(state, id) {
  const match = String(id).match(/^CHG-(\d{8})-(\d{2,})$/);
  if (!match) return;
  state.allocator.high_watermarks[match[1]] = Math.max(
    state.allocator.high_watermarks[match[1]] ?? 0,
    Number(match[2]),
  );
}
