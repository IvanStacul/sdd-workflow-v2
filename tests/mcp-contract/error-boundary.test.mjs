import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createApplicationApi,
} from '../../src/index.mjs';
import {
  createEngramRepository,
} from '../../src/adapters/engram/repository.mjs';
import {
  createDockerExecEngramTransport,
  EngramHttpError,
} from '../../src/adapters/engram/transport.mjs';
import {
  registerSddTools,
} from '../../src/transports/mcp/tools.mjs';

class CaptureServer {
  constructor() {
    this.tools = new Map();
  }

  registerTool(name, config, handler) {
    this.tools.set(name, { config, handler });
  }
}

function createMcpFixture(transport) {
  const memory = createEngramRepository({ transport });
  const api = createApplicationApi({
    projectId: 'project-a',
    memory,
    idFactory: () => {
      throw new Error('idFactory should not be called');
    },
  });
  const server = new CaptureServer();
  registerSddTools(server, api);
  return server;
}

async function invoke(server, name, input) {
  const entry = server.tools.get(name);
  assert(entry, `missing ${name}`);
  return entry.handler(input);
}

function assertCanonicalPublicError(
  result,
  expected,
  forbiddenFragments,
) {
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: expected,
  });

  const parsedText = JSON.parse(result.content[0].text);
  assert.deepEqual(parsedText, result.structuredContent);

  const serialized = JSON.stringify(result);
  for (const fragment of forbiddenFragments) {
    assert.equal(
      serialized.includes(fragment),
      false,
      `MCP response leaked backend diagnostic fragment: ${fragment}`,
    );
  }
}

test('Docker transport diagnostics do not cross the public MCP error boundary', async () => {
  const transport = createDockerExecEngramTransport({
    run: async () => ({
      exitCode: 125,
      stdout: '',
      stderr: 'docker unavailable at /var/run/docker.sock SECRET_STDERR',
    }),
  });
  const server = createMcpFixture(transport);

  const result = await invoke(
    server,
    'sdd_change_list',
    {},
  );

  assertCanonicalPublicError(
    result,
    {
      code: 'memory_unavailable',
      message: 'Durable memory is unavailable',
    },
    [
      '125',
      'SECRET_STDERR',
      '/var/run/docker.sock',
      'exit_code',
      'stderr',
    ],
  );
});

test('Engram HTTP diagnostics remain internal through repository, Application and MCP', async () => {
  const transport = {
    async request() {
      throw new EngramHttpError(
        503,
        'backend failure SECRET_HTTP_MESSAGE',
        {
          session_id: 'SECRET_SESSION_ID',
          topic_key: 'SECRET_TOPIC_KEY',
          sqlite_id: 'SECRET_SQLITE_ID',
        },
      );
    },
  };
  const server = createMcpFixture(transport);

  const result = await invoke(
    server,
    'sdd_change_list',
    {},
  );

  assertCanonicalPublicError(
    result,
    {
      code: 'memory_error',
      message: 'Durable memory failed',
    },
    [
      '503',
      'SECRET_HTTP_MESSAGE',
      'SECRET_SESSION_ID',
      'SECRET_TOPIC_KEY',
      'SECRET_SQLITE_ID',
      'session_id',
      'topic_key',
      'sqlite_id',
      'status',
    ],
  );
});
