import {
  physicalProject,
  physicalSessionId,
} from './codec.mjs';
import { EngramHttpError } from './transport.mjs';
import { normalizeEngramError } from './errors.mjs';
import { memoryPortError } from '../../ports/memory.mjs';

export function createEngramSessionManager({
  transport,
  sessionDirectory = 'sdd-v2',
}) {
  if (
    typeof sessionDirectory !== 'string'
    || sessionDirectory.trim() === ''
  ) {
    throw new TypeError('sessionDirectory must be a non-empty string');
  }

  const ready = new Set();

  async function ensure(projectId) {
    const sessionId = physicalSessionId(projectId);
    if (ready.has(sessionId)) return sessionId;

    const project = physicalProject(projectId);

    try {
      const existing = await transport.request(
        'GET',
        `/sessions/${encodeURIComponent(sessionId)}`,
      );
      validateSession(existing, sessionId, project);
      ready.add(sessionId);
      return sessionId;
    } catch (error) {
      if (!(error instanceof EngramHttpError) || error.status !== 404) {
        throw normalizeEngramError(error);
      }
    }

    try {
      await transport.request('POST', '/sessions', {
        id: sessionId,
        project,
        directory: sessionDirectory,
      });
    } catch (createError) {
      // CreateSession is idempotent by ID in Engram 1.20.0. A lost response
      // is reconciled by reading the exact physical session.
      try {
        const reconciled = await transport.request(
          'GET',
          `/sessions/${encodeURIComponent(sessionId)}`,
        );
        validateSession(reconciled, sessionId, project);
        ready.add(sessionId);
        return sessionId;
      } catch {
        throw normalizeEngramError(createError);
      }
    }

    let created;
    try {
      created = await transport.request(
        'GET',
        `/sessions/${encodeURIComponent(sessionId)}`,
      );
    } catch (error) {
      throw normalizeEngramError(error);
    }

    validateSession(created, sessionId, project);
    ready.add(sessionId);
    return sessionId;
  }

  return Object.freeze({ ensure });
}

function validateSession(session, id, project) {
  if (
    !session
    || session.id !== id
    || session.project !== project
  ) {
    throw memoryPortError(
      'backend_error',
      'Engram physical session does not match the SDD project binding',
      {
        session_id: id,
        expected_project: project,
        actual_project: session?.project,
      },
    );
  }
}
