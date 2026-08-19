import { z } from 'zod';

import { SddError } from '../../domain/errors.mjs';

const stringList = z.array(z.string().min(1)).optional();

const scopeSchema = z.object({
  in: stringList,
  out: stringList,
}).strict();

const acceptanceSchema = z.array(
  z.object({
    id: z.string().min(1),
    condition: z.string().min(1),
  }).strict(),
).optional();

const rollbackSchema = z.object({
  strategy: z.enum([
    'revert',
    'disable',
    'migrate_back',
    'manual',
    'other',
  ]),
  note: z.string().min(1),
}).strict();

const contractSchema = z.object({
  scope: scopeSchema.optional(),
  acceptance: acceptanceSchema,
  constraints: stringList,
  risks: stringList,
  edge_cases: stringList,
  open_questions: stringList,
  rollback: rollbackSchema.optional(),
}).strict();

const evidenceSchema = z.object({
  method: z.enum([
    'test',
    'build',
    'lint',
    'runtime',
    'inspection',
    'diff',
    'external',
    'other',
  ]),
  result: z.enum(['pass', 'fail', 'observed']),
  summary: z.string().min(1),
  covers: stringList,
  source: z.object({
    command: z.string().min(1).optional(),
    reference: z.string().min(1).optional(),
  }).strict().optional(),
}).strict();

const continuitySchema = z.object({
  completed: stringList,
  next: z.string().min(1),
  blockers: stringList,
}).strict();

const openSchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  contract: contractSchema.optional(),
  continuity: continuitySchema,
}).strict();

const receiptSchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  contract: contractSchema.optional(),
  outcome: z.string().min(1),
  evidence: z.array(evidenceSchema).min(1),
}).strict();

const refinementSchema = z.object({
  title: z.string().min(1).optional(),
  intent: z.string().min(1).optional(),
  contract_patch: z.object({
    scope: scopeSchema.nullable().optional(),
    acceptance: acceptanceSchema.nullable().optional(),
    constraints: z.array(z.string().min(1)).nullable().optional(),
    risks: z.array(z.string().min(1)).nullable().optional(),
    edge_cases: z.array(z.string().min(1)).nullable().optional(),
    open_questions: z.array(z.string().min(1)).nullable().optional(),
    rollback: rollbackSchema.nullable().optional(),
  }).strict().optional(),
}).strict();

const closeSchema = z.object({
  id: z.string().min(1),
  reason: z.enum(['completed', 'cancelled']),
  outcome: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
  evidence: z.array(evidenceSchema).min(1).optional(),
  evidence_refs: z.array(z.string().min(1)).min(1).optional(),
}).strict();

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const WRITE = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
});

export const SDD_MCP_TOOL_NAMES = Object.freeze([
  'sdd_change_open',
  'sdd_change_receipt',
  'sdd_change_get',
  'sdd_change_list',
  'sdd_change_refine',
  'sdd_change_frontier',
  'sdd_change_spawn',
  'sdd_change_dependency',
  'sdd_change_close',
  'sdd_decision_record',
  'sdd_decision_get',
  'sdd_evidence_record',
  'sdd_evidence_get',
  'sdd_knowledge_promote',
  'sdd_knowledge_search',
]);

export function registerSddTools(server, api) {
  assertServer(server);
  assertApi(api);

  register(
    server,
    api,
    'sdd_change_open',
    {
      title: 'Open durable SDD Change',
      description:
        'Create an open Change only when intent/frontier must survive handoff, restart, or another agent.',
      inputSchema: openSchema,
      annotations: WRITE,
    },
    (input) => api.openChange(input),
  );

  register(
    server,
    api,
    'sdd_change_receipt',
    {
      title: 'Create completed Change receipt',
      description:
        'Create a closed/completed receipt for material work already completed and verified in the current run.',
      inputSchema: receiptSchema,
      annotations: WRITE,
    },
    (input) => api.createReceipt(input),
  );

  register(
    server,
    api,
    'sdd_change_get',
    {
      title: 'Get exact SDD Change',
      description:
        'Recover one known Change by exact canonical ID. Use before directed repo inspection during handoff/restart recovery.',
      inputSchema: z.object({
        id: z.string().min(1),
      }).strict(),
      annotations: READ_ONLY,
    },
    ({ id }) => api.getChange(id),
  );

  register(
    server,
    api,
    'sdd_change_list',
    {
      title: 'List open SDD Changes',
      description:
        'List open Changes for the bound project. Preserve complete=false as non-exhaustive.',
      inputSchema: z.object({
        limit: z.number().int().positive().optional(),
        cursor: z.string().min(1).optional(),
      }).strict(),
      annotations: READ_ONLY,
    },
    (input) => api.listOpenChanges(input),
  );

  register(
    server,
    api,
    'sdd_change_refine',
    {
      title: 'Refine current Change contract',
      description:
        'Refine the same material intent. Do not use this to hide a new material objective; spawn another Change instead.',
      inputSchema: z.object({
        id: z.string().min(1),
        refinement: refinementSchema,
      }).strict(),
      annotations: WRITE,
    },
    ({ id, refinement }) => api.refineChange(id, refinement),
  );

  register(
    server,
    api,
    'sdd_change_frontier',
    {
      title: 'Set current Change frontier',
      description:
        'Replace the compact continuity snapshot before handoff: confirmed completed facts, actionable next, and real blockers.',
      inputSchema: z.object({
        id: z.string().min(1),
        frontier: continuitySchema,
      }).strict(),
      annotations: WRITE,
    },
    ({ id, frontier }) => api.setFrontier(id, frontier),
  );

  register(
    server,
    api,
    'sdd_change_spawn',
    {
      title: 'Spawn a Change for new intent',
      description:
        'Create a child Change when new material intent appears outside the current Change scope.',
      inputSchema: z.object({
        origin_id: z.string().min(1),
        change: openSchema,
      }).strict(),
      annotations: WRITE,
    },
    ({ origin_id, change }) => api.spawnChange(origin_id, change),
  );

  register(
    server,
    api,
    'sdd_change_dependency',
    {
      title: 'Add Change dependency',
      description:
        'Declare that one open Change depends on another Change. The inverse blocks relation is derived, not stored.',
      inputSchema: z.object({
        id: z.string().min(1),
        target_id: z.string().min(1),
      }).strict(),
      annotations: WRITE,
    },
    ({ id, target_id }) => api.addDependency(id, target_id),
  );

  register(
    server,
    api,
    'sdd_change_close',
    {
      title: 'Close SDD Change',
      description:
        'Close an open Change as completed with real structured Evidence, or cancelled without pretending completion.',
      inputSchema: closeSchema,
      annotations: WRITE,
    },
    ({ id, ...input }) => api.closeChange(id, input),
  );

  register(
    server,
    api,
    'sdd_decision_record',
    {
      title: 'Record material Decision',
      description:
        'Persist a material decision only when its rationale/history must survive or is costly to rediscover.',
      inputSchema: z.object({
        subject_id: z.string().min(1).optional(),
        statement: z.string().min(1),
        rationale: z.string().min(1),
        supersedes: z.string().min(1).optional(),
      }).strict(),
      annotations: WRITE,
    },
    (input) => api.recordDecision(input),
  );

  register(
    server,
    api,
    'sdd_decision_get',
    {
      title: 'Get exact Decision',
      description: 'Recover one known Decision by canonical ID.',
      inputSchema: z.object({
        id: z.string().min(1),
      }).strict(),
      annotations: READ_ONLY,
    },
    ({ id }) => api.getDecision(id),
  );

  register(
    server,
    api,
    'sdd_evidence_record',
    {
      title: 'Record structured Evidence',
      description:
        'Persist an observed test/build/lint/runtime/inspection/diff/external result for an existing Change.',
      inputSchema: z.object({
        subject_id: z.string().min(1),
        method: evidenceSchema.shape.method,
        result: evidenceSchema.shape.result,
        summary: z.string().min(1),
        covers: stringList,
        source: evidenceSchema.shape.source,
      }).strict(),
      annotations: WRITE,
    },
    (input) => api.recordEvidence(input),
  );

  register(
    server,
    api,
    'sdd_evidence_get',
    {
      title: 'Get exact Evidence',
      description: 'Recover one known Evidence record by canonical ID.',
      inputSchema: z.object({
        id: z.string().min(1),
      }).strict(),
      annotations: READ_ONLY,
    },
    ({ id }) => api.getEvidence(id),
  );

  register(
    server,
    api,
    'sdd_knowledge_promote',
    {
      title: 'Promote reusable project Knowledge',
      description:
        'Persist a reusable project fact when it is valuable enough to survive and costly enough to rediscover.',
      inputSchema: z.object({
        statement: z.string().min(1),
        source_refs: stringList,
      }).strict(),
      annotations: WRITE,
    },
    (input) => api.promoteKnowledge(input),
  );

  register(
    server,
    api,
    'sdd_knowledge_search',
    {
      title: 'Search project Knowledge',
      description:
        'Approximate discovery of reusable project Knowledge. Do not use search as exact Change/Decision/Evidence recovery.',
      inputSchema: z.object({
        query: z.string().min(1),
      }).strict(),
      annotations: READ_ONLY,
    },
    ({ query }) => api.searchKnowledge(query),
  );

  return server;
}

function register(server, _api, name, config, operation) {
  server.registerTool(
    name,
    config,
    async (input) => invoke(operation, input),
  );
}

async function invoke(operation, input) {
  try {
    const data = await operation(input);
    return resultEnvelope({
      ok: true,
      data,
    });
  } catch (error) {
    return resultEnvelope(
      {
        ok: false,
        error: publicError(error),
      },
      true,
    );
  }
}

function resultEnvelope(payload, isError = false) {
  return {
    content: [{
      type: 'text',
      text: safeJson(payload),
    }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function publicError(error) {
  if (error instanceof SddError) {
    return {
      code: error.code,
      message: error.message,
      ...(Object.keys(error.details ?? {}).length > 0
        ? { details: error.details }
        : {}),
    };
  }

  return {
    code: 'internal_error',
    message: 'Unexpected SDD tool failure',
  };
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function assertServer(server) {
  if (!server || typeof server.registerTool !== 'function') {
    throw new TypeError('server must implement registerTool');
  }
}

function assertApi(api) {
  const required = [
    'openChange',
    'createReceipt',
    'getChange',
    'listOpenChanges',
    'refineChange',
    'setFrontier',
    'spawnChange',
    'addDependency',
    'closeChange',
    'recordDecision',
    'getDecision',
    'recordEvidence',
    'getEvidence',
    'promoteKnowledge',
    'searchKnowledge',
  ];

  for (const name of required) {
    if (typeof api?.[name] !== 'function') {
      throw new TypeError(`Application API is missing ${name}()`);
    }
  }
}
