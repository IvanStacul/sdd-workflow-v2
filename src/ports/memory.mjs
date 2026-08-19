const MEMORY_ERROR_CODES = new Set([
  'not_found',
  'ambiguous',
  'unavailable',
  'unsupported',
  'invalid',
  'backend_error',
]);

export class MemoryPortError extends Error {
  constructor(code, message, details = {}, options = {}) {
    super(message, options);
    this.name = 'MemoryPortError';
    this.code = code;
    this.details = details;
  }
}

export function memoryPortError(
  code,
  message,
  details = {},
  cause,
) {
  if (!MEMORY_ERROR_CODES.has(code)) {
    throw new Error(`Invalid MemoryPort error code: ${String(code)}`);
  }

  return new MemoryPortError(
    code,
    message,
    details,
    cause === undefined ? {} : { cause },
  );
}

export function assertMemoryPort(memory) {
  if (
    memory === null
    || typeof memory !== 'object'
    || typeof memory.put !== 'function'
    || typeof memory.get !== 'function'
    || typeof memory.list !== 'function'
  ) {
    throw new TypeError(
      'memory must implement put(record), get(ref), and list(selector)',
    );
  }

  if (
    memory.search !== undefined
    && typeof memory.search !== 'function'
  ) {
    throw new TypeError('memory.search must be a function when provided');
  }

  return memory;
}

export function isMemoryPortError(error) {
  return (
    error instanceof MemoryPortError
    || (
      error !== null
      && typeof error === 'object'
      && MEMORY_ERROR_CODES.has(error.code)
    )
  );
}
