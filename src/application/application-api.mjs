import { createApplicationContext } from './shared.mjs';
import { createChangeService } from './change-service.mjs';
import { createDecisionService } from './decision-service.mjs';
import { createEvidenceService } from './evidence-service.mjs';
import { createKnowledgeService } from './knowledge-service.mjs';

export function createApplicationApi(options) {
  const context = createApplicationContext(options);

  return Object.freeze({
    ...createChangeService(context),
    ...createDecisionService(context),
    ...createEvidenceService(context),
    ...createKnowledgeService(context),
  });
}
