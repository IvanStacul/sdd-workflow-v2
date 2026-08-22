import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApplicationApi,
  SddError,
} from '../../src/index.mjs';
import {
  MemoryPortError,
} from '../../src/ports/memory.mjs';

const BACKEND_DETAILS = Object.freeze({
  exit_code: 125,
  stderr: 'docker unavailable: secret-host-path',
  status: 503,
  session_id: 'physical-session-id',
  topic_key: 'physical-topic-key',
});

function apiWithListFailure(error) {
  const memory = {
    async put() {
      throw new Error('put should not be called');
    },
    async get() {
      throw new Error('get should not be called');
    },
    async list() {
      throw error;
    },
  };

  return createApplicationApi({
    projectId: 'project-a',
    memory,
    idFactory: () => {
      throw new Error('idFactory should not be called');
    },
  });
}

const MEMORY_ERROR_CASES = [
  {
    memoryCode: 'not_found',
    applicationCode: 'not_found',
    message: 'SDD record not found',
  },
  {
    memoryCode: 'ambiguous',
    applicationCode: 'memory_ambiguous',
    message: 'Durable memory returned an ambiguous result',
  },
  {
    memoryCode: 'unavailable',
    applicationCode: 'memory_unavailable',
    message: 'Durable memory is unavailable',
  },
  {
    memoryCode: 'unsupported',
    applicationCode: 'memory_unsupported',
    message: 'Durable memory does not support this capability',
  },
  {
    memoryCode: 'invalid',
    applicationCode: 'memory_error',
    message: 'Durable memory failed',
  },
  {
    memoryCode: 'backend_error',
    applicationCode: 'memory_error',
    message: 'Durable memory failed',
  },
];

for (const item of MEMORY_ERROR_CASES) {
  test(`Application sanitizes ${item.memoryCode} Memory diagnostics`, async () => {
    const backendError = new MemoryPortError(
      item.memoryCode,
      'raw backend message: do not expose',
      BACKEND_DETAILS,
    );
    const api = apiWithListFailure(backendError);

    await assert.rejects(
      api.listOpenChanges(),
      (error) => {
        assert(error instanceof SddError);
        assert.equal(error.code, item.applicationCode);
        assert.equal(error.message, item.message);
        assert.deepEqual(error.details, {});

        assert.equal(error.cause, backendError);
        assert.equal(
          error.cause.message,
          'raw backend message: do not expose',
        );
        assert.deepEqual(error.cause.details, BACKEND_DETAILS);
        return true;
      },
    );
  });
}

test('unexpected Memory exceptions become canonical memory_error with internal cause', async () => {
  const backendError = new Error(
    'socket failed at /var/run/docker.sock',
  );
  backendError.details = BACKEND_DETAILS;
  const api = apiWithListFailure(backendError);

  await assert.rejects(
    api.listOpenChanges(),
    (error) => {
      assert(error instanceof SddError);
      assert.equal(error.code, 'memory_error');
      assert.equal(error.message, 'Durable memory failed');
      assert.deepEqual(error.details, {});
      assert.equal(error.cause, backendError);
      return true;
    },
  );
});

test('Application-owned semantic details remain public', async () => {
  const memory = {
    async put() {},
    async get() {},
    async list() {
      throw new Error('list should not be called');
    },
  };
  const api = createApplicationApi({
    projectId: 'project-a',
    memory,
    idFactory: () => {
      throw new Error('idFactory should not be called');
    },
  });

  await assert.rejects(
    api.listOpenChanges({ limit: 100 }),
    (error) => {
      assert(error instanceof SddError);
      assert.equal(error.code, 'invalid_input');
      assert.deepEqual(error.details, {
        min: 1,
        max: 20,
      });
      return true;
    },
  );
});
