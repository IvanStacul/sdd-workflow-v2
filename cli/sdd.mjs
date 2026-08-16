#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderAgentsSection,
  renderCodexToml,
  upsertCodexToml,
  upsertManagedSection,
} from '../adapters/codex.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');
const runtimeVersion = '0.1.0-alpha.1';

main();

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ['-h', '--help', 'help'].includes(command)) return printHelp();
  if (command !== 'init') fail(`Unknown command: ${command}`);

  const parsed = parseInitArgs(args);
  const target = path.resolve(parsed.target ?? process.cwd());
  initProject(target, parsed);
}

function initProject(target, options) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`Target is not a directory: ${target}`);
  if (options.adapter !== 'codex') fail('Alpha currently supports only --adapter codex.');

  const sddDir = path.join(target, '.sdd');
  const runtimeDir = path.join(sddDir, 'runtime');
  const configPath = path.join(sddDir, 'config.json');
  const manifestPath = path.join(sddDir, 'manifest.json');
  const kernelPath = path.join(runtimeDir, 'kernel.md');
  const agentsPath = path.join(target, 'AGENTS.md');
  const codexConfigPath = path.join(target, '.codex', 'config.toml');

  const existingConfig = readJsonIfExists(configPath);
  const projectId = existingConfig?.project_id || options.projectId || deriveProjectId(target);
  const container = existingConfig?.memory?.container || options.container || 'sdd-engram';

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(path.dirname(codexConfigPath), { recursive: true });

  const changes = [];
  const warnings = [];

  if (!existingConfig) {
    const config = {
      schema_version: 1,
      project_id: projectId,
      adapter: 'codex',
      memory: {
        provider: 'engram',
        transport: 'docker-mcp',
        container,
      },
      approval: 'material-decisions',
      evolution: {
        capture_signals: true,
        surface: 'material-only',
      },
    };
    writeJson(configPath, config);
    changes.push(relative(target, configPath, 'created'));
  } else {
    changes.push(relative(target, configPath, 'preserved'));
  }

  const manifest = {
    schema_version: 1,
    managed_by: 'sdd-v2',
    runtime_version: runtimeVersion,
    schemas: { config: 1, memory: 1 },
    managed_paths: ['.sdd/runtime', '.sdd/manifest.json'],
  };
  const manifestExisted = fs.existsSync(manifestPath);
  writeJson(manifestPath, manifest);
  changes.push(relative(target, manifestPath, manifestExisted ? 'updated' : 'created'));

  const kernelSource = path.join(sourceRoot, 'runtime', 'kernel.md');
  const kernelExisted = fs.existsSync(kernelPath);
  fs.copyFileSync(kernelSource, kernelPath);
  changes.push(relative(target, kernelPath, kernelExisted ? 'updated' : 'created'));

  const agentsExisting = readText(agentsPath);
  const agentsContent = upsertManagedSection(agentsExisting, renderAgentsSection());
  writeTextIfChanged(agentsPath, agentsContent, changes, target);

  const codexExisting = readText(codexConfigPath);
  const codex = upsertCodexToml(codexExisting, renderCodexToml(projectId, container));
  if (codex.warning) warnings.push(codex.warning);
  writeTextIfChanged(codexConfigPath, codex.content, changes, target);

  const dockerStatus = probeDockerContainer(container);
  if (!dockerStatus.ok) warnings.push(dockerStatus.message);

  console.log(`SDD V2 initialized: ${target}`);
  console.log(`project_id: ${projectId}`);
  console.log(`adapter: codex`);
  console.log(`memory: engram via Docker container ${container}`);
  console.log('');
  for (const item of changes) console.log(`- ${item}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
  console.log('\nNext: open a fresh Codex session from this repository so project AGENTS.md and .codex/config.toml are loaded.');
}

function parseInitArgs(args) {
  const out = { adapter: 'codex', target: null, projectId: null, container: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--adapter') out.adapter = requiredValue(arg, args);
    else if (arg === '--project-id') out.projectId = sanitizeProjectId(requiredValue(arg, args));
    else if (arg === '--container') out.container = requiredValue(arg, args);
    else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`);
    else if (!out.target) out.target = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  return out;
}

function requiredValue(option, args) {
  const value = args.shift();
  if (!value) fail(`Missing value for ${option}`);
  return value;
}

function deriveProjectId(target) {
  const remote = gitRemote(target);
  if (remote) {
    const parsed = remote.replace(/\.git$/, '').replace(/\\/g, '/').match(/(?:[:/])([^/:]+)\/([^/]+)$/);
    if (parsed) return sanitizeProjectId(`${parsed[1]}-${parsed[2]}`);
  }
  const base = sanitizeProjectId(path.basename(target));
  if (base) return base;
  return `project-${createHash('sha256').update(target).digest('hex').slice(0, 8)}`;
}

function gitRemote(cwd) {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function sanitizeProjectId(value) {
  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (!cleaned) fail(`Invalid project id: ${value}`);
  return cleaned;
}

function probeDockerContainer(container) {
  try {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (status === 'healthy') return { ok: true };
    return { ok: false, message: `Engram container ${container} health is ${status || 'unknown'}. Init completed; memory may be unavailable.` };
  } catch {
    return { ok: false, message: `Could not verify Docker container ${container}. Init completed; start Engram before durable SDD work.` };
  }
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${file}: ${error.message}`);
  }
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeTextIfChanged(file, content, changes, root) {
  const existed = fs.existsSync(file);
  const previous = existed ? fs.readFileSync(file, 'utf8') : null;
  if (previous === content) {
    changes.push(relative(root, file, 'unchanged'));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  changes.push(relative(root, file, existed ? 'updated' : 'created'));
}

function relative(root, file, status) {
  return `${status}: ${path.relative(root, file).replace(/\\/g, '/')}`;
}

function printHelp() {
  console.log(`SDD V2 Alpha\n\nUsage:\n  sdd-v2 init [target] [--adapter codex] [--project-id id] [--container sdd-engram]\n`);
}

function fail(message) {
  console.error(`sdd-v2: ${message}`);
  process.exit(1);
}
