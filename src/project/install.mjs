import fs from 'node:fs';
import path from 'node:path';

import {
  createProjectConfig,
  loadProjectConfig,
  writeProjectConfig,
} from './config.mjs';
import {
  applyCodexBootstrap,
  planCodexBootstrap,
} from '../hosts/codex/bootstrap.mjs';
import {
  renderRuntimeProjectionMarkdown,
} from '../runtime/projection.mjs';

export function initProject(projectRoot, options = {}) {
  const {
    projectId,
  } = options;

  const root = path.resolve(projectRoot);
  fs.mkdirSync(root, { recursive: true });

  const configPath = path.join(root, '.sdd', 'config.json');
  let config;
  let configCreated = false;

  if (fs.existsSync(configPath)) {
    const binding = loadProjectConfig(root);
    config = binding.config;

    if (
      projectId !== undefined
      && projectId !== config.project_id
    ) {
      throw new Error(
        `Existing project_id ${config.project_id} does not match requested ${projectId}`,
      );
    }
  } else {
    config = createProjectConfig({
      projectId,
    });
    configCreated = true;
  }

  const hostPlan = planCodexBootstrap(
    root,
    renderRuntimeProjectionMarkdown(),
  );

  if (configCreated) {
    writeProjectConfig(root, config);
  }

  const host = applyCodexBootstrap(hostPlan);

  return {
    root,
    config,
    config_created: configCreated,
    ...host,
  };
}
