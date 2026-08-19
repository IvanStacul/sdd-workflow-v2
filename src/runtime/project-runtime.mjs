import {
  createApplicationApi,
} from '../application/application-api.mjs';
import {
  createEngramRepository,
} from '../adapters/engram/repository.mjs';
import {
  createDockerExecEngramTransport,
} from '../adapters/engram/transport.mjs';
import {
  findProjectBinding,
  loadProjectConfig,
} from '../project/config.mjs';

const CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function createProjectRuntime({
  projectRoot,
  startDir,
  environment = process.env,
  transportFactory = createDockerExecEngramTransport,
  repositoryFactory = createEngramRepository,
  applicationFactory = createApplicationApi,
} = {}) {
  const binding = projectRoot
    ? loadProjectConfig(projectRoot)
    : findProjectBinding(startDir);

  const container = resolveEngramContainer(environment);

  const transport = transportFactory({
    container,
  });

  const memory = repositoryFactory({ transport });
  const api = applicationFactory({
    projectId: binding.config.project_id,
    memory,
  });

  return Object.freeze({
    root: binding.root,
    config: binding.config,
    environment: {
      engram_container: container,
    },
    transport,
    memory,
    api,
  });
}

export function resolveEngramContainer(environment = process.env) {
  const raw = environment?.SDD_ENGRAM_CONTAINER;
  const container = raw === undefined || String(raw).trim() === ''
    ? 'sdd-engram'
    : String(raw).trim();

  if (!CONTAINER_RE.test(container)) {
    throw new Error(
      'SDD_ENGRAM_CONTAINER must match [A-Za-z0-9][A-Za-z0-9_.-]{0,127}',
    );
  }

  return container;
}
