function bullets(items = []) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- _Ninguno._';
}

export async function exportChangeMarkdown(store, project, changeId) {
  const [change] = await store.query({ project, kind: 'change', key: `change:${changeId}` });
  if (!change) throw new Error(`change not found: ${changeId}`);

  const workunits = await store.query({ project, kind: 'workunit', subject: changeId });
  const decisions = await store.query({ project, kind: 'decision', subject: changeId });
  const knowledge = await store.query({ project, kind: 'knowledge' });

  const c = change.payload;
  const lines = [
    `# ${c.id} — ${c.title || c.slug || 'Change'}`,
    '',
    `**Estado:** ${c.status || 'open'}`,
    '',
    '## Intent',
    '',
    c.intent || '_Sin intent registrado._',
    '',
    '## Scope',
    '',
    bullets(c.scope || []),
    '',
    '## Acceptance',
    '',
    bullets(c.acceptance || []),
    '',
  ];

  if ((c.edge_cases || []).length) lines.push('## Edge cases', '', bullets(c.edge_cases), '');
  if ((c.risks || []).length) {
    lines.push('## Risks', '');
    for (const risk of c.risks) lines.push(`- **${risk.risk || risk}**${risk.mitigation ? ` — Mitigación: ${risk.mitigation}` : ''}`);
    lines.push('');
  }

  lines.push('## WorkUnits materializados', '');
  if (!workunits.length) lines.push('_Ninguno._', '');
  for (const { payload: wu } of workunits) {
    lines.push(`### ${wu.id} — ${wu.objective}`, '', `- Estado: ${wu.status}`, `- Done when: ${wu.done_when || '—'}`);
    if ((wu.depends_on || []).length) lines.push(`- Depends on: ${wu.depends_on.join(', ')}`);
    lines.push('');
  }

  lines.push('## Decisions', '');
  if (!decisions.length) lines.push('_Ninguna._', '');
  for (const { payload: d } of decisions) lines.push(`- **${d.title || d.id || 'Decisión'}:** ${d.decision || d.summary || JSON.stringify(d)}`);
  lines.push('');

  lines.push('## Project knowledge aplicado/disponible', '');
  if (!knowledge.length) lines.push('_Ninguno._');
  for (const { payload: k } of knowledge) lines.push(`- **${k.title || 'Knowledge'}:** ${k.content || k.summary || JSON.stringify(k)}`);

  return `${lines.join('\n').trim()}\n`;
}
