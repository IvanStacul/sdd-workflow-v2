import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNTIME_RULES,
  renderMcpInstructions,
  renderRuntimeProjectionMarkdown,
} from '../../src/runtime/projection.mjs';

test('AGENTS projection and MCP instructions derive from one canonical rule set', () => {
  const markdown = renderRuntimeProjectionMarkdown();
  const instructions = renderMcpInstructions();

  assert(RUNTIME_RULES.length > 0);

  for (const rule of RUNTIME_RULES) {
    assert(markdown.includes(rule));
    assert(instructions.includes(rule));
  }

  assert.match(markdown, /ephemeral/i);
  assert.match(markdown, /structured Evidence/);
  assert.match(markdown, /Same-Change concurrent writers are unsupported/);
  assert.match(markdown, /spawn another Change/);
});
