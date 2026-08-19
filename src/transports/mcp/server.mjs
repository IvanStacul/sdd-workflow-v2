import {
  McpServer,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  StdioServerTransport,
} from '@modelcontextprotocol/sdk/server/stdio.js';

import {
  renderMcpInstructions,
} from '../../runtime/projection.mjs';
import {
  registerSddTools,
} from './tools.mjs';

export const MCP_SERVER_INSTRUCTIONS = renderMcpInstructions();

export function createSddMcpServer({
  api,
  name = 'sdd-v2',
  version = '0.0.0-development',
} = {}) {
  const server = new McpServer(
    {
      name,
      version,
    },
    {
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  registerSddTools(server, api);
  return server;
}

export async function serveSddMcpStdio(options) {
  const server = createSddMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
