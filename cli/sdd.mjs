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
const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
const runtimeVersion = packageJson.version;
const currentSchemas = { config: 1, memory: 1 };

main();

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ['-h', '--help', 'help'].includes(command)) return printHelp();

  if (command === 'init') {
    const parsed = parseInitArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    return initProject(target, parsed);
  }

  if (command === 'update') {
    const parsed = parseUpdateArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    return updateProject(target, parsed);
  }

  fail(`Unknown command: ${command}`);
}

function initProject(target, options) {
  ensureDirectory(target);
  if (options.adapter !== 'codex') fail('Alpha currently supports only --adapter codex.');

  const paths = projectPaths(target);
  const existingConfig = readJsonIfExists(paths.configPath);
  const projectId = existingConfig?.project_id || options.projectId || deriveProjectId(target);
  const container = existingConfig?.memory?.container || options.container || 'sdd-engram';

  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.mkdirSync(path.dirname(paths.codexConfigPath), { recursive: true });

  const changes = [];
  const warnings = [];

  if (!existingConfig) {
    writeJson(paths.configPath, newConfig(projectId, container));
    changes.push(relative(target, paths.configPath, 'created'));
  } else {
    changes.push(relative(target, paths.configPath, 'preserved'));
  }

  const manifestExisted = fs.existsSync(paths.manifestPath);
  writeJson(paths.manifestPath, newManifest());
  changes.push(relative(target, paths.manifestPath, manifestExisted ? 'updated' : 'created'));

  installManagedRuntime(paths.kernelPath, changes, target);
  installAdapterSections(target, paths, projectId, container, changes, warnings);

  const dockerStatus = probeDockerContainer(container);
  if (!dockerStatus.ok) warnings.push(dockerStatus.message);

  console.log(`SDD V2 initialized: ${target}`);
  console.log(`project_id: ${projectId}`);
  console.log('adapter: codex');
  console.log(`memory: engram via Docker container ${container}`);
  printChanges(changes, warnings);
  console.log('\nNext: open a fresh Codex session from this repository so project AGENTS.md and .codex/config.toml are loaded.');
}

function updateProject(target, options) {
  ensureDirectory(target);
  const paths = projectPaths(target);
  const manifest = readJsonIfExists(paths.manifestPath);
  const config = readJsonIfExists(paths.configPath);

  if (!manifest || manifest.managed_by !== 'sdd-v2') {
    fail(`Not an SDD V2 project: ${paths.manifestPath} is missing or not managed by sdd-v2.`);
  }
  if (!config) fail(`Missing project-owned SDD config: ${paths.configPath}`);
  if (config.adapter !== 'codex') fail(`Unsupported installed adapter: ${config.adapter ?? 'unknown'}`);

  const compatibility = classifyCompatibility(manifest);
  printUpdatePlan(target, manifest, compatibility, options.dryRun);
  if (!compatibility.safe) fail(compatibility.reason);
  if (options.dryRun) return;

  const changes = [];
  const warnings = [];
  const projectId = config.project_id;
  const container = config.memory?.container || 'sdd-engram';

  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.mkdirSync(path.dirname(paths.codexConfigPath), { recursive: true });

  // Project-owned config is intentionally not rewritten for compatible updates.
  changes.push(relative(target, paths.configPath, 'preserved'));
  installManagedRuntime(paths.kernelPath, changes, target);
  installAdapterSections(target, paths, projectId, container, changes, warnings);
  writeJson(paths.manifestPath, newManifest());
  changes.push(relative(target, paths.manifestPath, 'updated'));

  const dockerStatus = probeDockerContainer(container);
  if (!dockerStatus.ok) warnings.push(dockerStatus.message);

  console.log('\nUpdate applied.');
  printChanges(changes, warnings);
  console.log('\nNext: restart/open a fresh Codex session so updated project instructions and MCP config are reloaded.');
}

function classifyCompatibility(manifest) {
  const installedConfig = Number(manifest.schemas?.config ?? 0);
  const installedMemory = Number(manifest.schemas?.memory ?? 0);

  if (installedConfig > currentSchemas.config) {
    return { safe: false, config: 'breaking', memory: 'unknown', reason: `Installed config schema ${installedConfig} is newer than supported schema ${currentSchemas.config}. No files changed.` };
  }
  if (installedMemory > currentSchemas.memory) {
    return { safe: false, config: 'compatible', memory: 'breaking', reason: `Installed memory schema ${installedMemory} is newer than supported schema ${currentSchemas.memory}. No files changed.` };
  }
  if (installedConfig < currentSchemas.config || installedMemory < currentSchemas.memory) {
    return {
      safe: false,
      config: installedConfig < currentSchemas.config ? 'migration-required' : 'compatible',
      memory: installedMemory < currentSchemas.memory ? 'migration-required' : 'compatible',
      reason: 'This SDD version requires a schema migration that is not implemented yet. No files changed.',
    };
  }

  return { safe: true, config: 'compatible', memory: 'compatible', reason: null };
}

function printUpdatePlan(target, manifest, compatibility, dryRun) {
  console.log(`SDD V2 update plan: ${target}`);
  console.log(`runtime: ${manifest.runtime_version ?? 'unknown'} -> ${runtimeVersion}`);
  console.log(`config schema: ${manifest.schemas?.config ?? 'unknown'} -> ${currentSchemas.config} (${compatibility.config})`);
  console.log(`memory schema: ${manifest.schemas?.memory ?? 'unknown'} -> ${currentSchemas.memory} (${compatibility.memory})`);
  console.log('managed runtime: .sdd/runtime/**');
  console.log('managed shared sections: AGENTS.md, .codex/config.toml');
  console.log('project-owned config: .sdd/config.json (preserved)');
  console.log(`migration required: ${compatibility.safe ? 'no' : 'yes/unsupported'}`);
  console.log(`mode: ${dryRun ? 'dry-run' : 'apply-compatible-update'}`);
}

function installManagedRuntime(kernelPath, changes, target) {
  const kernelSource = path.join(sourceRoot, 'runtime', 'kernel.md');
  const existed = fs.existsSync(kernelPath);
  const source = fs.readFileSync(kernelSource, 'utf8');
  const previous = existed ? fs.readFileSync(kernelPath, 'utf8') : null;
  if (previous === source) {
    changes.push(relative(target, kernelPath, 'unchanged'));
    return;
  }
  fs.mkdirSync(path.dirname(kernelPath), { recursive: true });
  fs.writeFileSync(kernelPath, source);
  changes.push(relative(target, kernelPath, existed ? 'updated' : 'created'));
}

function installAdapterSections(target, paths, projectId, container, changes, warnings) {
  const agentsExisting = readText(paths.agentsPath);
  const agentsContent = upsertManagedSection(agentsExisting, renderAgentsSection());
  writeTextIfChanged(paths.agentsPath, agentsContent, changes, target);

  const codexExisting = readText(paths.codexConfigPath);
  const codex = upsertCodexToml(codexExisting, renderCodexToml(projectId, container));
  if (codex.warning) warnings.push(codex.warning);
  writeTextIfChanged(paths.codexConfigPath, codex.content, changes, target);
}

function newConfig(projectId, container) {
  return {
    schema_version: 1,
    project_id: projectId,
    adapter: 'codex',
    memory: { provider: 'engram', transport: 'docker-mcp', container },
    approval: 'material-decisions',
    evolution: { capture_signals: true, surface: 'material-only' },
  };
}

function newManifest() {
  return {
    schema_version: 1,
    managed_by: 'sdd-v2',
    runtime_version: runtimeVersion,
    schemas: { ...currentSchemas },
    managed_paths: ['.sdd/runtime', '.sdd/manifest.json'],
    managed_sections: ['AGENTS.md#sdd-v2', '.codex/config.toml#sdd-v2'],
  };
}

function projectPaths(target) {
  const sddDir = path.join(target, '.sdd');
  const runtimeDir = path.join(sddDir, 'runtime');
  return {
    runtimeDir,
    configPath: path.join(sddDir, 'config.json'),
    manifestPath: path.join(sddDir, 'manifest.json'),
    kernelPath: path.join(runtimeDir, 'kernel.md'),
    agentsPath: path.join(target, 'AGENTS.md'),
    codexConfigPath: path.join(target, '.codex', 'config.toml'),
  };
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

function parseUpdateArgs(args) {
  const out = { target: null, dryRun: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--dry-run') out.dryRun = true;
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

function ensureDirectory(target) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) fail(`Target is not a directory: ${target}`);
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
  const cleaned = String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!cleaned) fail(`Invalid project id: ${value}`);
  return cleaned;
}

function probeDockerContainer(container) {
  try {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (status === 'healthy') return { ok: true };
    return { ok: false, message: `Engram container ${container} health is ${status || 'unknown'}. SDD files are installed; durable memory may be unavailable.` };
  } catch {
    return { ok: false, message: `Could not verify Docker container ${container}. SDD files are installed; start Engram before durable SDD work.` };
  }
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`Invalid JSON in ${file}: ${error.message}`); }
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

function printChanges(changes, warnings) {
  console.log('');
  for (const item of changes) console.log(`- ${item}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const warning of warnings) console.log(`- ${warning}`);
  }
}

function printHelp() {
  console.log(`SDD V2 Alpha\n\nUsage:\n  sdd-v2 init [target] [--adapter codex] [--project-id id] [--container sdd-engram]\n  sdd-v2 update [target] [--dry-run]\n`);
}

function fail(message) {
  console.error(`sdd-v2: ${message}`);
  process.exit(1);
}
