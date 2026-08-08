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

- rutas candidatas: `direct | delegated | compact | full`;
- posibilidad de escalar ruta durante ejecución;
- Engram como backend default;
- records lógicos iniciales: `ChangeBrief`, `Decision`, `Progress`, `Evidence`, `SessionSummary`;
- Markdown generado solo por pedido, milestone, audit/handoff u otra policy;
- nomenclatura candidata de change: `CHG-YYYYMMDD-NNN-slug`.

## Referencias investigadas

- SDD Workflow V1: baseline del proyecto.
- Gentle AI / Receipt-Driven Development: routing y persistencia adaptable.
- Engram: memoria persistente local, MCP/API/CLI, export JSON y export Markdown/Obsidian.
- Ponytail: disciplina de solución mínima, candidata a policy transversal.
- CodeGraph: proveedor opcional de contexto estructural.
- Matt Pocock Skills / Superpowers / Spec Kit / OpenSpec: referencias para composición de skills y workflows.

## Estado actual

Estamos comenzando el diseño formal de V2.

Primer artefacto de diseño:

```text
docs/change-model.md
```

Define:

- identidad y cronología de changes;
- contenido adaptativo;
- relaciones;
- split vs spawn;
- scope drift;
- records asociados;
- roadmap como proyección;
- independencia del backend.

## Siguiente paso

Diseñar `Memory Contract v0`:

- operaciones mínimas;
- recuperación;
- mutable vs append-only;
- queries necesarias;
- mapeo a Engram;
- garantías de portabilidad.

El router se diseña después.

## Regla de continuidad

Hasta integrar Engram, un nuevo chat debería leer primero:

1. `PROJECT-CONTEXT.md`
2. el documento del tema específico en `docs/`

No cargar automáticamente toda la investigación ni toda la V1.

Cuando Engram quede operativo, este archivo podrá convertirse en snapshot/export y dejar de ser la memoria operativa principal.
