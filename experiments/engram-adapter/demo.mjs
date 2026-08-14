import { mkdir, writeFile } from 'node:fs/promises';
import { InMemoryStore, SddMemory } from './sdd-memory.mjs';
import { exportChangeMarkdown } from './markdown-export.mjs';

const project = 'products-v2-demo';
const store = new InMemoryStore();
const memory = new SddMemory(store, project);

await memory.saveChange({
  id: 'CHG-20260813-01',
  title: 'Products V2',
  status: 'open',
  intent: 'Evolucionar productos mediante slices ejecutables sin roadmap especulativo.',
  scope: ['variantes', 'listas de precios', 'permisos', 'importación'],
  acceptance: ['cada slice mantiene comportamiento verificable'],
  edge_cases: ['producto sin precio específico usa política definida por el change'],
  risks: [{ risk: 'scope creep', mitigation: 'split/spawn cuando el boundary sea material' }],
});

await memory.saveWorkUnit('CHG-20260813-01', {
  id: 'WU-01',
  objective: 'Agregar persistencia mínima de variantes',
  status: 'ready',
  depends_on: [],
  done_when: 'las variantes sobreviven create/edit del producto',
});

await memory.appendDecision('CHG-20260813-01', {
  id: 'D-01',
  title: 'Execution frontier',
  decision: 'Solo materializar el WorkUnit próximo a ejecución.',
});

await memory.promoteKnowledge('shell-windows', {
  title: 'Entorno Windows',
  content: 'Scripts POSIX deben correr en WSL/Git Bash cuando PowerShell no sea compatible.',
});

const markdown = await exportChangeMarkdown(store, project, 'CHG-20260813-01');
await mkdir(new URL('./output/', import.meta.url), { recursive: true });
await writeFile(new URL('./output/CHG-20260813-01-products-v2.md', import.meta.url), markdown);
console.log(markdown);
