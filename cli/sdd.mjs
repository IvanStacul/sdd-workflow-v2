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
import {
  CONTROL_SCHEMA,
  bindMemoryRef,
  closeChange,
  ensureControlState,
  listChanges,
  openChange,
  registerChange,
  readControlState,
  writeControlState,
} from '../lib/control-state.mjs';
import { discoverSkills } from '../lib/skills.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
const runtimeVersion = packageJson.version;
const currentSchemas = { config: 1, memory: 1, control: CONTROL_SCHEMA };
const managedRuntimeFiles = ['kernel.md'];
const managedSkillNames = ['sdd-change', 'sdd-recovery', 'sdd-verify', 'sdd-coordinate'];

main();

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || ['-h', '--help', 'help'].includes(command)) return printHelp();

  if (command === 'init') {
    const parsed = parseInitArgs(args);
    return initProject(path.resolve(parsed.target ?? process.cwd()), parsed);
  }

  if (command === 'update') {
    const parsed = parseUpdateArgs(args);
    return updateProject(path.resolve(parsed.target ?? process.cwd()), parsed);
  }

  if (command === 'status') {
    const parsed = parseSimpleTargetArgs(args);
    return printStatus(path.resolve(parsed.target ?? process.cwd()), parsed.json);
  }

  if (command === 'skills') {
    const parsed = parseSimpleTargetArgs(args);
    return printSkills(path.resolve(parsed.target ?? process.cwd()), parsed.json);
  }

  if (command === 'change') return handleChange(args);

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

  const stateResult = ensureControlState(target, projectId);
  changes.push(relative(target, paths.statePath, stateResult.created ? 'created' : 'preserved'));

  installManagedRuntime(paths.runtimeDir, changes, target);
  installSddGitignore(paths, changes, target);
  removeDeprecatedRuntime(paths.runtimeDir, changes, target);
  installManagedSkills(target, changes);
  installAdapterSections(target, paths, projectId, container, changes, warnings);

  const manifestExisted = fs.existsSync(paths.manifestPath);
  writeJson(paths.manifestPath, newManifest());
  changes.push(relative(target, paths.manifestPath, manifestExisted ? 'updated' : 'created'));

  const dockerStatus = probeDockerContainer(container);
  if (!dockerStatus.ok) warnings.push(dockerStatus.message);

  console.log(`SDD V2 initialized: ${target}`);
  console.log(`project_id: ${projectId}`);
  console.log('adapter: codex');
  console.log(`runtime: ${runtimeVersion}`);
  console.log(`memory: engram via Docker container ${container}`);
  printChanges(changes, warnings);
  console.log('\nNext: open a fresh Codex session so AGENTS.md, project skills and MCP config are reloaded.');
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

  changes.push(relative(target, paths.configPath, 'preserved'));
  const stateResult = ensureControlState(target, projectId);
  changes.push(relative(target, paths.statePath, stateResult.created ? 'created' : 'preserved'));
  if (stateResult.created && Number(manifest.schemas?.control ?? 0) === 0) {
    warnings.push('Control state bootstrapped empty. Legacy open Changes in Engram are not guessed or renumbered; recover one by exact memory lookup, then use `sdd-v2 change register <id> ... --memory-ref <ref>`.');
  }

  installManagedRuntime(paths.runtimeDir, changes, target);
  installSddGitignore(paths, changes, target);
  removeDeprecatedRuntime(paths.runtimeDir, changes, target);
  installManagedSkills(target, changes);
  installAdapterSections(target, paths, projectId, container, changes, warnings);
  writeJson(paths.manifestPath, newManifest());
  changes.push(relative(target, paths.manifestPath, 'updated'));

  const dockerStatus = probeDockerContainer(container);
  if (!dockerStatus.ok) warnings.push(dockerStatus.message);

  console.log('\nUpdate applied.');
  printChanges(changes, warnings);
  console.log('\nNext: restart/open a fresh Codex session so the micro-kernel and SDD protocol skills are reloaded.');
}

function classifyCompatibility(manifest) {
  const installedConfig = Number(manifest.schemas?.config ?? 0);
  const installedMemory = Number(manifest.schemas?.memory ?? 0);
  const installedControl = Number(manifest.schemas?.control ?? 0);

  if (installedConfig > currentSchemas.config) {
    return { safe: false, config: 'breaking', memory: 'unknown', control: 'unknown', reason: `Installed config schema ${installedConfig} is newer than supported schema ${currentSchemas.config}. No files changed.` };
  }
  if (installedMemory > currentSchemas.memory) {
    return { safe: false, config: 'compatible', memory: 'breaking', control: 'unknown', reason: `Installed memory schema ${installedMemory} is newer than supported schema ${currentSchemas.memory}. No files changed.` };
  }
  if (installedConfig < currentSchemas.config || installedMemory < currentSchemas.memory) {
    return {
      safe: false,
      config: installedConfig < currentSchemas.config ? 'migration-required' : 'compatible',
      memory: installedMemory < currentSchemas.memory ? 'migration-required' : 'compatible',
      control: installedControl === currentSchemas.control ? 'compatible' : 'unknown',
      reason: 'This SDD version requires a config/memory schema migration that is not implemented yet. No files changed.',
    };
  }
  if (installedControl > currentSchemas.control) {
    return { safe: false, config: 'compatible', memory: 'compatible', control: 'breaking', reason: `Installed control schema ${installedControl} is newer than supported schema ${currentSchemas.control}. No files changed.` };
  }

  return {
    safe: true,
    config: 'compatible',
    memory: 'compatible',
    control: installedControl < currentSchemas.control ? 'migration-supported' : 'compatible',
    reason: null,
  };
}

function printUpdatePlan(target, manifest, compatibility, dryRun) {
  console.log(`SDD V2 update plan: ${target}`);
  console.log(`runtime: ${manifest.runtime_version ?? 'unknown'} -> ${runtimeVersion}`);
  console.log(`config schema: ${manifest.schemas?.config ?? 'unknown'} -> ${currentSchemas.config} (${compatibility.config})`);
  console.log(`memory schema: ${manifest.schemas?.memory ?? 'unknown'} -> ${currentSchemas.memory} (${compatibility.memory})`);
  console.log(`control schema: ${manifest.schemas?.control ?? 0} -> ${currentSchemas.control} (${compatibility.control})`);
  console.log('managed runtime: .sdd/runtime/kernel.md');
  console.log('managed SDD skills: .agents/skills/sdd-*');
  console.log('persistent machine state: .sdd/state.json');
  console.log('project-owned config: .sdd/config.json (preserved)');
  console.log(`migration required: ${compatibility.safe ? (compatibility.control === 'migration-supported' ? 'supported control bootstrap' : 'no') : 'yes/unsupported'}`);
  console.log(`mode: ${dryRun ? 'dry-run' : 'apply-compatible-update'}`);
}

function handleChange(args) {
  const subcommand = args.shift();
  if (!subcommand || ['-h', '--help', 'help'].includes(subcommand)) return printChangeHelp();

  if (subcommand === 'open') {
    const parsed = parseChangeOpenArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    const { state } = loadProjectState(target);
    const record = openChange(state, parsed);
    writeControlState(target, state);
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (subcommand === 'register') {
    const parsed = parseChangeRegisterArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    const { state } = loadProjectState(target);
    try {
      const record = registerChange(state, parsed);
      writeControlState(target, state);
      console.log(JSON.stringify(record, null, 2));
    } catch (error) {
      fail(error.message);
    }
    return;
  }

  if (subcommand === 'bind') {
    const parsed = parseChangeBindArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    const { state } = loadProjectState(target);
    const record = bindMemoryRef(state, parsed.id, parsed.memoryRef);
    writeControlState(target, state);
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  if (subcommand === 'close') {
    const parsed = parseChangeCloseArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    const { state } = loadProjectState(target);
    try {
      const record = closeChange(state, parsed.id, parsed);
      writeControlState(target, state);
      console.log(JSON.stringify(record, null, 2));
    } catch (error) {
      fail(error.message);
    }
    return;
  }

  if (subcommand === 'list') {
    const parsed = parseChangeListArgs(args);
    const target = path.resolve(parsed.target ?? process.cwd());
    const { state } = loadProjectState(target);
    return outputChanges(listChanges(state, { status: parsed.status }), parsed.json);
  }

  fail(`Unknown change command: ${subcommand}`);
}

function printStatus(target, json) {
  const { config, state } = loadProjectState(target);
  const open = listChanges(state, { status: 'open' });
  if (json) {
    console.log(JSON.stringify({ project_id: config.project_id, runtime_version: runtimeVersion, open_changes: open }, null, 2));
    return;
  }
  console.log(`project_id: ${config.project_id}`);
  console.log(`runtime: ${runtimeVersion}`);
  if (!open.length) return console.log('open Changes: none');
  console.log('open Changes:');
  for (const item of open) console.log(`- ${item.id}  ${item.slug}  ${item.memory_ref ? `memory=${item.memory_ref}` : 'memory=unbound'}`);
}

function printSkills(target, json) {
  ensureDirectory(target);
  const skills = discoverSkills(target);
  if (json) return console.log(JSON.stringify(skills, null, 2));
  if (!skills.length) return console.log('No project-visible skills found.');
  for (const skill of skills) console.log(`${skill.name}\t${skill.kind}\t${skill.path}\t${skill.description}`);
}

function outputChanges(changes, json) {
  if (json) return console.log(JSON.stringify(changes, null, 2));
  if (!changes.length) return console.log('No Changes found.');
  for (const item of changes) console.log(`${item.id}\t${item.status}\t${item.slug}\t${item.title}`);
}

function loadProjectState(target) {
  ensureDirectory(target);
  const paths = projectPaths(target);
  const config = readJsonIfExists(paths.configPath);
  if (!config) fail(`Missing SDD config: ${paths.configPath}`);
  let state;
  try { state = readControlState(target); }
  catch (error) { fail(error.message); }
  if (!state) fail(`Missing SDD control state: ${paths.statePath}. Run sdd-v2 update first.`);
  if (state.project_id !== config.project_id) fail(`Control state project_id ${state.project_id} does not match config project_id ${config.project_id}.`);
  return { config, state };
}

function installManagedRuntime(runtimeDir, changes, target) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  for (const filename of managedRuntimeFiles) {
    const sourcePath = path.join(sourceRoot, 'runtime', filename);
    const targetPath = path.join(runtimeDir, filename);
    copyManagedFile(sourcePath, targetPath, changes, target);
  }
}

function installSddGitignore(paths, changes, target) {
  const content = '# SDD local machine control state\nstate.json\n';
  const existed = fs.existsSync(paths.sddGitignorePath);
  const previous = existed ? fs.readFileSync(paths.sddGitignorePath, 'utf8') : null;
  if (previous === content) {
    changes.push(relative(target, paths.sddGitignorePath, 'unchanged'));
    return;
  }
  fs.mkdirSync(path.dirname(paths.sddGitignorePath), { recursive: true });
  fs.writeFileSync(paths.sddGitignorePath, content);
  changes.push(relative(target, paths.sddGitignorePath, existed ? 'updated' : 'created'));
}

function removeDeprecatedRuntime(runtimeDir, changes, target) {
  for (const filename of ['memory.md']) {
    const file = path.join(runtimeDir, filename);
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file);
    changes.push(relative(target, file, 'deleted'));
  }
}

function installManagedSkills(target, changes) {
  for (const name of managedSkillNames) {
    const sourceDir = path.join(sourceRoot, 'skills', name);
    const targetDir = path.join(target, '.agents', 'skills', name);
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      copyManagedFile(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), changes, target);
    }
  }
}

function copyManagedFile(sourcePath, targetPath, changes, root) {
  const existed = fs.existsSync(targetPath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const previous = existed ? fs.readFileSync(targetPath, 'utf8') : null;
  if (previous === source) {
    changes.push(relative(root, targetPath, 'unchanged'));
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, source);
  changes.push(relative(root, targetPath, existed ? 'updated' : 'created'));
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
  };
}

function newManifest() {
  return {
    schema_version: 1,
    managed_by: 'sdd-v2',
    runtime_version: runtimeVersion,
    schemas: { ...currentSchemas },
    managed_paths: ['.sdd/runtime/kernel.md', '.sdd/manifest.json', '.sdd/.gitignore', '.agents/skills/sdd-*'],
    persistent_paths: ['.sdd/config.json', '.sdd/state.json'],
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
    statePath: path.join(sddDir, 'state.json'),
    sddGitignorePath: path.join(sddDir, '.gitignore'),
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

function parseSimpleTargetArgs(args) {
  const out = { target: null, json: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json') out.json = true;
    else if (arg === '--target') out.target = requiredValue(arg, args);
    else if (arg.startsWith('-')) fail(`Unknown option: ${arg}`);
    else if (!out.target) out.target = arg;
    else fail(`Unexpected argument: ${arg}`);
  }
  return out;
}

function parseChangeOpenArgs(args) {
  const slug = args.shift();
  if (!slug || slug.startsWith('-')) fail('change open requires <slug>.');
  const out = { slug: sanitizeSlug(slug), title: null, intent: null, target: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--intent') out.intent = requiredValue(arg, args);
    else if (arg === '--title') out.title = requiredValue(arg, args);
    else if (arg === '--target') out.target = requiredValue(arg, args);
    else fail(`Unknown option for change open: ${arg}`);
  }
  if (!out.intent) fail('change open requires --intent "...".');
  return out;
}

function parseChangeRegisterArgs(args) {
  const id = args.shift();
  if (!id) fail('change register requires <canonical-id>.');
  const out = { id, slug: null, title: null, intent: null, memoryRef: null, target: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--slug') out.slug = sanitizeSlug(requiredValue(arg, args));
    else if (arg === '--title') out.title = requiredValue(arg, args);
    else if (arg === '--intent') out.intent = requiredValue(arg, args);
    else if (arg === '--memory-ref') out.memoryRef = requiredValue(arg, args);
    else if (arg === '--target') out.target = requiredValue(arg, args);
    else fail(`Unknown option for change register: ${arg}`);
  }
  if (!out.slug) fail('change register requires --slug.');
  if (!out.intent) fail('change register requires --intent.');
  return out;
}

function parseChangeBindArgs(args) {
  const id = args.shift();
  const memoryRef = args.shift();
  if (!id || !memoryRef) fail('change bind requires <id> <memory-ref>.');
  const out = { id, memoryRef, target: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--target') out.target = requiredValue(arg, args);
    else fail(`Unknown option for change bind: ${arg}`);
  }
  return out;
}

function parseChangeCloseArgs(args) {
  const id = args.shift();
  if (!id) fail('change close requires <id>.');
  const out = { id, reason: 'completed', evidence: null, evidenceRef: null, target: null };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--reason') out.reason = requiredValue(arg, args);
    else if (arg === '--evidence') out.evidence = requiredValue(arg, args);
    else if (arg === '--evidence-ref') out.evidenceRef = requiredValue(arg, args);
    else if (arg === '--target') out.target = requiredValue(arg, args);
    else fail(`Unknown option for change close: ${arg}`);
  }
  return out;
}

function parseChangeListArgs(args) {
  const out = { status: null, target: null, json: false };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--status') out.status = requiredValue(arg, args);
    else if (arg === '--target') out.target = requiredValue(arg, args);
    else if (arg === '--json') out.json = true;
    else fail(`Unknown option for change list: ${arg}`);
  }
  if (out.status && !['open', 'closed'].includes(out.status)) fail('--status must be open or closed.');
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

function sanitizeSlug(value) {
  const cleaned = String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  if (!cleaned) fail(`Invalid slug: ${value}`);
  return cleaned;
}

function probeDockerContainer(container) {
  try {
    const status = execFileSync('docker', ['inspect', '--format', '{{.State.Health.Status}}', container], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (status === 'healthy') return { ok: true };
    return { ok: false, message: `Engram container ${container} health is ${status || 'unknown'}. SDD control state is available; durable memory may be unavailable.` };
  } catch {
    return { ok: false, message: `Could not verify Docker container ${container}. SDD control state is available; start Engram before durable semantic/history memory work.` };
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
  console.log(`SDD V2 ${runtimeVersion}\n\nUsage:\n  sdd-v2 init [target] [--adapter codex] [--project-id id] [--container sdd-engram]\n  sdd-v2 update [target] [--dry-run]\n  sdd-v2 status [target] [--json]\n  sdd-v2 skills [target] [--json]\n  sdd-v2 change open <slug> --intent \"...\" [--title \"...\"] [--target path]\n  sdd-v2 change register <canonical-id> --slug <slug> --intent "..." [--memory-ref ref] [--target path]\n  sdd-v2 change bind <id> <memory-ref> [--target path]\n  sdd-v2 change close <id> [--reason completed|cancelled|superseded|split] [--evidence \"...\"] [--evidence-ref ref] [--target path]\n  sdd-v2 change list [--status open|closed] [--json] [--target path]\n`);
}

function printChangeHelp() {
  console.log('Use `sdd-v2 help` for Change commands.');
}

function fail(message) {
  console.error(`sdd-v2: ${message}`);
  process.exit(1);
}
