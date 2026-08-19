import {
  assertAllowedKeys,
  assertPlainObject,
  compactObject,
  optionalUniqueStrings,
  requiredString,
} from './validation.mjs';
import { validateId } from './ids.mjs';

const INPUT_KEYS = new Set(['statement', 'source_refs']);
const KNOWLEDGE_KEYS = new Set([
  'id',
  'statement',
  'source_refs',
]);
const KNOWLEDGE_PAYLOAD_KEYS = new Set([
  'statement',
  'source_refs',
]);

export function normalizeKnowledgeInput(input) {
  assertPlainObject(input, 'promoteKnowledge input');
  assertAllowedKeys(input, INPUT_KEYS, 'promoteKnowledge input');

  return compactObject({
    statement: requiredString(input.statement, 'statement'),
    source_refs: optionalUniqueStrings(
      input.source_refs,
      'source_refs',
    ),
  });
}

export function buildKnowledge(id, input) {
  validateId(id, 'knowledge');
  return {
    id,
    ...normalizeKnowledgeInput(input),
  };
}

export function normalizeKnowledge(knowledge) {
  assertPlainObject(knowledge, 'Knowledge');
  assertAllowedKeys(knowledge, KNOWLEDGE_KEYS, 'Knowledge');

  return buildKnowledge(knowledge.id, {
    statement: knowledge.statement,
    source_refs: knowledge.source_refs,
  });
}

export function knowledgePayload(knowledge) {
  const normalized = normalizeKnowledge(knowledge);
  const { id, ...payload } = normalized;
  return payload;
}

export function knowledgeFromPayload(id, payload) {
  assertPlainObject(payload, 'Knowledge payload');
  assertAllowedKeys(
    payload,
    KNOWLEDGE_PAYLOAD_KEYS,
    'Knowledge payload',
  );

  return normalizeKnowledge({
    id,
    ...payload,
  });
}
