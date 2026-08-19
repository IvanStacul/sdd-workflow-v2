import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeObservation,
  encodeRecord,
  ENGRAM_MAX_OBSERVATION_BYTES,
  physicalProject,
  physicalSessionId,
  physicalTopic,
  physicalType,
} from '../../src/adapters/engram/codec.mjs';
import { makeRecord } from '../../src/domain/record.mjs';
import { MemoryPortError } from '../../src/ports/memory.mjs';

const CHG = 'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW';

function sampleRecord(overrides = {}) {
  return makeRecord({
    projectId: overrides.projectId ?? 'Project--A',
    kind: 'change',
    id: CHG,
    payload: overrides.payload ?? {
      title: 'Private boundary',
      intent: 'Preserve <private>literal</private> content.',
      lifecycle: 'open',
      continuity: { next: 'Act.' },
    },
  });
}

test('physical project preserves logical identity across Engram normalization', () => {
  const a = physicalProject('Project--A');
  const b = physicalProject('project-A');
  const c = physicalProject('project__a');

  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^sddv2-[0-9a-f]{24}$/);
});

test('physical topic is deterministic, normalized-safe, and below Engram limit', () => {
  const topic = physicalTopic('change', CHG);

  assert.equal(topic, physicalTopic('change', CHG));
  assert.match(topic, /^sdd\/v2\/change\/[0-9a-f]{64}$/);
  assert(topic.length < 120);
  assert.equal(physicalType('change'), 'sdd_change');
});

test('physical session is deterministic per logical project', () => {
  assert.equal(
    physicalSessionId('Project--A'),
    physicalSessionId('Project--A'),
  );
  assert.notEqual(
    physicalSessionId('Project--A'),
    physicalSessionId('project-A'),
  );
});

test('encoding neutralizes Engram private-tag stripping without changing logical JSON', () => {
  const record = sampleRecord();
  const encoded = encodeRecord(record);

  assert.equal(encoded.content.includes('<private>'), false);
  assert.equal(encoded.content.includes('\\u003cprivate>'), true);

  const observation = {
    id: 1,
    project: encoded.project,
    scope: encoded.scope,
    type: encoded.type,
    topic_key: encoded.topic_key,
    content: encoded.content,
  };

  assert.deepEqual(
    decodeObservation(observation, {
      expectedProjectId: record.project_id,
      expectedKind: 'change',
      expectedId: record.id,
    }),
    record,
  );
});

test('adapter rejects content that Engram would silently truncate', () => {
  const huge = 'x'.repeat(ENGRAM_MAX_OBSERVATION_BYTES);
  const record = sampleRecord({
    payload: {
      title: 'Huge',
      intent: huge,
      lifecycle: 'open',
      continuity: { next: 'Act.' },
    },
  });

  assert.throws(
    () => encodeRecord(record),
    (error) => {
      assert(error instanceof MemoryPortError);
      assert.equal(error.code, 'invalid');
      return true;
    },
  );
});

test('decode rejects physical identity mismatch', () => {
  const record = sampleRecord();
  const encoded = encodeRecord(record);

  assert.throws(
    () => decodeObservation({
      id: 1,
      project: physicalProject('other-project'),
      scope: encoded.scope,
      type: encoded.type,
      topic_key: encoded.topic_key,
      content: encoded.content,
    }),
    (error) => {
      assert(error instanceof MemoryPortError);
      assert.equal(error.code, 'backend_error');
      return true;
    },
  );
});
