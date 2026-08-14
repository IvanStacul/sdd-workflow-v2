import assert from 'node:assert/strict';
import { chooseRoute, shouldEscalate } from './router.mjs';

const cases = [
  ['change icon label', { clear: true }, 'direct'],
  ['small local validation', { clear: true }, 'direct'],
  ['feature across sessions', { clear: true, needsContinuity: true, multipleSlices: true }, 'compact'],
  ['Products V2 initial', { clear: true, scopeNotLocal: true, multipleSlices: true, moderateRisk: true }, 'compact'],
  ['auth migration', { clear: true, securityBoundary: true, destructiveMigration: true }, 'full'],
  ['shared API redesign', { clear: true, sharedContract: true, crossDomainCoordination: true }, 'full'],
];

for (const [name, signals, expected] of cases) {
  const actual = chooseRoute(signals);
  assert.equal(actual.route, expected, `${name}: ${JSON.stringify(actual)}`);
}

assert.equal(shouldEscalate('direct', { needsContinuity: true })?.route, 'compact');
assert.equal(shouldEscalate('compact', { securityBoundary: true })?.route, 'full');
assert.equal(shouldEscalate('full', { clear: true }), null);

console.log(`PASS: ${cases.length} router scenarios + dynamic escalation.`);
