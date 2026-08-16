const START = '<!-- sdd-v2:start -->';
const END = '<!-- sdd-v2:end -->';
const TOML_START = '# sdd-v2:start';
const TOML_END = '# sdd-v2:end';

export function renderAgentsSection() {
  return `${START}
## SDD V2

Use \`.sdd/runtime/kernel.md\` as the operating contract for coding work in this repository.

Runtime rules:
- choose the lightest safe route: \`direct | compact | full\`;
- when a safe executable slice exists, stop planning and act;
- do not pre-create speculative Changes or WorkUnits;
- keep local HOW local unless it becomes a material decision or reusable knowledge;
- verify proportionally before declaring completion;
- use Engram memory only for continuity, material decisions/evidence, reusable knowledge, and workflow signals;
- if Engram is unavailable, direct ephemeral work may continue safely; durable work must surface the degradation before closing;
- do not modify SDD itself during product work; capture reusable workflow friction as a compact signal instead.

Memory naming convention when Engram tools are available:
- Change snapshot: title \`sdd/change/<change-id>\`, topic_key \`sdd-change/<change-id>\`, type \`architecture\`.
- WorkUnit snapshot: title \`sdd/workunit/<change-id>/<wu-id>\`, topic_key \`sdd-workunit/<change-id>-<wu-id>\`, type \`architecture\`.
- Material decision: title \`sdd/decision/<change-id>/<slug>\`, type \`decision\`, append-only unless explicitly superseded.
- Evidence: title \`sdd/evidence/<change-id>/<wu-id>/<kind>\`, type \`discovery\`, append-only.
- Reusable project knowledge: use \`pattern\`, \`config\`, or \`discovery\` as semantically appropriate; use a stable topic_key only when the knowledge evolves.
- Workflow signal: title \`sdd/signal/<slug>\`, topic_key \`sdd-signal/<slug>\`, type \`learning\`; keep evidence/cost concise.

Retrieve progressively: search compactly first, then fetch full observations only when needed. Never bulk-load all SDD memories.
${END}`;
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
