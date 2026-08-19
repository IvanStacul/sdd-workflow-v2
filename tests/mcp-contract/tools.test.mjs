import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerSddTools,
  SDD_MCP_TOOL_NAMES,
} from '../../src/transports/mcp/tools.mjs';
import { SddError } from '../../src/domain/errors.mjs';

class CaptureServer {
  constructor() {
    this.tools = new Map();
  }

  registerTool(name, config, handler) {
    if (this.tools.has(name)) {
      throw new Error(`duplicate tool ${name}`);
    }
    this.tools.set(name, { config, handler });
  }
}

function fakeApi(overrides = {}) {
  const calls = [];

  const operation = (name) => async (...args) => {
    calls.push({ name, args });
    return { operation: name, args };
  };

  return {
    calls,
    api: {
      openChange: operation('openChange'),
      createReceipt: operation('createReceipt'),
      getChange: operation('getChange'),
      listOpenChanges: operation('listOpenChanges'),
      refineChange: operation('refineChange'),
      setFrontier: operation('setFrontier'),
      spawnChange: operation('spawnChange'),
      addDependency: operation('addDependency'),
      closeChange: operation('closeChange'),
      recordDecision: operation('recordDecision'),
      getDecision: operation('getDecision'),
      recordEvidence: operation('recordEvidence'),
      getEvidence: operation('getEvidence'),
      promoteKnowledge: operation('promoteKnowledge'),
      searchKnowledge: operation('searchKnowledge'),
      ...overrides,
    },
  };
}

async function invoke(server, name, input) {
  const entry = server.tools.get(name);
  assert(entry, `missing ${name}`);
  return entry.handler(input);
}

test('MCP surface exposes exactly the frozen Application API capabilities', () => {
  const server = new CaptureServer();
  const { api } = fakeApi();

  registerSddTools(server, api);

  assert.deepEqual(
    [...server.tools.keys()],
    [...SDD_MCP_TOOL_NAMES],
  );

  assert.equal(server.tools.size, 15);
  assert.equal(server.tools.has('sdd_put_record'), false);
  assert.equal(server.tools.has('mem_save'), false);
  assert.equal(server.tools.has('mem_search'), false);
});

test('tool annotations distinguish reads from mutations without mislabeling close as destructive deletion', () => {
  const server = new CaptureServer();
  const { api } = fakeApi();
  registerSddTools(server, api);

  for (const name of [
    'sdd_change_get',
    'sdd_change_list',
    'sdd_decision_get',
    'sdd_evidence_get',
    'sdd_knowledge_search',
  ]) {
    assert.equal(
      server.tools.get(name).config.annotations.readOnlyHint,
      true,
      `${name} should be read-only`,
    );
  }

  assert.equal(
    server.tools.get('sdd_change_close').config.annotations.readOnlyHint,
    false,
  );
  assert.equal(
    server.tools.get('sdd_change_close').config.annotations.destructiveHint,
    false,
  );
});

test('Change tools map transport inputs to one Application API use case', async () => {
  const server = new CaptureServer();
  const { api, calls } = fakeApi();
  registerSddTools(server, api);

  const open = {
    title: 'Feature',
    intent: 'Deliver feature.',
    continuity: { next: 'Inspect repo.' },
  };
  const receipt = {
    title: 'Done',
    intent: 'Finish small change.',
    outcome: 'Finished.',
    evidence: [{
      method: 'test',
      result: 'pass',
      summary: 'Test passed.',
    }],
  };

  await invoke(server, 'sdd_change_open', open);
  await invoke(server, 'sdd_change_receipt', receipt);
  await invoke(server, 'sdd_change_get', { id: 'CHG-1' });
  await invoke(server, 'sdd_change_list', { limit: 5 });
  await invoke(server, 'sdd_change_refine', {
    id: 'CHG-1',
    refinement: { title: 'Refined' },
  });
  await invoke(server, 'sdd_change_frontier', {
    id: 'CHG-1',
    frontier: { next: 'Act.' },
  });
  await invoke(server, 'sdd_change_spawn', {
    origin_id: 'CHG-1',
    change: open,
  });
  await invoke(server, 'sdd_change_dependency', {
    id: 'CHG-1',
    target_id: 'CHG-2',
  });
  await invoke(server, 'sdd_change_close', {
    id: 'CHG-1',
    reason: 'cancelled',
    rationale: 'No longer required.',
  });

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'openChange',
      'createReceipt',
      'getChange',
      'listOpenChanges',
      'refineChange',
      'setFrontier',
      'spawnChange',
      'addDependency',
      'closeChange',
    ],
  );

  assert.deepEqual(calls[2].args, ['CHG-1']);
  assert.deepEqual(calls[4].args, [
    'CHG-1',
    { title: 'Refined' },
  ]);
  assert.deepEqual(calls[6].args, [
    'CHG-1',
    open,
  ]);
  assert.deepEqual(calls[8].args, [
    'CHG-1',
    {
      reason: 'cancelled',
      rationale: 'No longer required.',
    },
  ]);
});

test('Decision, Evidence and Knowledge tools map to typed Application operations', async () => {
  const server = new CaptureServer();
  const { api, calls } = fakeApi();
  registerSddTools(server, api);

  await invoke(server, 'sdd_decision_record', {
    statement: 'Use MCP.',
    rationale: 'Structured tools.',
  });
  await invoke(server, 'sdd_decision_get', { id: 'DEC-1' });
  await invoke(server, 'sdd_evidence_record', {
    subject_id: 'CHG-1',
    method: 'test',
    result: 'pass',
    summary: 'Tests pass.',
  });
  await invoke(server, 'sdd_evidence_get', { id: 'EVD-1' });
  await invoke(server, 'sdd_knowledge_promote', {
    statement: 'Project uses a pivot.',
  });
  await invoke(server, 'sdd_knowledge_search', {
    query: 'pivot',
  });

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'recordDecision',
      'getDecision',
      'recordEvidence',
      'getEvidence',
      'promoteKnowledge',
      'searchKnowledge',
    ],
  );

  assert.deepEqual(calls.at(-1).args, ['pivot']);
});

test('Application SddError becomes stable structured MCP error without cause leakage', async () => {
  const server = new CaptureServer();
  const { api } = fakeApi({
    getChange: async () => {
      throw new SddError(
        'not_found',
        'Change not found',
        { id: 'CHG-1' },
        { cause: new Error('backend secret') },
      );
    },
  });

  registerSddTools(server, api);

  const result = await invoke(
    server,
    'sdd_change_get',
    { id: 'CHG-1' },
  );

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'not_found',
      message: 'Change not found',
      details: { id: 'CHG-1' },
    },
  });

  assert.doesNotMatch(
    result.content[0].text,
    /backend secret|stack/i,
  );
});

test('unexpected failures are normalized to internal_error', async () => {
  const server = new CaptureServer();
  const { api } = fakeApi({
    searchKnowledge: async () => {
      throw new Error('transport internals');
    },
  });

  registerSddTools(server, api);

  const result = await invoke(
    server,
    'sdd_knowledge_search',
    { query: 'x' },
  );

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, {
    ok: false,
    error: {
      code: 'internal_error',
      message: 'Unexpected SDD tool failure',
    },
  });
  assert.doesNotMatch(result.content[0].text, /transport internals/);
});
