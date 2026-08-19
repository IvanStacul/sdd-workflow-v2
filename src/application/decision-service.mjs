import {
  buildDecision,
  decisionFromPayload,
  decisionPayload,
  normalizeDecisionInput,
} from '../domain/decision.mjs';
import { changeFromPayload } from '../domain/change.mjs';
import {
  allocateRecordId,
  putDomainRecord,
  readDomainRecord,
} from './shared.mjs';

export function createDecisionService(context) {
  const getDecision = (id) =>
    readDomainRecord(context, {
      kind: 'decision',
      id,
      fromPayload: decisionFromPayload,
    });

  const getChange = (id) =>
    readDomainRecord(context, {
      kind: 'change',
      id,
      fromPayload: changeFromPayload,
    });

  async function recordDecision(input) {
    const normalized = normalizeDecisionInput(input);

    if (normalized.subject_id !== undefined) {
      await getChange(normalized.subject_id);
    }

    if (normalized.supersedes !== undefined) {
      await getDecision(normalized.supersedes);
    }

    const id = await allocateRecordId(context, 'decision');
    const decision = buildDecision(id, normalized);
    const encoded = decisionPayload(decision);

    await putDomainRecord(context, {
      kind: 'decision',
      id,
      subjectId: encoded.subject_id,
      payload: encoded.payload,
    });

    return decision;
  }

  return {
    recordDecision,
    getDecision,
  };
}
