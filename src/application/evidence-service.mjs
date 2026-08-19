import {
  acceptanceIds,
  changeFromPayload,
} from '../domain/change.mjs';
import {
  assertKnownCoverage,
  buildEvidenceRecord,
  evidenceRecordFromPayload,
  evidenceRecordPayload,
  normalizeEvidenceRecordInput,
} from '../domain/evidence.mjs';
import {
  allocateRecordId,
  putDomainRecord,
  readDomainRecord,
} from './shared.mjs';

export function createEvidenceService(context) {
  const getEvidence = (id) =>
    readDomainRecord(context, {
      kind: 'evidence',
      id,
      fromPayload: evidenceRecordFromPayload,
    });

  const getChange = (id) =>
    readDomainRecord(context, {
      kind: 'change',
      id,
      fromPayload: changeFromPayload,
    });

  async function recordEvidence(input) {
    const normalized = normalizeEvidenceRecordInput(input);
    const change = await getChange(normalized.subject_id);

    assertKnownCoverage(
      normalized.evidence,
      acceptanceIds(change),
    );

    const id = await allocateRecordId(context, 'evidence');
    const evidence = buildEvidenceRecord(id, {
      subject_id: normalized.subject_id,
      ...normalized.evidence,
    });
    const encoded = evidenceRecordPayload(evidence);

    await putDomainRecord(context, {
      kind: 'evidence',
      id,
      subjectId: encoded.subject_id,
      payload: encoded.payload,
    });

    return evidence;
  }

  return {
    recordEvidence,
    getEvidence,
  };
}
