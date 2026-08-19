import {
  assertAllowedKeys,
  assertPlainObject,
  clone,
  compactObject,
  optionalUniqueStrings,
  requiredString,
  uniqueStrings,
} from './validation.mjs';
import {
  acceptanceIdsFromContract,
  applyContractPatch,
  normalizeContract,
} from './change-contract.mjs';
import {
  assertCompletionEvidence,
  normalizeEvidenceList,
} from './evidence.mjs';
import {
  buildCancelledClose,
  buildCompletedClose,
  normalizePersistedClose,
} from './change-closure.mjs';
import {
  closureRejected,
  invalidInput,
  invalidState,
  relationInvalid,
} from './errors.mjs';
import { validateId } from './ids.mjs';

const OPEN_INPUT_KEYS = new Set([
  'title',
  'intent',
  'contract',
  'continuity',
]);

const CHANGE_KEYS = new Set([
  'id',
  'title',
  'intent',
  'lifecycle',
  'contract',
  'continuity',
  'relations',
  'close',
]);

const CHANGE_PAYLOAD_KEYS = new Set([
  'title',
  'intent',
  'lifecycle',
  'contract',
  'continuity',
  'relations',
  'close',
]);

const RECEIPT_INPUT_KEYS = new Set([
  'title',
  'intent',
  'contract',
  'outcome',
  'evidence',
]);

const CONTINUITY_KEYS = new Set([
  'completed',
  'next',
  'blockers',
]);

const RELATION_KEYS = new Set([
  'spawned_from',
  'depends_on',
  'split_from',
  'supersedes',
]);

const REFINEMENT_KEYS = new Set([
  'title',
  'intent',
  'contract_patch',
]);

export {
  normalizeContract,
} from './change-contract.mjs';

export function normalizeOpenChangeInput(input) {
  assertPlainObject(input, 'openChange input');
  assertAllowedKeys(input, OPEN_INPUT_KEYS, 'openChange input');

  return compactObject({
    title: requiredString(input.title, 'title'),
    intent: requiredString(input.intent, 'intent'),
    contract: normalizeContract(input.contract),
    continuity: normalizeContinuity(input.continuity),
  });
}

export function buildOpenChange(id, input, { relations } = {}) {
  validateId(id, 'change');
  const normalized = normalizeOpenChangeInput(input);

  return compactObject({
    id,
    title: normalized.title,
    intent: normalized.intent,
    lifecycle: 'open',
    contract: normalized.contract,
    continuity: normalized.continuity,
    relations: normalizeRelations(relations, id),
  });
}

export function normalizeReceiptInput(input) {
  assertPlainObject(input, 'createReceipt input');
  assertAllowedKeys(input, RECEIPT_INPUT_KEYS, 'createReceipt input');

  const contract = normalizeContract(input.contract);
  const evidence = normalizeEvidenceList(input.evidence, 'evidence');

  assertCompletionEvidence(
    evidence,
    acceptanceIdsFromContract(contract),
  );

  return compactObject({
    title: requiredString(input.title, 'title'),
    intent: requiredString(input.intent, 'intent'),
    contract,
    outcome: requiredString(input.outcome, 'outcome'),
    evidence,
  });
}

export function buildReceipt(id, input) {
  validateId(id, 'change');
  const normalized = normalizeReceiptInput(input);

  return compactObject({
    id,
    title: normalized.title,
    intent: normalized.intent,
    lifecycle: 'closed',
    contract: normalized.contract,
    close: {
      reason: 'completed',
      outcome: normalized.outcome,
      evidence: normalized.evidence,
    },
  });
}

export function applyRefinement(change, refinement) {
  assertOpenChange(change);
  assertPlainObject(refinement, 'refinement');
  assertAllowedKeys(refinement, REFINEMENT_KEYS, 'refinement');

  if (
    refinement.title === undefined
    && refinement.intent === undefined
    && refinement.contract_patch === undefined
  ) {
    throw invalidInput(
      'refineChange requires title, intent, or contract_patch',
    );
  }

  const next = clone(change);

  if (refinement.title !== undefined) {
    next.title = requiredString(refinement.title, 'refinement.title');
  }

  if (refinement.intent !== undefined) {
    next.intent = requiredString(refinement.intent, 'refinement.intent');
  }

  if (refinement.contract_patch !== undefined) {
    next.contract = applyContractPatch(
      next.contract,
      refinement.contract_patch,
    );
    if (next.contract === undefined) {
      delete next.contract;
    }
  }

  return normalizeChange(next);
}

export function setFrontier(change, frontier) {
  assertOpenChange(change);

  const next = clone(change);
  next.continuity = normalizeContinuity(frontier, 'frontier');
  return normalizeChange(next);
}

export function addDependencyRelation(change, targetId) {
  assertOpenChange(change);
  validateId(targetId, 'change');

  if (change.id === targetId) {
    throw relationInvalid('A Change cannot depend on itself', {
      change_id: change.id,
    });
  }

  const next = clone(change);
  const existing = next.relations?.depends_on ?? [];

  if (existing.includes(targetId)) {
    throw relationInvalid('Dependency already exists', {
      change_id: change.id,
      target_id: targetId,
    });
  }

  next.relations = {
    ...(next.relations ?? {}),
    depends_on: [...existing, targetId],
  };

  return normalizeChange(next);
}

export function closeCompleted(
  change,
  input,
  referencedEvidence = [],
) {
  assertOpenChange(change);

  if ((change.continuity?.blockers ?? []).length > 0) {
    throw closureRejected(
      `Change ${change.id} has active blockers`,
      { blockers: clone(change.continuity.blockers) },
    );
  }

  const next = clone(change);
  next.lifecycle = 'closed';
  next.close = buildCompletedClose(
    input,
    change.contract,
    referencedEvidence,
  );
  delete next.continuity;

  return normalizeChange(next);
}

export function closeCancelled(change, input) {
  assertOpenChange(change);

  const next = clone(change);
  next.lifecycle = 'closed';
  next.close = buildCancelledClose(input);
  delete next.continuity;

  return normalizeChange(next);
}

export function normalizeChange(change) {
  assertPlainObject(change, 'Change');
  assertAllowedKeys(change, CHANGE_KEYS, 'Change');

  const id = validateId(change.id, 'change');
  const lifecycle = change.lifecycle;

  if (lifecycle !== 'open' && lifecycle !== 'closed') {
    throw invalidInput('Change.lifecycle must be open or closed');
  }

  const base = compactObject({
    id,
    title: requiredString(change.title, 'Change.title'),
    intent: requiredString(change.intent, 'Change.intent'),
    lifecycle,
    contract: normalizeContract(change.contract, 'Change.contract'),
    relations: normalizeRelations(change.relations, id),
  });

  if (lifecycle === 'open') {
    if (change.close !== undefined) {
      throw invalidInput('Open Change cannot contain close');
    }

    return {
      ...base,
      continuity: normalizeContinuity(
        change.continuity,
        'Change.continuity',
      ),
    };
  }

  if (change.continuity !== undefined) {
    throw invalidInput('Closed Change cannot contain continuity');
  }

  return {
    ...base,
    close: normalizePersistedClose(
      change.close,
      base.contract,
    ),
  };
}

export function changePayload(change) {
  const normalized = normalizeChange(change);
  const { id, ...payload } = normalized;
  return payload;
}

export function changeFromPayload(id, payload) {
  assertPlainObject(payload, 'Change payload');
  assertAllowedKeys(
    payload,
    CHANGE_PAYLOAD_KEYS,
    'Change payload',
  );

  return normalizeChange({
    id,
    ...clone(payload),
  });
}

export function acceptanceIds(change) {
  return acceptanceIdsFromContract(change.contract);
}

function normalizeContinuity(value, name = 'continuity') {
  assertPlainObject(value, name);
  assertAllowedKeys(value, CONTINUITY_KEYS, name);

  return compactObject({
    completed: optionalUniqueStrings(
      value.completed,
      `${name}.completed`,
    ),
    next: requiredString(value.next, `${name}.next`),
    blockers: optionalUniqueStrings(
      value.blockers,
      `${name}.blockers`,
    ),
  });
}

function normalizeRelations(value, selfId) {
  if (value === undefined) return undefined;

  assertPlainObject(value, 'relations');
  assertAllowedKeys(value, RELATION_KEYS, 'relations');

  const spawnedFrom = value.spawned_from === undefined
    ? undefined
    : validateRelationTarget(
      value.spawned_from,
      selfId,
      'relations.spawned_from',
    );

  const splitFrom = value.split_from === undefined
    ? undefined
    : validateRelationTarget(
      value.split_from,
      selfId,
      'relations.split_from',
    );

  const supersedes = value.supersedes === undefined
    ? undefined
    : validateRelationTarget(
      value.supersedes,
      selfId,
      'relations.supersedes',
    );

  let dependsOn;
  if (value.depends_on !== undefined) {
    dependsOn = uniqueStrings(
      value.depends_on,
      'relations.depends_on',
    );
    dependsOn.forEach((id) =>
      validateRelationTarget(id, selfId, 'relations.depends_on'),
    );
    if (dependsOn.length === 0) {
      dependsOn = undefined;
    }
  }

  const normalized = compactObject({
    spawned_from: spawnedFrom,
    depends_on: dependsOn,
    split_from: splitFrom,
    supersedes,
  });

  return Object.keys(normalized).length === 0
    ? undefined
    : normalized;
}

function validateRelationTarget(value, selfId, name) {
  const id = validateId(value, 'change');
  if (id === selfId) {
    throw relationInvalid(`${name} cannot reference the same Change`, {
      change_id: selfId,
    });
  }
  return id;
}


function assertOpenChange(change) {
  const normalized = normalizeChange(change);
  if (normalized.lifecycle !== 'open') {
    throw invalidState(`Change ${normalized.id} is closed`);
  }
}
