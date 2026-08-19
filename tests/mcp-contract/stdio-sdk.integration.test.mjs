import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  Client,
} from '@modelcontextprotocol/sdk/client/index.js';
import {
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';

import {
  SDD_MCP_TOOL_NAMES,
} from '../../src/transports/mcp/tools.mjs';

const fixture = fileURLToPath(
  new URL('../fixtures/mcp-test-server.mjs', import.meta.url),
);

test('official MCP v1 client can initialize, list and call the SDD stdio server', async () => {
  const client = new Client({
    name: 'sdd-v2-contract-test',
    version: 'test',
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: 'pipe',
  });

  try {
    await client.connect(transport);

    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...SDD_MCP_TOOL_NAMES],
    );

    const result = await client.callTool({
      name: 'sdd_change_open',
      arguments: {
        title: 'MCP smoke',
        intent: 'Prove the stdio contract.',
        continuity: {
          next: 'Finish test.',
        },
      },
    });

    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(
      result.structuredContent.data.lifecycle,
      'open',
    );
  } finally {
    await client.close();
  }
});

test('official MCP server-side Zod validation rejects arbitrary tool fields', async () => {
  const client = new Client({
    name: 'sdd-v2-validation-test',
    version: 'test',
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: 'pipe',
  });

  try {
    await client.connect(transport);

    const result = await client.callTool({
      name: 'sdd_change_open',
      arguments: {
        title: 'Invalid',
        intent: 'Reject transport schema drift.',
        continuity: {
          next: 'N/A',
        },
        project_id: 'caller-must-not-set-this',
      },
    });

    assert.equal(result.isError, true);
    assert.match(
      result.content[0].text,
      /Input validation error|Invalid arguments/,
    );
  } finally {
    await client.close();
  }
});


test('official MCP client receives stable structured Application errors', async () => {
  const client = new Client({
    name: 'sdd-v2-error-test',
    version: 'test',
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fixture],
    stderr: 'pipe',
  });

  try {
    await client.connect(transport);

    const result = await client.callTool({
      name: 'sdd_change_get',
      arguments: {
        id: 'missing',
      },
    });

    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, {
      ok: false,
      error: {
        code: 'not_found',
        message: 'Change not found',
        details: {
          id: 'missing',
        },
      },
    });
  } finally {
    await client.close();
  }
});
