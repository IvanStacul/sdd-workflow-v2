# SDD V2 — Memory Contract v0.1

> Estado: borrador experimental.
> Objetivo: definir las capacidades mínimas que SDD V2 necesita de una memoria persistente sin convertir a Engram, Markdown o SQLite en parte del modelo de dominio.

## 1. Principio

```text
SDD Model
   ↓
Memory Contract
   ↓
Adapter
   ├── Engram
   ├── files (fallback futuro)
   └── otro backend
```

El contrato define **qué necesita SDD**, no cómo lo almacena un backend.

Reglas:

- Engram no define entidades, relaciones ni lifecycle de SDD.
- El contrato no replica toda la API de Engram.
- El contrato no obliga a persistir razonamiento transitorio ni el HOW local del executor.
- La recuperación debe ser selectiva: no cargar todo el proyecto para ejecutar un WorkUnit.
- Exportar Markdown es una proyección fuera del hot path de ejecución.

## 2. Qué merece persistirse

Persistir cuando reduce alguno de estos costos:

- pérdida de intención o scope;
- repetición de una decisión material;
- pérdida de continuidad entre sesiones/agentes;
- repetición de un error o restricción reusable;
- pérdida de evidencia necesaria para cerrar un change;
- pérdida de la historia relevante de evolución.

No persistir por defecto:

- narración previa de lo que el agente va a hacer;
- plan detallado del HOW local;
- comandos rutinarios exitosos;
- errores triviales resueltos sin aprendizaje reusable;
- WorkUnits futuros especulativos;
- output completo de terminal;
- razonamiento interno del modelo.

## 3. Records lógicos iniciales

El Memory Contract no requiere una tabla distinta por tipo. `kind` identifica el significado lógico.

### `change`

Snapshot canónico mutable del Change actual.

Incluye solo información vigente del Change Model: intención, lifecycle, scope/acceptance cuando aplique, riesgos materiales, preguntas abiertas y relaciones de change necesarias.

### `workunit`

Snapshot de un WorkUnit **materializado** y próximo a ejecución o necesario para continuidad.

No se persisten WorkUnits especulativos del futuro lejano.

### `decision`

Decisión material que debe sobrevivir al executor/sesión.

Una decisión sustituida no necesita ser reescrita silenciosamente; puede conservarse y relacionarse con la nueva mediante `supersedes` a nivel SDD.

### `knowledge`

Conocimiento reusable del proyecto promovido desde una incidencia o descubrimiento.

Ejemplo:

> Los scripts POSIX del proyecto deben ejecutarse con WSL/Git Bash, no PowerShell directo.

### `evidence`

Evidencia relevante para demostrar que un slice/change cumple lo esperado.

No equivale al log completo del comando.

### `event`

Historia mínima append-only para hechos que explican la evolución.

Ejemplos:

- change creado/cerrado/dividido;
- route escalated;
- WorkUnit replanteado por un descubrimiento material;
- scope relevante modificado.

No registrar cada edición ni cada tool call.

### `session_summary`

Continuidad compacta cuando una sesión termina con trabajo abierto.

Debe favorecer reanudación, no funcionar como transcript.

## 4. Envelope lógico

Forma conceptual, no formato de almacenamiento obligatorio:

```yaml
record:
  id: stable-record-id
  kind: change | workunit | decision | knowledge | evidence | event | session_summary
  project: project-id
  key: optional-stable-logical-key
  subject: optional-parent-or-related-id
  payload: typed-data
  created_at: timestamp
  updated_at: timestamp
```

Notas:

- `id` identifica el record físico/lógico.
- `key` existe solo cuando queremos una entrada canónica actualizable.
- `subject` permite consultar records asociados a un Change/WorkUnit sin obligar a un graph nativo del backend.
- `payload` pertenece al modelo SDD y puede serializarse distinto según adapter.
- relaciones complejas pueden vivir dentro del payload o como records propios si la implementación lo necesita; v0 no obliga a una tabla/primitive especial.

## 5. Primitivas mínimas

V0 evita una API de decenas de métodos.

### `put(record)`

Crear o actualizar un record canónico.

Uso típico:

- Change actual;
- WorkUnit activo;
- knowledge canónico.

Requisito: cuando existe `key`, actualizar debe preservar identidad lógica según las reglas del adapter.

### `append(record)`

Crear un record histórico nuevo sin reemplazar otro.

Uso típico:

- events;
- evidence;
- session summaries;
- decisiones que deben conservar historia.

### `get(ref)`

Recuperar un record completo por identificador o key estable.

### `query(selector)`

Recuperación estructural y paginada.

Selectors mínimos candidatos:

```text
project
kind
subject
key
created/updated range
```

Debe permitir listar, por ejemplo:

- Changes abiertos;
- WorkUnits materializados de un Change;
- evidence de un WorkUnit;
- events de un Change ordenados cronológicamente;
- knowledge del proyecto.

### `search(text, filters)`

Búsqueda semántica/textual aproximada para contexto que no conocemos por ID/key.

No reemplaza `query`: el estado del workflow no debe depender exclusivamente de una búsqueda fuzzy.

## 6. Lo que NO es primitive del store

Mantener estas operaciones en la capa SDD evita inflar el backend contract:

```text
getProjectContext()
getChangeContext()
getExecutionFrontier()
getRoadmap()
getTimeline()
promoteKnowledge()
relateChanges()
allocateChangeId()
exportMarkdown()
```

Son servicios/queries derivados sobre las cinco primitivas anteriores.

Ejemplo:

```text
getRoadmap()
  = query(changes)
  + interpretar relaciones SDD
  + ordenar/proyectar estado actual
```

No necesitamos que Engram tenga un endpoint `roadmap`.

## 7. Mutabilidad e historia

V0 usa una regla simple:

```text
estado actual        → put
hecho histórico útil → append
```

No se introduce un event-sourcing completo.

### Mutable por defecto

- Change snapshot;
- WorkUnit snapshot mientras está materializado;
- knowledge canónico que evoluciona.

### Histórico cuando aporta

- decisiones materiales;
- evidence relevante;
- eventos de evolución;
- session summaries.

No todo record histórico es estrictamente inmutable a nivel storage. La garantía importante es semántica: no destruir historia que necesitamos para comprender por qué cambió el sistema.

## 8. Recuperación por capas

Objetivo: minimizar contexto cargado.

### Nivel 1 — bootstrap

Recuperar solo:

- contexto estable mínimo del proyecto;
- Changes abiertos relevantes;
- knowledge aplicable de alta señal.

### Nivel 2 — Change

Cuando se trabaja sobre un Change:

- snapshot del Change;
- WorkUnits materializados/ready relevantes;
- decisiones referenciadas;
- blockers/open questions;
- knowledge aplicable.

### Nivel 3 — deep lookup

Solo si hace falta:

- search de decisiones/discoveries antiguos;
- timeline/event history;
- evidence completa;
- sesiones previas.

Regla:

> búsqueda amplia primero debe devolver referencias/resúmenes; contenido completo se carga bajo demanda.

## 9. Continuidad y Execution Frontier

El Memory Store no materializa el plan completo.

```text
Change
  ↓
SDD calcula frontier actual
  ↓
materializa solo WorkUnits próximos/ejecutables
  ↓
execute + verify
  ↓
actualiza snapshots/eventos necesarios
  ↓
recalcula frontier
```

La memoria persiste continuidad, no fuerza planificación anticipada.

## 10. Relaciones

Las relaciones del Change Model son semántica SDD:

```text
spawned_from
split_from
depends_on
blocks
related_to
supersedes
```

V0 no exige soporte relacional nativo del backend.

Podemos representarlas dentro del `change.payload` y resolver el graph en SDD.

Motivo: un backend puede ofrecer relaciones con otra semántica o no ofrecerlas en absoluto.

## 11. Fit con Engram actual

Engram es un candidato fuerte para el adapter default, pero no modifica el contrato.

### Mapeos naturales

| Necesidad SDD | Engram actual |
|---|---|
| `put` canónico | observation con `topic_key` / update |
| `append` | observation sin `topic_key` |
| `get` | `mem_get_observation` / observation GET |
| `query` simple | filtros por project/type/scope/recent + export para bulk |
| `search` | `mem_search` / FTS5 |
| continuidad de sesión | session APIs / `mem_session_summary` |
| export bulk | JSON export |

### Caveat 1 — `topic_key` reemplaza contenido

Engram usa `project + scope + topic_key` como upsert y aumenta `revision_count`, pero mantiene una única observación actualizada.

Consecuencia:

- útil para snapshots canónicos (`change`, `knowledge`);
- no usarlo como sustituto de historia completa cuando necesitamos conservar versiones previas;
- decisiones/events que deban sobrevivir como historia se guardan como append.

### Caveat 2 — relaciones nativas no son nuestro Change graph

Las relaciones actuales de Engram están orientadas a conflict/similarity judgments como:

```text
related
compatible
scoped
conflicts_with
supersedes
```

No representan directamente `depends_on`, `spawned_from` o `split_from`.

Consecuencia:

> el Change graph se serializa como semántica SDD; no depende de `memory_relations`.

### Caveat 3 — `mem_timeline` no es SDD Timeline

El timeline de Engram entrega contexto cronológico alrededor de una observación/sesión.

El timeline SDD debe reconstruirse desde nuestros `event` + timestamps cuando necesitemos historia de Change/Project.

### Caveat 4 — runtime no debe requerir HTTP server

Engram MCP puede operar por stdio y es suficiente para el hot path del agente.

El exporter custom puede usar un mecanismo bulk (por ejemplo export JSON) fuera del hot path. La V2 no debería exigir `engram serve` solo para ejecutar Changes.

## 12. Export

Export no forma parte del Memory Store core.

```text
Memory Store
   ↓ query/export adapter
Normalized SDD records
   ↓
Projectors
   ├── Markdown
   ├── JSON
   ├── Roadmap
   └── Timeline
```

### Markdown default

El projector Markdown puede generar estructura rica —riesgos, mitigaciones, edge cases, decisions, evidence— a partir del modelo lógico vigente.

No obliga al executor a haber escrito esos documentos durante implementación.

### Obsidian

Puede existir luego como variante de Markdown con frontmatter/wikilinks, pero no condiciona el modelo ni el exporter base.

## 13. Failure behavior

Memory failure no debe producir éxito silencioso cuando la persistencia es necesaria para continuidad.

Regla candidata:

- `direct` y trabajo efímero que puede concluir en la sesión: degradación controlada puede continuar si no se pierde una decisión requerida;
- Change/WorkUnit que debe sobrevivir a sesión/agente: fallo de persistencia debe reportarse y bloquear el cierre del slice hasta preservar el contexto mínimo;
- nunca afirmar que un record fue guardado si el adapter no devuelve confirmación.

## 14. Backend capabilities

Cada adapter debería declarar capacidades, no fingir paridad:

```yaml
capabilities:
  put: true
  append: true
  get: true
  query: partial
  search: true
  bulk_export: true
```

El core decide cómo degradar una operación derivada según esas capacidades.

No se inventan emulaciones costosas solo para cumplir una interfaz demasiado rica.

## 15. Contrato runtime esperado

El executor no necesita leer este documento completo.

Runtime reducido aproximado:

```text
MEMORY RULES
- Persist only state/history that prevents context loss or repeated mistakes.
- Current canonical state uses put; useful history uses append.
- Never pre-materialize speculative WorkUnits.
- Retrieve by ID/key first; search only when context is unknown.
- Load summaries/references before full content.
- Promote reusable discoveries; keep routine failures local.
- Memory backend never defines SDD semantics.
```

## 16. Decisiones v0.1

Aceptadas provisionalmente:

1. Memory Contract backend-agnostic.
2. Cinco primitives: `put`, `append`, `get`, `query`, `search`.
3. Roadmap/timeline/context/frontier son servicios derivados, no primitives del store.
4. Change graph pertenece a SDD.
5. Estado actual y hechos históricos se separan sin adoptar event sourcing completo.
6. Engram `topic_key` se usa solo donde upsert es semánticamente correcto.
7. Export Markdown queda fuera del hot path.
8. Runtime normal no debe depender de `engram serve`.

## 17. Preguntas experimentales

No cerrar antes de implementar/probar:

- ¿qué records necesita realmente un Change `direct`, `compact` y `full`?
- ¿WorkUnit completado se conserva como snapshot o basta evidence/event?
- ¿cuánto `knowledge` cargar automáticamente sin recrear context inflation?
- ¿conviene serializar payload SDD dentro de Engram como Markdown estructurado, JSON o formato híbrido?
- ¿qué subset de `query` puede satisfacer MCP sin recurrir a export bulk?
- ¿cuándo el fallo de memoria permite continuar en modo degradado?
- ¿necesitamos algún backend file-based real o basta un adapter in-memory para tests al inicio?
