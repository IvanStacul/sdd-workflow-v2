import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createProjectConfig,
  findProjectBinding,
  loadProjectConfig,
  validateProjectConfig,
  writeProjectConfig,
} from '../../src/project/config.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-b3-config-'));
}

test('project config is minimal, host-independent, strict, and round-trips', () => {
  const config = createProjectConfig({
    projectId: 'demo-app',
  });

  assert.deepEqual(config, {
    schema_version: 1,
    project_id: 'demo-app',
    memory: {
      adapter: 'engram',
    },
  });

  assert.deepEqual(validateProjectConfig(config), config);
});

test('project config rejects arbitrary state, host coupling, environment coupling, and unsupported memory adapters', () => {
  assert.throws(
    () => validateProjectConfig({
      schema_version: 1,
      project_id: 'demo-app',
      memory: {
        adapter: 'engram',
      },
      current_change: 'CHG-anything',
    }),
    /unsupported field/,
  );

  assert.throws(
    () => validateProjectConfig({
      schema_version: 1,
      project_id: 'demo-app',
      host: { adapter: 'codex' },
      memory: {
        adapter: 'engram',
      },
    }),
    /unsupported field: host/,
  );

  assert.throws(
    () => validateProjectConfig({
      schema_version: 1,
      project_id: 'demo-app',
      memory: {
        adapter: 'engram',
        container: 'machine-specific',
      },
    }),
    /unsupported field: container/,
  );

  assert.throws(
    () => validateProjectConfig({
      schema_version: 1,
      project_id: 'demo-app',
      memory: {
        adapter: 'unknown',
      },
    }),
    /Unsupported SDD memory adapter/,
  );
});

test('project binding can be found from nested directories', () => {
  const root = tempDir();
  const nested = path.join(root, 'src', 'feature');
  fs.mkdirSync(nested, { recursive: true });

  const config = createProjectConfig({
    projectId: 'demo-app',
  });
  writeProjectConfig(root, config);

  const found = findProjectBinding(nested);
  assert.equal(found.root, root);
  assert.deepEqual(found.config, config);
});

test('loadProjectConfig rejects invalid JSON without guessing', () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, '.sdd'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.sdd', 'config.json'),
    '{invalid',
  );

  assert.throws(
    () => loadProjectConfig(root),
    /Could not read SDD project config/,
  );
});
