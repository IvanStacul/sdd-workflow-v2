import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli', 'sdd.mjs');

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-v2-skills-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync(process.execPath, [cli, 'init', dir, '--project-id', 'skills-demo'], { stdio: 'ignore' });
  return dir;
}

test('fallback skill resolver returns metadata without bulk-loading bodies', () => {
  const dir = project();
  const custom = path.join(dir, '.agents', 'skills', 'laravel-project');
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, 'SKILL.md'), `---\nname: laravel-project\ndescription: Laravel conventions for this project.\n---\n\nSUPER_SECRET_BODY_THAT_MUST_NOT_BE_IN_DISCOVERY_OUTPUT\n`);

  const output = execFileSync(process.execPath, [cli, 'skills', dir, '--json'], { encoding: 'utf8' });
  const skills = JSON.parse(output);
  const names = skills.map((s) => s.name);

  assert.ok(names.includes('sdd-change'));
  assert.ok(names.includes('sdd-recovery'));
  assert.ok(names.includes('sdd-verify'));
  assert.ok(names.includes('sdd-coordinate'));
  assert.ok(names.includes('laravel-project'));
  assert.doesNotMatch(output, /SUPER_SECRET_BODY/);

  const projectSkill = skills.find((s) => s.name === 'laravel-project');
  assert.equal(projectSkill.kind, 'project');
  const sddSkill = skills.find((s) => s.name === 'sdd-change');
  assert.equal(sddSkill.kind, 'sdd');
});
