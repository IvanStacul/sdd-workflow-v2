const START = '<!-- sdd-v2:start -->';
const END = '<!-- sdd-v2:end -->';
const TOML_START = '# sdd-v2:start';
const TOML_END = '# sdd-v2:end';

export function renderAgentsSection() {
  return [
    START,
    '## SDD V2',
    '',
    'SDD is a small control plane for coding work in this repository, not a mandatory phase workflow.',
    'Read `.sdd/runtime/kernel.md` as the always-loaded contract.',
    '',
    'Runtime integration:',
    '- use `sdd-v2 status --json` before broad memory search when continuing durable work;',
    '- use host-native skill discovery for `sdd-change`, `sdd-recovery`, `sdd-verify`, and `sdd-coordinate`; load only the skill whose trigger applies;',
    '- use `sdd-v2 skills --json` only as a metadata-only fallback resolver; do not bulk-load all skill bodies;',
    '- completed material Change closure is controlled by `sdd-v2 change close` and requires observed evidence;',
    '- `.sdd/config.json.project_id` is authoritative for project memory identity;',
    '- Engram is durable memory, but its session lifecycle is not SDD continuity.',
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
