# SDD V2 — Change Model v0.1

> Estado: borrador experimental. Se fijan solo invariantes ya acordadas; los detalles operativos se validarán usando la V2.  
> Objetivo: definir cómo SDD V2 representa un cambio y la evolución del proyecto sin depender de Engram, Markdown ni otro backend particular.

## 1. Por qué existe

La V1 logró trazabilidad y continuidad, pero acumuló fricción: demasiados artefactos obligatorios, changes que crecían durante la ejecución, roadmaps que quedaban obsoletos, subdivisiones difíciles de representar y un `interactive | auto` que mezclaba complejidad con intervención humana.

La V2 separa:

```text
modelo lógico      ≠ almacenamiento
historia           ≠ roadmap
change             ≠ conversación
complejidad        ≠ autonomía humana
estado             ≠ documentación exportada
```

## 2. Principios acordados

### P1 — Engram no define SDD

Engram puede ser el backend principal, pero el modelo debe ser nuestro:

```text
SDD Model -> Memory Store Contract -> Engram Adapter
                              \-----> otro backend
```

### P2 — Markdown es una proyección posible

Hipótesis actual:

```text
estado operativo -> Memory Store
Markdown         -> export opcional
roadmap          -> vista derivada
timeline         -> vista derivada
```

### P3 — Conservar riqueza, reducir obligatoriedad

Seguimos valorando:

- intención;
- alcance / no-objetivos;
- criterios de aceptación;
- edge cases;
- riesgos y mitigaciones;
- decisiones y trade-offs;
- preguntas abiertas;
- rollback cuando aplique;
- evidencia.

La diferencia es que no todas esas secciones son obligatorias para todos los changes.

### P4 — La identidad es estable

El orden de creación debe poder reconstruirse aunque cambie la prioridad o el roadmap.

### P5 — Relaciones antes que jerarquías

No se fuerza un árbol `change -> subchange -> subchange`. Los changes son nodos independientes relacionados explícitamente.

## 3. Change

Un `Change` es una unidad de intención suficientemente independiente como para rastrearse, ejecutarse, dividirse, posponerse, reemplazarse o verificarse.

### Identidad

La identidad canónica se separa del nombre legible. Propuesta preferida:

```text
ID estable:   CHG-YYYYMMDD-NN
slug/título:  cash-transfers
export/view:  CHG-YYYYMMDD-NN-cash-transfers
```

Ejemplo:

```text
id:    CHG-20260807-03
slug:  cash-transfers
title: Transferencias entre cajas
```

La fecha y secuencia representan **orden de creación**, no prioridad. El `slug` puede evolucionar sin romper referencias al change. La asignación de secuencia deberá ser responsabilidad del store/runtime para evitar colisiones cuando haya concurrencia.

> Esta es la opción preferida de v0.1, pero se validará en uso antes de declararla definitiva.

### Ciclo de vida mínimo

La V2 evita una máquina de estados rica hasta tener evidencia de que hace falta. El núcleo usa:

```text
open
closed
```

El motivo de cierre es información separada:

```text
completed | cancelled | superseded | split
```

`blocked` no es un estado de ciclo de vida: es una condición derivable de blockers/preguntas/dependencias abiertas. Del mismo modo, las antiguas fases de V1 no se convierten en estados del Change.

### Contenido lógico

```yaml
change:
  id: CHG-20260807-003-cash-transfers
  status: active
  intent: "Permitir transferencias de efectivo entre cajas"

  scope:
    in: []
    out: []

  acceptance: []
  edge_cases: []

  risks:
    - risk: ""
      impact: ""
      mitigation: ""

  open_questions: []
```

Es un modelo conceptual. No obliga a guardar YAML ni a completar arrays vacíos.

## 4. Información adaptativa

### Siempre

- identidad;
- intención;
- ciclo de vida (`open | closed`);
- cronología básica.

### Cuando aporta

- scope / no-objetivos;
- aceptación;
- edge cases.

### Cuando hay riesgo material

- riesgos;
- mitigaciones;
- rollback.

### Cuando hay complejidad o continuidad

- decisiones;
- diseño/especificación adicional;
- progreso entre sesiones.

### Al cerrar

- evidencia suficiente.

Regla:

> Registrar información porque reduce ambigüedad, riesgo o pérdida de contexto; no porque exista una sección en una plantilla.

## 5. Relaciones entre changes

Relaciones iniciales:

| Relación | Uso |
|---|---|
| `spawned_from` | Se descubrió durante otro change, pero no pertenecía necesariamente a su scope original. |
| `split_from` | Pertenecía al scope original, pero se separó porque el change era demasiado grande. |
| `depends_on` | Necesita el resultado de otro change. |
| `blocks` | Impide avanzar otro change. |
| `related_to` | Relación relevante sin dependencia fuerte. |
| `supersedes` | Reemplaza conceptualmente a otro change. |

## 6. Split vs Spawn

### Split

El trabajo **ya estaba dentro del scope** y se descubre que necesita una unidad independiente.

```text
CHG-010 Gestión avanzada de caja
  -> split CHG-011 Apertura/cierre
  -> split CHG-012 Transferencias
  -> split CHG-013 Conciliación
```

### Spawn

Aparece una necesidad nueva y no queremos ampliar silenciosamente el change actual.

```text
CHG-013 Conciliación
  -> spawned CHG-020 Importación de extractos
```

Esta distinción ayuda a controlar scope creep y a reconstruir cómo evolucionó el sistema.

## 7. Scope drift durante ejecución

Casos básicos:

```text
sigue dentro del scope       -> continuar
scope original era muy grande -> split
aparece necesidad nueva      -> spawn
aumenta riesgo/ambigüedad    -> escalar tratamiento
```

La conversación no redefine automáticamente el scope.

Si el usuario pide una tarea independiente durante otro change, esa tarea puede ejecutarse aparte sin contaminar el change activo.

## 8. Change != unidad de ejecución

Un `Change` conserva la intención y evolución funcional. No debe convertirse en un paquete de 20+ tareas que el modelo tenga que sostener simultáneamente en contexto.

La V2 introduce como hipótesis fuerte una unidad más pequeña de ejecución: `WorkUnit` (nombre provisional).

```text
Change
  -> WorkUnit A
  -> WorkUnit B
  -> WorkUnit C
```

Un WorkUnit debe ser cohesivo, razonable para una sola ventana de trabajo y verificable de forma independiente. La cantidad máxima exacta de tareas **no se fija todavía**; se validará empíricamente y podrá depender de complejidad/capacidad del modelo.

Propiedades candidatas:

```yaml
work_unit:
  id: WU-...
  change_id: CHG-...
  objective: ...
  tasks: []
  depends_on: []
  conflicts_with: []
  execution_notes: []
  evidence: []
```

### Errores y descubrimientos durante apply

Un fallo de ejecución no crea automáticamente otro Change. Ejemplos: comando pensado para Linux ejecutado desde PowerShell/CMD, herramienta ausente, path incorrecto o diferencia de shell.

Regla candidata:

```text
error local/reintentable             -> queda en WorkUnit/Progress
restricción reusable del entorno     -> promover a conocimiento de proyecto
cambia scope o comportamiento        -> evaluar split/spawn/change
decisión material                    -> Decision / consulta al usuario
```

Esto evita que el modelo repita errores ya descubiertos sin convertir cada incidente en burocracia permanente.

### Paralelismo

Los WorkUnits, no los Changes completos, son los candidatos naturales para paralelismo. Dos bloques pueden ejecutarse en paralelo cuando:

- no dependen entre sí;
- no modifican recursos fuertemente solapados;
- pueden verificarse independientemente;
- el runtime/agente dispone de capacidad real de delegación.

El paralelismo es una optimización del executor, no una obligación del Change Model.

## 9. Registros lógicos asociados

No queremos trasladar literalmente `proposal.md + spec.md + design.md + tasks.md + state.md + verify.md` a seis memorias.

Hipótesis inicial:

### `ChangeBrief`

Intención y contexto necesario: scope, aceptación, edge cases, riesgos y preguntas solo cuando aportan valor.

### `Decision`

Decisiones no triviales con contexto, alternativas/trade-offs y consecuencias.

Una decisión nueva puede superseder una anterior; no debe borrarla silenciosamente.

### `Progress`

Estado recuperable para trabajo que atraviesa sesiones. No es un log exhaustivo.

### `Evidence`

Prueba de cumplimiento: tests, lint/typecheck, integración, revisión, CI u otra evidencia verificable.

### `SessionSummary`

Resumen para sobrevivir pérdida de contexto:

- objetivo trabajado;
- cambios relevantes;
- decisiones;
- descubrimientos;
- preguntas abiertas;
- siguiente paso.

## 10. Eventos de evolución

No persistimos cada acción. Solo eventos que explican cambios importantes en la historia del proyecto.

Candidatos:

```text
change_created
change_split
change_spawned
change_blocked
change_superseded
scope_changed
route_escalated
change_completed
```

Todavía no está definido cuáles son realmente necesarios.

## 11. Roadmap

El roadmap no es un documento autoritativo mantenido manualmente.

Se deriva de:

```text
changes
+ estados
+ dependencias/bloqueos
+ relaciones split/spawn
+ prioridad, si finalmente se modela
```

Por eso puede cambiar sin alterar identidad ni historia.

```text
Change Graph -> Roadmap View
```

## 12. Autonomía humana

Queda fuera de este documento, pero se fija una separación conceptual:

```text
ruta/complejidad del change != nivel de intervención humana
```

Hipótesis a explorar después:

> detener al usuario por decisiones materiales, no por terminar fases artificiales.

## 13. Independencia del backend

El modelo debe persistirse detrás de un contrato abstracto:

```text
Change Model
    -> Memory Store Contract
        -> Engram Adapter   (candidato por defecto)
        -> File Adapter     (fallback/testing posible)
        -> otros backends
```

SDD no debería depender directamente de:

- schema SQLite de Engram;
- tablas internas;
- `topic_key` como identidad de dominio;
- tipos internos de observación.

## 14. Export

El export consume el modelo lógico recuperado del store:

```text
Memory Store
  -> SDD records
      -> Markdown
      -> JSON
      -> roadmap
      -> timeline
```

Así podemos recuperar documentos ricos con riesgos, edge cases, decisiones y evidencia **sin escribirlos obligatoriamente durante el flujo**.

## 15. Decisiones v0.1 y preguntas abiertas

### Preferencias actuales

1. **Identidad:** `CHG-YYYYMMDD-NN` estable + `slug/title` separado. El formato de export puede combinar ambos.
2. **Estado:** ciclo de vida mínimo `open | closed`; `blocked` es condición, y `completed/cancelled/superseded/split` son motivos de cierre.
3. **Prioridad:** no forma parte del núcleo del Change por ahora. El roadmap puede ordenar cambios sin mutar su identidad ni exigir un número de prioridad persistente.
4. **Trabajo incidental:** el router decide por defecto y consulta solo cuando el impacto sea material/ambiguo. Un ajuste directo puede ser efímero; si modifica scope/aceptación/arquitectura de un Change, debe quedar relacionado o incorporado explícitamente.
5. **Append-only:** evitar múltiples logs. Mantener un único historial/event stream mínimo para evolución relevante; el resto puede ser snapshot mutable. Decisions que sean reemplazadas deben preservar la anterior mediante relación `supersedes`.
6. **ChangeBrief:** mantener junto el núcleo (intent/scope/acceptance/edge cases/risks/open questions). Separar solo entidades históricas o de alta cardinalidad como Decisions, Evidence runs y eventos.
7. **Eventos:** guardar solo los que explican evolución del proyecto (`created`, `split/spawn`, cambio material de scope, supersede, cierre). Los errores cotidianos de ejecución viven en WorkUnit/Progress salvo que se conviertan en conocimiento reusable o cambien el Change.
8. **Export:** Markdown estándar es el formato canónico inicial. Una proyección Obsidian puede existir después como variante (frontmatter/wikilinks), sin contaminar el modelo base.

### Preguntas que deben validarse usando la V2

- ¿Cuál es el tamaño máximo/recomendado de un WorkUnit para distintos modelos y complejidades?
- ¿Qué información mínima debe sobrevivir entre WorkUnits para que modelos menos potentes no pierdan el hilo?
- ¿Cómo representar conocimiento reusable de entorno/herramientas sin convertirlo en otra capa documental pesada?
- ¿Qué heurística permite paralelizar WorkUnits con seguridad y bajo conflicto?
- ¿Cuándo vale la pena materializar un roadmap y qué criterios de orden necesita?
- ¿Qué eventos, además del núcleo propuesto, terminan demostrando valor real durante el uso?

## 16. Siguiente paso

El **Execution/WorkUnit Model v0.1** quedó definido en `docs/workunit-model.md`. Formaliza bloques pequeños, contexto heredado, incidencias, promoción de descubrimientos, dependencias, paralelismo y replanificación sin fijar todavía heurísticas numéricas rígidas.

El siguiente paso es diseñar el **Memory Contract v0** solamente con las operaciones que Change + WorkUnit realmente necesiten. El router se diseña después sobre ambos modelos, no sobre una máquina de fases.
