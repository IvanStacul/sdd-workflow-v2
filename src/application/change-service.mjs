import {
  acceptanceIds,
  addDependencyRelation,
  applyRefinement,
  buildOpenChange,
  buildReceipt,
  changeFromPayload,
  changePayload,
  closeCancelled,
  closeCompleted,
  normalizeOpenChangeInput,
  normalizeReceiptInput,
  setFrontier as applyFrontier,
} from '../domain/change.mjs';
import {
  evidenceRecordFromPayload,
  normalizeEvidenceRefs,
} from '../domain/evidence.mjs';
import {
  assertAllowedKeys,
  assertPlainObject,
} from '../domain/validation.mjs';
import {
  relationInvalid,
  sddError,
} from '../domain/errors.mjs';
import { validateId } from '../domain/ids.mjs';
import {
  allocateRecordId,
  assertMemoryCollectionResult,
  decodePersistedRecord,
  putDomainRecord,
  readDomainRecord,
  translateMemoryError,
} from './shared.mjs';

const LIST_OPTIONS = new Set(['limit', 'cursor']);

export function createChangeService(context) {
  const getChange = (id) =>
    readDomainRecord(context, {
      kind: 'change',
      id,
      fromPayload: changeFromPayload,
    });

  const getEvidence = (id) =>
    readDomainRecord(context, {
      kind: 'evidence',
      id,
      fromPayload: evidenceRecordFromPayload,
    });

  async function listOpenChanges(options = {}) {
    assertPlainObject(options, 'listOpenChanges options');
    assertAllowedKeys(
      options,
      LIST_OPTIONS,
      'listOpenChanges options',
    );

    const selector = {
      project_id: context.projectId,
      kind: 'change',
    };

    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw sddError(
          'invalid_input',
          'listOpenChanges limit must be a positive integer',
        );
      }
      selector.limit = options.limit;
    }

    if (options.cursor !== undefined) {
      if (
        typeof options.cursor !== 'string'
        || options.cursor.trim() === ''
      ) {
        throw sddError(
          'invalid_input',
          'listOpenChanges cursor must be a non-empty string',
        );
      }
      selector.cursor = options.cursor.trim();
    }

    let result;
    try {
      result = await context.memory.list(selector);
    } catch (error) {
      throw translateMemoryError(error);
    }

    try {
      assertMemoryCollectionResult(result, 'memory.list');
      if (typeof result.complete !== 'boolean') {
        throw new Error('complete must be boolean');
      }

      const items = result.items
        .map((record) =>
          decodePersistedRecord(
            record,
            {
              expectedProjectId: context.projectId,
              expectedKind: 'change',
            },
            changeFromPayload,
          ),
        )
        .filter((change) => change.lifecycle === 'open');

      return {
        items,
        complete: result.complete,
        ...(result.next_cursor === undefined
          ? {}
          : { next_cursor: result.next_cursor }),
      };
    } catch (error) {
      if (error?.code === 'memory_error') throw error;
      throw sddError(
        'memory_error',
        'memory.list returned an invalid result',
        {},
        error,
      );
    }
  }

  async function openChange(input) {
    normalizeOpenChangeInput(input);
    const id = await allocateRecordId(context, 'change');
    const change = buildOpenChange(id, input);

    await persistChange(change);
    return change;
  }

  async function createReceipt(input) {
    normalizeReceiptInput(input);
    const id = await allocateRecordId(context, 'change');
    const change = buildReceipt(id, input);

    await persistChange(change);
    return change;
  }

  async function refineChange(id, refinement) {
    const current = await getChange(id);
    const next = applyRefinement(current, refinement);

    await persistChange(next);
    return next;
  }

  async function setFrontier(id, frontier) {
    const current = await getChange(id);
    const next = applyFrontier(current, frontier);

    await persistChange(next);
    return next;
  }

  async function spawnChange(originId, input) {
    validateId(originId, 'change');
    normalizeOpenChangeInput(input);

    await getChange(originId);

    const id = await allocateRecordId(context, 'change');
    const child = buildOpenChange(
      id,
      input,
      {
        relations: {
          spawned_from: originId,
        },
      },
    );

    await persistChange(child);
    return child;
  }

  async function addDependency(id, targetId) {
    validateId(id, 'change');
    validateId(targetId, 'change');

    if (id === targetId) {
      throw relationInvalid('A Change cannot depend on itself', {
        change_id: id,
      });
    }

    const source = await getChange(id);
    await getChange(targetId);

    const next = addDependencyRelation(source, targetId);
    await persistChange(next);
    return next;
  }

  async function closeChange(id, input) {
    validateId(id, 'change');
    assertPlainObject(input, 'closeChange input');

    const current = await getChange(id);

    if (input.reason === 'completed') {
      const refs = normalizeEvidenceRefs(
        input.evidence_refs,
        'evidence_refs',
      ) ?? [];

      const referencedEvidence = [];
      for (const ref of refs) {
        const evidence = await getEvidence(ref);
        if (evidence.subject_id !== current.id) {
          throw relationInvalid(
            `Evidence ${ref} does not belong to Change ${current.id}`,
            {
              evidence_id: ref,
              expected_subject_id: current.id,
              actual_subject_id: evidence.subject_id,
            },
          );
        }
        referencedEvidence.push(evidence);
      }

      const next = closeCompleted(
        current,
        input,
        referencedEvidence,
      );
      await persistChange(next);
      return next;
    }

    if (input.reason === 'cancelled') {
      const next = closeCancelled(current, input);
      await persistChange(next);
      return next;
    }

    throw sddError(
      'invalid_input',
      'closeChange reason must be completed or cancelled',
    );
  }

  async function persistChange(change) {
    await putDomainRecord(context, {
      kind: 'change',
      id: change.id,
      payload: changePayload(change),
    });
  }

  return {
    openChange,
    createReceipt,
    getChange,
    listOpenChanges,
    refineChange,
    setFrontier,
    spawnChange,
    addDependency,
    closeChange,
  };
}
