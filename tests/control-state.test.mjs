import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ensureControlState, openChange } from '../lib/control-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli', 'sdd.mjs');

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-v2-control-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync(process.execPath, [cli, 'init', dir, '--project-id', 'control-demo'], { stdio: 'ignore' });
  return dir;
}

function run(dir, ...args) {
  return execFileSync(process.execPath, [cli, ...args, '--target', dir], { encoding: 'utf8' });
}

test('Change lifecycle allocates canonical IDs and exposes open state deterministically', () => {
  const dir = project();
  const a = JSON.parse(run(dir, 'change', 'open', 'ticket-tags', '--intent', 'Add tags to tickets'));
  const b = JSON.parse(run(dir, 'change', 'open', 'ticket-priority', '--intent', 'Add ticket priority'));

  assert.match(a.id, /^CHG-\d{8}-01$/);
  assert.match(b.id, /^CHG-\d{8}-02$/);
  assert.equal(a.topic_key, `sdd-change/${a.id}`);
  assert.equal(a.status, 'open');

  const status = JSON.parse(run(dir, 'status', '--json'));
  assert.deepEqual(status.open_changes.map((c) => c.id), [a.id, b.id]);

  const bound = JSON.parse(run(dir, 'change', 'bind', a.id, 'obs-123'));
  assert.equal(bound.memory_ref, 'obs-123');
});

test('completed closure is structurally rejected without observed evidence', () => {
  const dir = project();
  const change = JSON.parse(run(dir, 'change', 'open', 'priority', '--intent', 'Add priority'));

  assert.throws(
    () => run(dir, 'change', 'close', change.id),
    (error) => {
      assert.match(String(error.stderr ?? ''), /requires observed evidence/);
      return true;
    },
  );

  const closed = JSON.parse(run(dir, 'change', 'close', change.id, '--evidence', 'php artisan test: 10 passed'));
  assert.equal(closed.status, 'closed');
  assert.equal(closed.close_reason, 'completed');
  assert.match(closed.closure_evidence, /10 passed/);

  const status = JSON.parse(run(dir, 'status', '--json'));
  assert.equal(status.open_changes.length, 0);
});

test('non-completed close reasons do not require fake completion evidence', () => {
  const dir = project();
  const change = JSON.parse(run(dir, 'change', 'open', 'old-direction', '--intent', 'Try old direction'));
  const closed = JSON.parse(run(dir, 'change', 'close', change.id, '--reason', 'superseded'));
  assert.equal(closed.close_reason, 'superseded');
  assert.ok(!('closure_evidence' in closed));
});


test('legacy Alpha.5 Change can be registered without changing its canonical ID', () => {
  const dir = project();
  const legacyId = 'CHG-20260817-09';
  const registered = JSON.parse(run(
    dir,
    'change', 'register', legacyId,
    '--slug', 'legacy-tags',
    '--intent', 'Continue legacy tags UI',
    '--memory-ref', 'obs-legacy-9',
  ));
  assert.equal(registered.id, legacyId);
  assert.equal(registered.memory_ref, 'obs-legacy-9');
  assert.equal(registered.imported_legacy, true);

  const next = JSON.parse(run(dir, 'change', 'open', 'next-change', '--intent', 'Next change'));
  assert.match(next.id, /^CHG-\d{8}-/);
  if (next.id.startsWith('CHG-20260817-')) assert.notEqual(next.id, legacyId);
});

test('first control bootstrap reserves legacy IDs before allocating a same-day Change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-v2-bootstrap-'));
  const bootstrapped = ensureControlState(dir, 'control-demo', {
    legacyIds: ['CHG-20260817-01'],
  });

  const next = openChange(bootstrapped.state, {
    slug: 'ticket-status',
    intent: 'Add ticket status changes',
    now: new Date('2026-08-17T12:00:00-03:00'),
  });

  assert.equal(next.id, 'CHG-20260817-02');
  assert.equal(bootstrapped.state.allocator.high_watermarks['20260817'], 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.sdd', 'state.json'), 'utf8')).allocator.initialized, true);
});

test('first control bootstrap fails closed without a legacy namespace seed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-v2-bootstrap-'));

  assert.throws(
    () => ensureControlState(dir, 'control-demo'),
    /Cannot establish the Change ID namespace safely/,
  );
  assert.equal(fs.existsSync(path.join(dir, '.sdd', 'state.json')), false);
});
