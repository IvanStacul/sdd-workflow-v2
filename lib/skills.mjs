import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['.agents/skills', '.codex/skills', '.opencode/skills', '.claude/skills', '.cursor/skills', '.gemini/skills'];

export function discoverSkills(target) {
  const seen = new Set();
  const results = [];
  for (const relativeRoot of ROOTS) {
    const root = path.join(target, relativeRoot);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(root, entry.name, 'SKILL.md');
      if (!fs.existsSync(file)) continue;
      const meta = readSkillMetadata(file);
      const key = `${meta.name}\0${path.resolve(file)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        name: meta.name,
        description: meta.description,
        kind: meta.name.startsWith('sdd-') ? 'sdd' : 'project',
        path: path.relative(target, file).replace(/\\/g, '/'),
      });
    }
  }
  return results.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

export function readSkillMetadata(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(8192);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, read).toString('utf8');
    const match = head.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return { name: path.basename(path.dirname(file)), description: '' };
    const fm = match[1];
    return {
      name: scalar(fm, 'name') || path.basename(path.dirname(file)),
      description: scalar(fm, 'description') || '',
    };
  } finally {
    fs.closeSync(fd);
  }
}

function scalar(frontmatter, key) {
  const line = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!line) return '';
  return line[1].trim().replace(/^['"]|['"]$/g, '');
}
