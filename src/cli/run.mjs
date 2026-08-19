import path from 'node:path';

import {
  initProject,
} from '../project/install.mjs';
import {
  createProjectRuntime,
} from '../runtime/project-runtime.mjs';
export async function runCli(argv = process.argv.slice(2), io = console) {
  const [command = 'help', ...args] = argv;

  if (command === 'init') {
    const parsed = parseInitArgs(args);
    const result = initProject(parsed.target, {
      projectId: parsed.projectId,
    });

    io.log(`SDD V2 initialized: ${result.root}`);
    io.log(`project_id: ${result.config.project_id}`);
    io.log('host bootstrap: codex');
    io.log(`memory: ${result.config.memory.adapter}`);
    io.log(
      result.config_created
        ? 'config: created'
        : 'config: preserved',
    );
    io.log(
      result.agents_changed
        ? 'AGENTS.md: updated'
        : 'AGENTS.md: unchanged',
    );
    io.log(
      result.codex_changed
        ? '.codex/config.toml: updated'
        : '.codex/config.toml: unchanged',
    );
    io.log('Next: restart Codex in this trusted project so AGENTS.md and MCP config reload.');
    return 0;
  }

  if (command === 'mcp') {
    const parsed = parseMcpArgs(args);
    const runtime = createProjectRuntime({
      projectRoot: parsed.projectRoot,
      startDir: parsed.projectRoot === undefined
        ? process.cwd()
        : undefined,
    });

    const {
      serveSddMcpStdio,
    } = await import('../transports/mcp/server.mjs');

    await serveSddMcpStdio({
      api: runtime.api,
    });
    return 0;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    io.log(helpText());
    return 0;
  }

  throw new Error(`Unknown command: ${command}`);
}

export function helpText() {
  return [
    'SDD V2',
    '',
    'Usage:',
    '  sdd-v2 init [target] --project-id <stable-id>',
    '  sdd-v2 mcp [--project-root <path>]',
    '  sdd-v2 help',
    '',
    'The mcp command is normally started by Codex from the managed project-scoped MCP config.',
  ].join('\n');
}

function parseInitArgs(args) {
  let target = '.';
  let targetSet = false;
  let projectId;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === '--project-id') {
      projectId = requireValue(args, ++index, '--project-id');
      continue;
    }

    if (value.startsWith('--')) {
      throw new Error(`Unknown init option: ${value}`);
    }

    if (targetSet) {
      throw new Error('init accepts at most one target path');
    }
    target = value;
    targetSet = true;
  }

  if (!projectId) {
    throw new Error('init requires --project-id <stable-id>');
  }

  return {
    target: path.resolve(target),
    projectId,
  };
}

function parseMcpArgs(args) {
  let projectRoot;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];

    if (value === '--project-root') {
      projectRoot = path.resolve(
        requireValue(args, ++index, '--project-root'),
      );
      continue;
    }

    throw new Error(`Unknown mcp option: ${value}`);
  }

  return { projectRoot };
}

function requireValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}
