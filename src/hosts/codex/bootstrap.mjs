import fs from 'node:fs';
import path from 'node:path';

import {
  containsOutsideManagedBlock,
  replaceManagedBlock,
} from '../../project/managed-block.mjs';

const AGENTS_START = '<!-- sdd-v2:start -->';
const AGENTS_END = '<!-- sdd-v2:end -->';
const TOML_START = '# sdd-v2:start';
const TOML_END = '# sdd-v2:end';

export function planCodexBootstrap(projectRoot, runtimeProjection) {
  const root = path.resolve(projectRoot);
  const agentsPath = path.join(root, 'AGENTS.md');
  const codexPath = path.join(root, '.codex', 'config.toml');

  const agentsBefore = readText(agentsPath);
  const agentsAfter = replaceManagedBlock(agentsBefore, {
    startMarker: AGENTS_START,
    endMarker: AGENTS_END,
    body: runtimeProjection,
    label: 'AGENTS.md',
  });

  const codexBefore = readText(codexPath);

  if (containsOutsideManagedBlock(codexBefore, {
    startMarker: TOML_START,
    endMarker: TOML_END,
    pattern: /^\s*\[mcp_servers\.sdd\]\s*$/m,
  })) {
    throw new Error(
      'Existing user-owned [mcp_servers.sdd] conflicts with the managed SDD MCP block',
    );
  }

  const codexAfter = replaceManagedBlock(codexBefore, {
    startMarker: TOML_START,
    endMarker: TOML_END,
    body: renderCodexMcpConfig(),
    label: '.codex/config.toml',
  });

  return {
    agents_path: agentsPath,
    codex_config_path: codexPath,
    agents_before: agentsBefore,
    agents_after: agentsAfter,
    codex_before: codexBefore,
    codex_after: codexAfter,
  };
}

export function applyCodexBootstrap(plan) {
  writeIfChanged(plan.agents_path, plan.agents_after);
  writeIfChanged(plan.codex_config_path, plan.codex_after);

  return {
    agents_path: plan.agents_path,
    codex_config_path: plan.codex_config_path,
    agents_changed: plan.agents_before !== plan.agents_after,
    codex_changed: plan.codex_before !== plan.codex_after,
  };
}

export function installCodexBootstrap(projectRoot, runtimeProjection) {
  return applyCodexBootstrap(
    planCodexBootstrap(projectRoot, runtimeProjection),
  );
}

export function renderCodexMcpConfig() {
  return [
    '[mcp_servers.sdd]',
    'command = "sdd-v2"',
    'args = ["mcp"]',
    'required = true',
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 60',
    'env_vars = ["ENGRAM_HTTP_TOKEN", "SDD_ENGRAM_CONTAINER"]',
  ].join('\n');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function writeIfChanged(file, content) {
  const before = readText(file);
  if (before === content) return;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
