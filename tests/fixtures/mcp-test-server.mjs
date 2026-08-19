import {
  createSddMcpServer,
} from '../../src/transports/mcp/server.mjs';
import {
  StdioServerTransport,
} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  SddError,
} from '../../src/domain/errors.mjs';

const api = {
  async openChange(input) {
    return {
      id: 'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW',
      ...input,
      lifecycle: 'open',
    };
  },
  async createReceipt(input) {
    return {
      id: 'CHG-01K2Z8E7M4R6J4V9Q1T5X8N2CX',
      title: input.title,
      intent: input.intent,
      lifecycle: 'closed',
      close: {
        reason: 'completed',
        outcome: input.outcome,
        evidence: input.evidence,
      },
    };
  },
  async getChange(id) {
    if (id === 'missing') {
      throw new SddError(
        'not_found',
        'Change not found',
        { id },
      );
    }
    return {
      id,
      title: 'Recovered',
      intent: 'Recover exactly.',
      lifecycle: 'open',
      continuity: { next: 'Act.' },
    };
  },
  async listOpenChanges() {
    return { items: [], complete: true };
  },
  async refineChange(id, refinement) {
    return { id, refinement };
  },
  async setFrontier(id, frontier) {
    return { id, continuity: frontier };
  },
  async spawnChange(originId, input) {
    return { originId, ...input };
  },
  async addDependency(id, targetId) {
    return { id, targetId };
  },
  async closeChange(id, input) {
    return { id, lifecycle: 'closed', close: input };
  },
  async recordDecision(input) {
    return { id: 'DEC-01K2Z8E7M5R6J4V9Q1T5X8N2CY', ...input };
  },
  async getDecision(id) {
    return { id, statement: 'Decision', rationale: 'Test' };
  },
  async recordEvidence(input) {
    return { id: 'EVD-01K2Z8E7M6R6J4V9Q1T5X8N2CZ', ...input };
  },
  async getEvidence(id) {
    return {
      id,
      subject_id: 'CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW',
      method: 'test',
      result: 'pass',
      summary: 'Pass',
    };
  },
  async promoteKnowledge(input) {
    return { id: 'KNW-01K2Z8E7M7R6J4V9Q1T5X8N2D0', ...input };
  },
  async searchKnowledge(query) {
    return {
      items: [{
        id: 'KNW-01K2Z8E7M7R6J4V9Q1T5X8N2D0',
        statement: `found:${query}`,
      }],
    };
  },
};

const server = createSddMcpServer({
  api,
  name: 'sdd-v2-fixture',
  version: 'test',
});

await server.connect(new StdioServerTransport());
