# SDD V2 — Change Model v0

> Estado: borrador de diseño.  
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

Nomenclatura candidata:

```text
CHG-YYYYMMDD-NNN-slug
```

Ejemplo:

```text
CHG-20260807-003-cash-transfers
```

La fecha y secuencia representan **orden de creación**, no prioridad.

> La nomenclatura todavía no está cerrada.

### Estado

Estados candidatos:

```text
proposed
active
blocked
completed
cancelled
superseded
split
```

Todavía no definimos una máquina de estados estricta.

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
- estado;
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

## 8. Registros lógicos asociados

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

## 9. Eventos de evolución

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

## 10. Roadmap

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

## 11. Autonomía humana

Queda fuera de este documento, pero se fija una separación conceptual:

```text
ruta/complejidad del change != nivel de intervención humana
```

Hipótesis a explorar después:

> detener al usuario por decisiones materiales, no por terminar fases artificiales.

## 12. Independencia del backend

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

## 13. Export

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

## 14. Preguntas abiertas

1. ¿Cuál es la nomenclatura definitiva del Change ID?
2. ¿Qué estados necesitamos realmente?
3. ¿Hace falta persistir prioridad?
4. ¿Cuándo un trabajo incidental merece un Change y cuándo puede ser efímero/directo?
5. ¿Qué registros deben ser mutables y cuáles append-only?
6. ¿Cuánto del `ChangeBrief` vive junto y cuánto separado?
7. ¿Qué eventos aportan valor suficiente para guardarse?
8. ¿Qué formato tendrá el export Markdown?

## 15. Siguiente paso

Definir el **Memory Contract v0**:

- operaciones mínimas del store;
- identidad y recuperación;
- mutable vs append-only;
- consultas necesarias;
- mapeo inicial a Engram;
- garantías para poder reemplazar Engram en el futuro.

El router se diseña después, sobre un `Change` y un mecanismo de memoria ya claros.
