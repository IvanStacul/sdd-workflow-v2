export const RUNTIME_RULES = Object.freeze([
  'Use SDD tools only for durable SDD semantics; normal repo inspection, editing, shell, tests, browser work and subagents remain host capabilities.',
  'Trivial work may stay ephemeral: act, verify proportionally, and finish with zero SDD writes.',
  'For material work completed in the current run, create a receipt only when durable traceability is useful.',
  'Open a Change when intent or frontier must survive handoff, restart, or another agent.',
  'Keep Change contracts adaptive: persist scope, acceptance, constraints, risks, edge cases, open questions, or rollback only when they change safe execution or verification.',
  'Recover a known Change by exact get, then inspect the repo narrowly from its current frontier and act instead of reconstructing a broad plan by default.',
  'Before handoff, persist a compact current frontier: confirmed completed facts, actionable next, and real blockers.',
  'Close completed only from actual host observations expressed as structured Evidence; never invent verification.',
  'If new material intent appears outside current scope, spawn another Change instead of silently widening the original.',
  'Persist Decisions only when they materially need to survive; promote Knowledge only when a project fact is reusable and costly enough to rediscover.',
  'Same-Change concurrent writers are unsupported; parallelize durable work across independent Changes or use sequential handoff.',
  'Never use Engram observations, topic keys, sessions, or other backend details as canonical SDD state.',
]);

export function renderRuntimeProjectionMarkdown() {
  return [
    '## SDD V2',
    '',
    ...RUNTIME_RULES.map((rule) => `- ${rule}`),
    '',
  ].join('\n');
}

export function renderMcpInstructions() {
  return RUNTIME_RULES.join(' ');
}
