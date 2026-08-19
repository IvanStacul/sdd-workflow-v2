import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDockerExecEngramTransport,
  EngramHttpError,
  EngramTransportError,
} from '../../src/adapters/engram/transport.mjs';

test('Docker transport invokes curl without shell interpolation and parses JSON/status', async () => {
  let captured;

  const transport = createDockerExecEngramTransport({
    container: 'sdd-engram',
    token: 'secret-token',
    run: async (command, args, options) => {
      captured = { command, args, options };
      return {
        exitCode: 0,
        stdout: '{"status":"ok"}\n__SDD_HTTP_STATUS__:200',
        stderr: '',
      };
    },
  });

  const result = await transport.request('GET', '/health');

  assert.deepEqual(result, { status: 'ok' });
  assert.equal(captured.command, 'docker');
  assert.deepEqual(captured.args.slice(0, 4), [
    'exec', '-i', 'sdd-engram', 'curl',
  ]);
  assert(captured.args.includes('Authorization: Bearer secret-token'));
  assert.equal(captured.options.input, '');
});

test('Docker transport sends JSON body through stdin', async () => {
  let input;

  const transport = createDockerExecEngramTransport({
    run: async (_command, _args, options) => {
      input = options.input;
      return {
        exitCode: 0,
        stdout: '{"id":1,"status":"saved"}\n__SDD_HTTP_STATUS__:201',
        stderr: '',
      };
    },
  });

  await transport.request('POST', '/observations', {
    content: 'hello',
  });

  assert.equal(input, '{"content":"hello"}');
});

test('Docker transport preserves non-2xx HTTP status as structured error', async () => {
  const transport = createDockerExecEngramTransport({
    run: async () => ({
      exitCode: 0,
      stdout: '{"error":"not found"}\n__SDD_HTTP_STATUS__:404',
      stderr: '',
    }),
  });

  await assert.rejects(
    transport.request('GET', '/sessions/missing'),
    (error) => {
      assert(error instanceof EngramHttpError);
      assert.equal(error.status, 404);
      return true;
    },
  );
});

test('Docker/curl failure is unavailable, not phantom HTTP success', async () => {
  const transport = createDockerExecEngramTransport({
    run: async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'docker unavailable',
    }),
  });

  await assert.rejects(
    transport.request('GET', '/health'),
    (error) => {
      assert(error instanceof EngramTransportError);
      assert.equal(error.code, 'unavailable');
      return true;
    },
  );
});
