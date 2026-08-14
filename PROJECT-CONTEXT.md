# SDD Workflow V2 — Project Context

> Bootstrap temporal hasta que el Memory Store de V2 esté operativo.

## Objetivo

Diseñar una V2 del workflow SDD que conserve las garantías útiles de la V1 —claridad, riesgos, edge cases, decisiones, verificación y continuidad— reduciendo burocracia, contexto cargado y trabajo documental innecesario.

La V1 permanece como baseline. La V2 se diseña separada para poder comparar ambas cuando exista una implementación suficientemente madura.

## Problemas observados en V1

- demasiado proceso antes de empezar a implementar;
- artefactos y reglas que crecen con el proyecto;
- información repetida entre proposal/spec/design/tasks/state/verify;
- cambios pequeños tratados con demasiado workflow;
- roadmaps que quedan obsoletos cuando el desarrollo real cambia;
- changes que crecen y generan subdivisiones difíciles de representar;
- `interactive | auto` mezcla complejidad con intervención humana;
- continuidad demasiado dependiente de archivos leídos repetidamente.

## Dirección acordada

### Arquitectura conceptual

```text
Request
  -> Router
  -> Change Model / logical records
  -> Memory Store Contract
  -> Engram Adapter (candidato default)
  -> Engram

Memory Store
  -> exporters / projections
      -> Markdown
      -> JSON
      -> Roadmap
      -> Timeline
```

### Principios

1. Engram no define el modelo de SDD.
2. Engram puede ser persistencia primaria sin convertirse en vendor lock-in semántico.
3. Markdown pasa a ser una proyección/export opcional, no necesariamente source of truth.
4. Riesgos, mitigaciones, edge cases, scope, decisiones y evidencia se conservan cuando aportan valor.
5. No se generan secciones solo para cumplir una plantilla.
6. Change identity/history y roadmap son conceptos distintos.
7. Roadmap es una vista derivada del graph de changes.
8. Preferir relaciones (`split_from`, `spawned_from`, `depends_on`, etc.) sobre subchanges jerárquicos rígidos.
9. Complejidad del change y autonomía humana son dimensiones separadas.
10. El agente debería interrumpir por decisiones materiales, no por terminar fases artificiales.

## Componentes a diseñar

- Change Model
- Memory Store Contract
- Engram Adapter
- Router adaptativo
- Policies/skills transversales (Ponytail, TDD, seguridad, etc.)
- Evidence model
- Exporters/projections
- Context providers (nativo, CodeGraph, RAG, etc.)

## Hipótesis actuales, no decisiones finales

- rutas de proceso candidatas: `direct | compact | full`;
- topología de ejecución separada: `inline | delegated | auto`;
- posibilidad de escalar ruta durante ejecución;
- Engram como backend default;
- records lógicos iniciales: `ChangeBrief`, `Decision`, `Progress`, `Evidence`, `SessionSummary`;
- `Change` y unidad de ejecución se separan: se explora `WorkUnit` para bloques pequeños, verificables y potencialmente paralelizables;
- ciclo de vida mínimo candidato: `open | closed`, con motivo de cierre separado;
- identidad preferida: `CHG-YYYYMMDD-NN` estable + slug/título separado;
- Markdown generado solo por pedido, milestone, audit/handoff u otra policy;

## Referencias investigadas

- SDD Workflow V1: baseline del proyecto.
- Gentle AI / Receipt-Driven Development: routing y persistencia adaptable.
- Engram: memoria persistente local, MCP/API/CLI, export JSON y export Markdown/Obsidian.
- Ponytail: disciplina de solución mínima, candidata a policy transversal.
- CodeGraph: proveedor opcional de contexto estructural.
- Matt Pocock Skills / Superpowers / Spec Kit / OpenSpec: referencias para composición de skills y workflows.

## Estado actual

Estamos comenzando el diseño formal de V2.

Artefactos de diseño actuales:

```text
docs/change-model.md
docs/workunit-model.md
docs/execution-contract.md
docs/memory-contract.md
```

`change-model.md` define identidad, cronología, contenido adaptativo, relaciones, split/spawn, scope drift y roadmap como proyección.

`workunit-model.md` separa la intención del Change de la unidad real de ejecución y define materialización lazy, execution frontier, incidencias útiles, promoción de descubrimientos, dependencias y paralelismo emergente.

`execution-contract.md` fija policies compactas de mínima solución suficiente, action-first y libertad local del executor.

`memory-contract.md` define cinco primitives backend-agnostic (`put`, `append`, `get`, `query`, `search`), recuperación progresiva y Engram como adapter sin delegarle la semántica SDD.

## Siguiente paso

Probar el `Memory Contract v0.1` contra Engram mediante un **adapter spike mínimo**, sin construir todavía todo el workflow:

1. guardar/actualizar un Change canónico;
2. materializar un WorkUnit lazy;
3. append de una decisión/evidence;
4. recuperar contexto selectivo;
5. promover un discovery reusable;
6. exportar esos records a Markdown con un projector nuestro.

El objetivo del spike es descubrir qué parte del contrato sobra o falta antes de diseñar el Router definitivo.

## Regla de continuidad

Hasta integrar Engram, un nuevo chat debería leer primero:

1. `PROJECT-CONTEXT.md`
2. el documento del tema específico en `docs/`

No cargar automáticamente toda la investigación ni toda la V1.

Cuando Engram quede operativo, este archivo podrá convertirse en snapshot/export y dejar de ser la memoria operativa principal.

## Update — Execution Contract v0.1

Nueva decisión de diseño:

- Skills/filosofías como minimalidad, comunicación compacta, TDD o seguridad deben actuar como policies transversales, no fases.
- El core no depende de una skill externa concreta: consume contratos compactos derivados de policies.
- Se adopta `Minimum Sufficient Change`: mínima solución correcta, sin abstracción/dependencia/refactor especulativo.
- Se adopta `Action First`: no explicar un HOW detallado antes de implementar cuando el slice ya es seguro; comunicar decisiones materiales, bloqueos y resultado/evidencia.
- El HOW local queda bajo autonomía del executor; solo se persiste si afecta coordinación, arquitectura, scope, recuperación o decisión humana.
- WorkUnit Model evoluciona a v0.2 con materialización lazy, execution frontier y DAG emergente.
