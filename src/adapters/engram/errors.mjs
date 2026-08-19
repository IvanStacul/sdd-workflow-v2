import {
  EngramHttpError,
  EngramTransportError,
} from './transport.mjs';
import { memoryPortError } from '../../ports/memory.mjs';

const MEMORY_CODES = new Set([
  'not_found',
  'ambiguous',
  'unavailable',
  'unsupported',
  'invalid',
  'backend_error',
]);

export function normalizeEngramError(error) {
  if (error instanceof EngramTransportError) {
    return memoryPortError(
      'unavailable',
      'Engram transport is unavailable',
      error.details ?? {},
      error,
    );
  }

  if (
    error
    && typeof error === 'object'
    && MEMORY_CODES.has(error.code)
  ) {
    return error;
  }

  if (error instanceof EngramHttpError) {
    if (error.status === 404) {
      return memoryPortError(
        'not_found',
        error.message,
        { status: error.status },
        error,
      );
    }

    if (error.status === 401 || error.status === 403) {
      return memoryPortError(
        'unavailable',
        'Engram request is not authorized',
        { status: error.status },
        error,
      );
    }

    return memoryPortError(
      'backend_error',
      `Engram HTTP ${error.status}: ${error.message}`,
      { status: error.status },
      error,
    );
  }

  return memoryPortError(
    'backend_error',
    'Unexpected Engram repository failure',
    {},
    error,
  );
}

export function normalizeEngramCollection(value) {
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw memoryPortError(
      'backend_error',
      'Engram collection response must be an array or null',
    );
  }
  return value;
}
