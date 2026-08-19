import fs from 'node:fs';
import path from 'node:path';

const CONFIG_RELATIVE = path.join('.sdd', 'config.json');
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function createProjectConfig({
  projectId,
} = {}) {
  return {
    schema_version: 1,
    project_id: validateProjectId(projectId),
    memory: {
      adapter: 'engram',
    },
  };
}

export function validateProjectConfig(value) {
  if (!isPlainObject(value)) {
    throw new Error('SDD project config must be an object');
  }

  assertExactKeys(
    value,
    new Set(['schema_version', 'project_id', 'memory']),
    'SDD project config',
  );

  if (value.schema_version !== 1) {
    throw new Error('Unsupported SDD project config schema_version');
  }

  if (!isPlainObject(value.memory)) {
    throw new Error('SDD project config memory must be an object');
  }
  assertExactKeys(
    value.memory,
    new Set(['adapter']),
    'SDD project config memory',
  );
  if (value.memory.adapter !== 'engram') {
    throw new Error(`Unsupported SDD memory adapter: ${String(value.memory.adapter)}`);
  }

  return {
    schema_version: 1,
    project_id: validateProjectId(value.project_id),
    memory: {
      adapter: 'engram',
    },
  };
}

export function loadProjectConfig(projectRoot) {
  const root = path.resolve(projectRoot);
  const configPath = path.join(root, CONFIG_RELATIVE);

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`SDD project config not found: ${configPath}`);
    }
    throw new Error(`Could not read SDD project config: ${configPath}`, {
      cause: error,
    });
  }

  return {
    root,
    path: configPath,
    config: validateProjectConfig(parsed),
  };
}

export function findProjectBinding(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    const configPath = path.join(current, CONFIG_RELATIVE);
    if (fs.existsSync(configPath)) {
      return loadProjectConfig(current);
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `No .sdd/config.json found from ${path.resolve(startDir)} upward`,
      );
    }
    current = parent;
  }
}

export function writeProjectConfig(projectRoot, config) {
  const root = path.resolve(projectRoot);
  const normalized = validateProjectConfig(config);
  const configPath = path.join(root, CONFIG_RELATIVE);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf8',
  );

  return configPath;
}

export function validateProjectId(value) {
  if (typeof value !== 'string' || !PROJECT_ID_RE.test(value)) {
    throw new Error(
      'project_id must match [A-Za-z0-9][A-Za-z0-9._-]{0,127}',
    );
  }
  return value;
}

function isPlainObject(value) {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unsupported field: ${key}`);
    }
  }
}
