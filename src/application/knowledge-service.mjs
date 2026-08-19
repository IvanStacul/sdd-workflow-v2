import {
  buildKnowledge,
  knowledgeFromPayload,
  knowledgePayload,
  normalizeKnowledgeInput,
} from '../domain/knowledge.mjs';
import {
  requiredString,
} from '../domain/validation.mjs';
import {
  allocateRecordId,
  assertMemoryCollectionResult,
  decodePersistedRecord,
  putDomainRecord,
  translateMemoryError,
} from './shared.mjs';
import { sddError } from '../domain/errors.mjs';

export function createKnowledgeService(context) {
  async function promoteKnowledge(input) {
    const normalized = normalizeKnowledgeInput(input);
    const id = await allocateRecordId(context, 'knowledge');
    const knowledge = buildKnowledge(id, normalized);

    await putDomainRecord(context, {
      kind: 'knowledge',
      id,
      payload: knowledgePayload(knowledge),
    });

    return knowledge;
  }

  async function searchKnowledge(query) {
    const text = requiredString(query, 'query');

    if (typeof context.memory.search !== 'function') {
      throw sddError(
        'memory_unsupported',
        'Durable memory does not support knowledge search',
      );
    }

    let result;
    try {
      result = await context.memory.search(text, {
        project_id: context.projectId,
        kind: 'knowledge',
      });
    } catch (error) {
      throw translateMemoryError(error);
    }

    try {
      assertMemoryCollectionResult(result, 'memory.search');

      return {
        items: result.items.map((record) =>
          decodePersistedRecord(
            record,
            {
              expectedProjectId: context.projectId,
              expectedKind: 'knowledge',
            },
            knowledgeFromPayload,
          ),
        ),
      };
    } catch (error) {
      if (error?.code === 'memory_error') throw error;
      throw sddError(
        'memory_error',
        'memory.search returned an invalid result',
        {},
        error,
      );
    }
  }

  return {
    promoteKnowledge,
    searchKnowledge,
  };
}
