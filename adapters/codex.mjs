const START = '<!-- sdd-v2:start -->';
const END = '<!-- sdd-v2:end -->';
const TOML_START = '# sdd-v2:start';
const TOML_END = '# sdd-v2:end';

export function renderAgentsSection() {
  return [
    START,
    '## SDD V2',
    '',
    'Use `.sdd/runtime/kernel.md` as the always-loaded operating contract for coding work in this repository.',
    'Use `.sdd/runtime/memory.md` only when durable SDD memory or recovery is required; do not load it for purely ephemeral work.',
    '',
    'Core rules:',
    '- choose planning route `direct | compact | full` independently from durability `ephemeral | receipt | continuity`;',
    '- when a safe executable slice exists, stop planning and act;',
    '- explicit pending work across sessions/handoffs => `continuity` even if route is `direct`;',
    '- completed material domain/schema/API/tooling/security/policy work => at least `receipt` unless already covered by a durable Change;',
    '- cosmetic/mechanical/local work may remain `ephemeral`;',
    '- WorkUnits are lazy; never create them retroactively just to satisfy a receipt;',
    '- verify actual acceptance proportionally before completion;',
    '- before any durable SDD write/recovery, load `.sdd/runtime/memory.md` and follow its canonical IDs/record shapes;',
    '- Engram usage is value-driven: additional memory tools are allowed when they materially improve context, recovery, or quality; stop retrieval when more context cannot change the next action;',
    '- on recovery, if the durable Change already gives a concrete executable frontier, inspect only the implicated code and act instead of reconstructing or re-planning the prior session;',
    '- Engram session lifecycle/session summaries are optional complements; never create or retry a session merely to satisfy SDD continuity when the canonical Change is already persisted;',
    '- `.sdd/config.json.project_id` is authoritative for SDD memory identity;',
    '- do not modify SDD itself during product work; capture high-value reusable workflow friction as a signal.',
    '',
    'Do not bulk-load all SDD memories by default.',
    END,
  ].join('\n');
}

export function renderCodexToml(projectId, containerName = 'sdd-engram') {
  const safeProject = tomlString(projectId);
  const safeContainer = tomlString(containerName);
  return `${TOML_START}
[mcp_servers.engram]
command = "docker"
args = ["exec", "-i", "-e", "ENGRAM_PROJECT=${safeProject}", "${safeContainer}", "engram", "mcp", "--tools=agent"]
enabled = true
required = false
startup_timeout_sec = 10
tool_timeout_sec = 30
${TOML_END}`;
}

export function upsertManagedSection(existing, rendered) {
  const text = existing ?? '';
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start >= 0 && end >= start) {
    const before = text.slice(0, start).trimEnd();
    const after = text.slice(end + END.length).trimStart();
    return joinParts(before, rendered, after);
  }
  return joinParts(text.trimEnd(), rendered, '');
}

export function upsertCodexToml(existing, rendered) {
  const text = existing ?? '';
  const start = text.indexOf(TOML_START);
  const end = text.indexOf(TOML_END);
  if (start >= 0 && end >= start) {
    const before = text.slice(0, start).trimEnd();
    const after = text.slice(end + TOML_END.length).trimStart();
    return { content: joinParts(before, rendered, after), warning: null };
  }

  if (/^\s*\[mcp_servers\.engram\]\s*$/m.test(text)) {
    return {
      content: text,
      warning: 'Existing [mcp_servers.engram] is user-owned; preserved without changes.'
    };
  }

  return { content: joinParts(text.trimEnd(), rendered, ''), warning: null };
}

function joinParts(before, middle, after) {
  return [before, middle, after].filter(Boolean).join('\n\n').replace(/\s+$/, '') + '\n';
}

function tomlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
