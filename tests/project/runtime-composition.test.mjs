import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createProjectConfig,
  writeProjectConfig,
} from '../../src/project/config.mjs';
import {
  createProjectRuntime,
  resolveEngramContainer,
} from '../../src/runtime/project-runtime.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-b3-runtime-'));
}

test('project runtime composes project identity with environment-specific transport wiring', () => {
  const root = tempDir();
  writeProjectConfig(
    root,
    createProjectConfig({
      projectId: 'demo-app',
    }),
  );

  const calls = [];
  const transport = { request() {} };
  const memory = {
    put() {},
    get() {},
    list() {},
  };
  const api = { marker: 'api' };

  const runtime = createProjectRuntime({
    projectRoot: root,
    environment: {
      SDD_ENGRAM_CONTAINER: 'custom-engram',
    },
    transportFactory(options) {
      calls.push(['transport', options]);
      return transport;
    },
    repositoryFactory(options) {
      calls.push(['repository', options]);
      return memory;
    },
    applicationFactory(options) {
      calls.push(['application', options]);
      return api;
    },
  });

  assert.equal(runtime.root, root);
  assert.equal(runtime.config.project_id, 'demo-app');
  assert.equal(runtime.environment.engram_container, 'custom-engram');
  assert.equal(runtime.transport, transport);
  assert.equal(runtime.memory, memory);
  assert.equal(runtime.api, api);

  assert.deepEqual(calls[0], [
    'transport',
    { container: 'custom-engram' },
  ]);
  assert.deepEqual(calls[1], [
    'repository',
    { transport },
  ]);
  assert.deepEqual(calls[2], [
    'application',
    {
      projectId: 'demo-app',
      memory,
    },
  ]);
});

test('Engram container defaults locally and validates environment overrides', () => {
  assert.equal(resolveEngramContainer({}), 'sdd-engram');
  assert.equal(
    resolveEngramContainer({
      SDD_ENGRAM_CONTAINER: 'another-engram',
    }),
    'another-engram',
  );

  assert.throws(
    () => resolveEngramContainer({
      SDD_ENGRAM_CONTAINER: 'bad container name',
    }),
    /SDD_ENGRAM_CONTAINER/,
  );
});
