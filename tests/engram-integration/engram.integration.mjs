import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

import {
  createApplicationApi,
  createDockerExecEngramTransport,
  createEngramRepository,
  EngramHttpError,
} from '../../src/index.mjs';
import {
  physicalProject,
  physicalSessionId,
} from '../../src/adapters/engram/codec.mjs';

const execFileAsync = promisify(execFile);
const container = process.env.SDD_ENGRAM_CONTAINER || 'sdd-engram';

test('real Engram 1.20.0 repository satisfies the B2 product path', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const projectId = `SDD-V2--B2-Integration-${suffix}`;
  const token = `b2token${suffix}`;
  const transport = createDockerExecEngramTransport({
    container,
  });

  await assertCleanupAccess(transport);

  const physical = physicalProject(projectId);
  const sessionId = physicalSessionId(projectId);

  try {
    const health = await transport.request('GET', '/health');
    assert.equal(health?.status, 'ok');
    assert.equal(health?.service, 'engram');

    const memory = createEngramRepository({ transport });
    const api = createApplicationApi({
      projectId,
      memory,
    });

    const opened = await api.openChange({
      title: 'B2 real Engram integration',
      intent: `Preserve <private>literal-${suffix}</private> and recover exactly.`,
      contract: {
        acceptance: [
          { id: 'A1', condition: 'fresh repository recovers current frontier' },
          { id: 'A2', condition: 'structured Evidence can close the Change' },
        ],
      },
      continuity: {
        next: 'Persist a new frontier.',
      },
    });

    const updated = await api.setFrontier(opened.id, {
      completed: ['initial Change persisted'],
      next: 'Recover from a fresh repository instance.',
    });

    const freshMemory = createEngramRepository({ transport });
    const freshApi = createApplicationApi({
      projectId,
      memory: freshMemory,
    });

    assert.deepEqual(
      await freshApi.getChange(opened.id),
      updated,
    );
    assert.match(
      (await freshApi.getChange(opened.id)).intent,
      /<private>literal-/,
    );

    if (process.env.SDD_ENGRAM_RESTART_TEST === '1') {
      await restartContainer(container);
      await waitForHealth(transport);

      const restartedApi = createApplicationApi({
        projectId,
        memory: createEngramRepository({ transport }),
      });
      assert.deepEqual(
        await restartedApi.getChange(opened.id),
        updated,
      );
    }

    const decision = await api.recordDecision({
      subject_id: opened.id,
      statement: 'Use the audited public Engram HTTP surface behind Memory Port.',
      rationale: 'It preserves the B2 contract without exposing backend concepts to Domain/Application.',
    });
    assert.equal(
      (await api.getDecision(decision.id)).statement,
      decision.statement,
    );

    const evidence = await api.recordEvidence({
      subject_id: opened.id,
      method: 'test',
      result: 'pass',
      summary: 'Fresh repository recovery and structured close path were exercised.',
      covers: ['A1', 'A2'],
      source: {
        command: 'npm run test:engram',
      },
    });

    const knowledge = await api.promoteKnowledge({
      statement: `B2 search marker ${token}`,
      source_refs: [evidence.id],
    });

    const found = await api.searchKnowledge(token);
    assert(
      found.items.some((item) => item.id === knowledge.id),
      'knowledge search did not return the canonical Knowledge record',
    );

    const closed = await api.closeChange(opened.id, {
      reason: 'completed',
      outcome: 'Production Application API persisted and recovered through Engram.',
      evidence_refs: [evidence.id],
    });
    assert.equal(closed.lifecycle, 'closed');
    assert.equal(closed.close.reason, 'completed');

    const stillOpen = await api.openChange({
      title: 'B2 list sentinel',
      intent: 'Remain open for list verification.',
      continuity: {
        next: 'Cleanup after integration test.',
      },
    });

    const listed = await api.listOpenChanges();
    assert.equal(listed.complete, true);
    assert.deepEqual(
      listed.items.map((item) => item.id),
      [stillOpen.id],
    );

    const capabilities = memory.capabilities();
    assert.equal(capabilities.exact_get, true);
    assert.equal(capabilities.conditional_put, false);
    assert.equal(capabilities.max_project_scan_items, 20);
  } finally {
    await cleanupProject(transport, physical, sessionId);
  }
});

async function assertCleanupAccess(transport) {
  try {
    await transport.request(
      'DELETE',
      '/observations/0?hard=true',
    );
    assert.fail('observation id 0 unexpectedly existed');
  } catch (error) {
    if (error instanceof EngramHttpError && error.status === 404) {
      return;
    }

    if (
      error instanceof EngramHttpError
      && (error.status === 401 || error.status === 403)
    ) {
      throw new Error(
        'Engram cleanup routes are protected. Set ENGRAM_HTTP_TOKEN in this shell to the same token configured in the container before running npm run test:engram.',
        { cause: error },
      );
    }

    throw error;
  }
}

async function cleanupProject(transport, project, sessionId) {
  let observations = [];
  try {
    observations = await transport.request(
      'GET',
      `/observations?project=${encodeURIComponent(project)}&scope=project&limit=100&sort=created_at%3Adesc`,
    );
  } catch {
    return;
  }

  for (const observation of observations ?? []) {
    try {
      await transport.request(
        'DELETE',
        `/observations/${observation.id}?hard=true`,
      );
    } catch {
      // Cleanup is best-effort here; a later failure below still surfaces
      // if the session remains non-deletable.
    }
  }

  try {
    await transport.request(
      'DELETE',
      `/sessions/${encodeURIComponent(sessionId)}`,
    );
  } catch (error) {
    if (error instanceof EngramHttpError && error.status === 404) {
      return;
    }
    throw error;
  }
}

async function restartContainer(name) {
  await execFileAsync('docker', ['restart', name], {
    windowsHide: true,
  });
}

async function waitForHealth(transport) {
  let lastError;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const health = await transport.request('GET', '/health');
      if (health?.status === 'ok') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    'Engram did not become healthy after restart',
    { cause: lastError },
  );
}
