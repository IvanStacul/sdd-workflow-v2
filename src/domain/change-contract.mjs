import {
  assertAllowedKeys,
  assertPlainObject,
  clone,
  compactObject,
  hasOwn,
  optionalUniqueStrings,
  requiredString,
} from './validation.mjs';
import {
  invalidInput,
  invalidState,
} from './errors.mjs';

const CONTRACT_KEYS = new Set([
  'scope',
  'acceptance',
  'constraints',
  'risks',
  'edge_cases',
  'open_questions',
  'rollback',
]);

const SCOPE_KEYS = new Set(['in', 'out']);
const ACCEPTANCE_KEYS = new Set(['id', 'condition']);
const ROLLBACK_KEYS = new Set(['strategy', 'note']);
const ROLLBACK_STRATEGIES = new Set([
  'revert',
  'disable',
  'migrate_back',
  'manual',
  'other',
]);

export function normalizeContract(value, name = 'contract') {
  if (value === undefined) return undefined;

  assertPlainObject(value, name);
  assertAllowedKeys(value, CONTRACT_KEYS, name);

  const normalized = compactObject({
    scope: normalizeScope(value.scope, `${name}.scope`),
    acceptance: normalizeAcceptance(
      value.acceptance,
      `${name}.acceptance`,
    ),
    constraints: optionalUniqueStrings(
      value.constraints,
      `${name}.constraints`,
    ),
    risks: optionalUniqueStrings(
      value.risks,
      `${name}.risks`,
    ),
    edge_cases: optionalUniqueStrings(
      value.edge_cases,
      `${name}.edge_cases`,
    ),
    open_questions: optionalUniqueStrings(
      value.open_questions,
      `${name}.open_questions`,
    ),
    rollback: normalizeRollback(
      value.rollback,
      `${name}.rollback`,
    ),
  });

  return Object.keys(normalized).length === 0
    ? undefined
    : normalized;
}

export function applyContractPatch(currentContract, patch) {
  assertPlainObject(patch, 'contract_patch');
  assertAllowedKeys(patch, CONTRACT_KEYS, 'contract_patch');

  if (Object.keys(patch).length === 0) {
    throw invalidInput('contract_patch must contain at least one field');
  }

  const next = clone(currentContract ?? {});

  for (const key of CONTRACT_KEYS) {
    if (!hasOwn(patch, key)) continue;

    const value = patch[key];
    if (value === null) {
      delete next[key];
      continue;
    }

    const normalized = normalizeContractSection(
      key,
      value,
      `contract_patch.${key}`,
    );

    if (normalized === undefined) {
      delete next[key];
    } else {
      next[key] = normalized;
    }
  }

  return Object.keys(next).length === 0
    ? undefined
    : normalizeContract(next);
}

export function acceptanceIdsFromContract(contract) {
  return (contract?.acceptance ?? []).map((item) => item.id);
}

function normalizeScope(value, name) {
  if (value === undefined) return undefined;

  assertPlainObject(value, name);
  assertAllowedKeys(value, SCOPE_KEYS, name);

  const normalized = compactObject({
    in: optionalUniqueStrings(value.in, `${name}.in`),
    out: optionalUniqueStrings(value.out, `${name}.out`),
  });

  return Object.keys(normalized).length === 0
    ? undefined
    : normalized;
}

function normalizeAcceptance(value, name) {
  if (value === undefined) return undefined;

  if (!Array.isArray(value)) {
    throw invalidInput(`${name} must be an array`);
  }

  if (value.length === 0) return undefined;

  const seen = new Set();

  return value.map((item, index) => {
    const itemName = `${name}[${index}]`;
    assertPlainObject(item, itemName);
    assertAllowedKeys(item, ACCEPTANCE_KEYS, itemName);

    const id = requiredString(item.id, `${itemName}.id`);
    const condition = requiredString(
      item.condition,
      `${itemName}.condition`,
    );

    if (seen.has(id)) {
      throw invalidInput(`Duplicate acceptance id: ${id}`);
    }
    seen.add(id);

    return { id, condition };
  });
}

function normalizeRollback(value, name) {
  if (value === undefined) return undefined;

  assertPlainObject(value, name);
  assertAllowedKeys(value, ROLLBACK_KEYS, name);

  if (!ROLLBACK_STRATEGIES.has(value.strategy)) {
    throw invalidInput(`${name}.strategy is invalid`, {
      strategy: value.strategy,
    });
  }

  return {
    strategy: value.strategy,
    note: requiredString(value.note, `${name}.note`),
  };
}

function normalizeContractSection(key, value, name) {
  switch (key) {
    case 'scope':
      return normalizeScope(value, name);
    case 'acceptance':
      return normalizeAcceptance(value, name);
    case 'constraints':
    case 'risks':
    case 'edge_cases':
    case 'open_questions':
      return optionalUniqueStrings(value, name);
    case 'rollback':
      return normalizeRollback(value, name);
    default:
      throw invalidState(`Unsupported contract section: ${key}`);
  }
}
