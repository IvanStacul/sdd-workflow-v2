import {
  MemoryPortError,
} from '../../src/ports/memory.mjs';

function keyOf(value) {
  return `${value.project_id}\u0000${value.kind}\u0000${value.id}`;
}

function clone(value) {
  return structuredClone(value);
}

export class InMemoryMemory {
  constructor({
    complete = true,
    searchSupported = true,
  } = {}) {
    this.records = new Map();
    this.complete = complete;
    this.searchSupported = searchSupported;
    this.putCount = 0;
    this.getCount = 0;
    this.listCount = 0;
    this.searchCount = 0;
    this.failures = {
      put: [],
      get: [],
      list: [],
      search: [],
    };
  }

  failNext(operation, code, message = `Injected ${operation} failure`) {
    this.failures[operation].push(
      new MemoryPortError(code, message),
    );
  }

  seed(record) {
    this.records.set(keyOf(record), clone(record));
  }

  rawRecords() {
    return clone([...this.records.values()]);
  }

  async put(record) {
    this.putCount += 1;
    this.#maybeFail('put');
    this.records.set(keyOf(record), clone(record));
    return clone(record);
  }

  async get(ref) {
    this.getCount += 1;
    this.#maybeFail('get');

    const record = this.records.get(keyOf(ref));
    if (!record) {
      throw new MemoryPortError(
        'not_found',
        `Record not found: ${keyOf(ref)}`,
      );
    }

    return clone(record);
  }

  async list(selector) {
    this.listCount += 1;
    this.#maybeFail('list');

    let items = [...this.records.values()].filter((record) =>
      record.project_id === selector.project_id
      && (
        selector.kind === undefined
        || record.kind === selector.kind
      ),
    );

    let complete = this.complete;
    if (
      Number.isInteger(selector.limit)
      && items.length > selector.limit
    ) {
      items = items.slice(0, selector.limit);
      complete = false;
    }

    return {
      items: clone(items),
      complete,
      ...(complete
        ? {}
        : { next_cursor: 'in-memory-next' }),
    };
  }

  async search(text, filters = {}) {
    this.searchCount += 1;

    if (!this.searchSupported) {
      throw new MemoryPortError(
        'unsupported',
        'Search not supported',
      );
    }

    this.#maybeFail('search');

    const needle = text.toLowerCase();
    const items = [...this.records.values()].filter((record) => {
      if (
        filters.project_id !== undefined
        && record.project_id !== filters.project_id
      ) {
        return false;
      }

      if (
        filters.kind !== undefined
        && record.kind !== filters.kind
      ) {
        return false;
      }

      return JSON.stringify(record.payload)
        .toLowerCase()
        .includes(needle);
    });

    return { items: clone(items) };
  }

  #maybeFail(operation) {
    const queue = this.failures[operation];
    if (queue.length > 0) {
      throw queue.shift();
    }
  }
}

export function createSequenceIdFactory(idsByKind) {
  const queues = Object.fromEntries(
    Object.entries(idsByKind).map(([kind, ids]) => [
      kind,
      [...ids],
    ]),
  );

  let calls = 0;

  const factory = (kind) => {
    calls += 1;
    const queue = queues[kind] ?? [];
    if (queue.length === 0) {
      throw new Error(`No deterministic ${kind} IDs left`);
    }
    return queue.shift();
  };

  factory.calls = () => calls;
  return factory;
}
