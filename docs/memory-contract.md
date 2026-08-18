# SDD V2 — Memory Contract

## 1. Status y propósito

**Estado:** contrato de arquitectura para la reconstrucción de SDD V2.

Este documento reemplaza la frontera de memoria introducida por `0.2.0-alpha.1`, donde `.sdd/state.json` pasó a poseer parte del lifecycle/identity del Change mientras Engram conservaba contexto durable relacionado.

La arquitectura aprobada en `rebaseline-architecture.md` elimina esa doble autoridad:

```text
SDD logical model
      |
      v
Memory Contract
      |
      v
Backend Adapter
      |
      +--> Engram
      +--> otro backend
```

El Memory Contract es la **única frontera de persistencia durable de records SDD**. No es el modelo de Change, no es una API de Engram y no es un file store.

Esta frontier define:

- qué garantías mínimas necesita SDD de cualquier backend canónico;
- qué operaciones son obligatorias y cuáles opcionales;
- cómo se preserva identidad lógica;
- cómo se evita lost update y colisión entre actores;
- cómo se recupera estado conocido sin fuzzy search;
- cómo falla el sistema cuando la persistencia no puede garantizarse;
- qué debe demostrar un adapter antes de ser aceptado.

No define todavía el payload final de `Change`; eso se cierra en la siguiente frontier (`docs/change-model.md`).

---

## 2. Objetivo del contrato

SDD necesita persistencia durable para mantener intención, continuidad y evidencia entre sesiones/agentes sin convertir el backend en parte del dominio.

El contrato debe permitir que la capa SDD diga:

```text
crear este record canónico
obtener este record exacto
actualizar esta revisión sin pisar cambios ajenos
anexar este hecho durable una sola vez
listar records estructuralmente
buscar contexto desconocido cuando realmente haga falta
```

sin que el executor tenga que decidir:

- cómo serializarlo para Engram;
- qué `topic_key` usar;
- qué texto insertar para poder encontrarlo luego;
- cómo interpretar output del backend;
- cómo detectar conflictos concurrentes;
- cómo resolver retries;
- qué API física del backend corresponde a cada operación.

La semántica pertenece a SDD. La traducción física pertenece al adapter.

---

## 3. Principios no negociables

### M1 — Una sola autoridad durable

Un record SDD durable tiene una única representación canónica lógica detrás del Memory Contract.

No existe:

```text
local state canonical
      +
Engram record canonical
```

Puede existir cache, índice o projection técnica, pero debe ser:

- no autoritativa;
- completamente reconstruible;
- descartable sin pérdida semántica;
- invisible para el modelo SDD.

### M2 — Exact before approximate

Cuando existe `id` o `key` conocida, la recuperación debe ser exacta.

```text
known identity -> get/query exact
unknown context -> search
```

`search()` nunca es requisito para resolver el lifecycle/frontier de un Change conocido.

### M3 — La concurrencia forma parte de correctness

Un backend canónico debe impedir que dos actores crean que actualizaron correctamente el mismo estado cuando uno pisó al otro.

Por lo tanto, los writes canónicos requieren precondiciones observables: creación solo-si-ausente y actualización contra una versión conocida.

### M4 — Persisted significa confirmado

Una operación no se considera durable hasta que el adapter devuelve confirmación positiva.

Timeout, error ambiguo o conexión caída no equivalen a éxito.

### M5 — El backend no define el dominio

Engram, SQLite, una API remota u otro store pueden tener concepts propios. Ninguno de ellos redefine:

- Change;
- Decision;
- Evidence;
- Knowledge;
- lifecycle;
- relaciones SDD;
- criterios de closure.

### M6 — El contrato no es middleware del trabajo normal

El Memory Contract se usa para estado durable SDD. No envuelve cada lectura de archivo, tool call, shell command o edición del repo.

### M7 — No false parity

Un adapter no puede declarar soporte porque puede aproximar una operación mediante fuzzy search o parsing frágil de output humano.

Una emulación es válida únicamente si preserva la semántica observable del contrato y pasa sus pruebas de conformidad.

---

## 4. Qué merece persistirse

Persistir cuando evita al menos uno de estos costos:

- pérdida de intención o scope material;
- pérdida de continuidad entre sesiones/agentes;
- repetición de una decisión material;
- pérdida de evidencia relevante para closure;
- repetición de conocimiento reusable;
- imposibilidad de reconstruir la próxima execution frontier.

No persistir por defecto:

- razonamiento interno;
- narración del HOW;
- planes locales desechables;
- comandos rutinarios exitosos;
- logs completos;
- errores triviales resueltos;
- WorkUnits especulativos;
- summaries de sesión solo por ceremonia;
- cada tool call o edición.

El Memory Contract no decide por sí mismo **cuándo** un trabajo es `ephemeral`, `receipt` o `continuity`; esa policy pertenece a SDD. Sí debe poder persistir correctamente aquello que SDD determine como durable.

---

## 5. Records lógicos soportados

El contrato es genérico respecto del payload, pero SDD necesita inicialmente estos kinds.

### Core

#### `change`

Record canónico mutable que representa el estado durable vigente de un Change.

Su payload final se define en `change-model.md`.

#### `decision`

Record durable para una decisión material cuando necesita identidad/historia propia.

No toda decisión local produce un record.

#### `evidence`

Evidencia durable con identidad propia cuando debe ser referenciada, auditada o preservada independientemente del snapshot del Change.

Un Change puede conservar un resumen de evidence y referencias sin copiar logs completos.

#### `knowledge`

Conocimiento reusable del proyecto que merece sobrevivir al Change que lo originó.

### Experimental

#### `workunit`

Permitido por el contrato solo si una WorkUnit fue realmente materializada por SDD. No se exige para la primera implementación del núcleo.

### Fuera del core actual

`event` y `session_summary` **no son kinds obligatorios** en esta reconstrucción.

Pueden reintroducirse después si evidencia real demuestra una necesidad que `change + decision + evidence + knowledge` no cubre bien.

En particular, `session_summary` no sustituye continuidad canónica del Change.

---

## 6. Envelope lógico normalizado

El backend puede almacenar otra forma física. El adapter debe exponer a SDD una forma normalizada equivalente a:

```yaml
record:
  schema_version: 1
  id: stable-sdd-record-id
  project_id: stable-project-id
  kind: change | decision | evidence | knowledge | workunit
  key: optional-stable-canonical-key
  subject: optional-parent-record-id-or-key
  payload: typed-sdd-data
  version: opaque-concurrency-token
  created_at: timestamp
  updated_at: timestamp
```

### `id`

Identidad estable asignada por SDD para ese record lógico.

No debe depender de un identificador físico del backend.

### `key`

Identidad lógica exacta para records canónicos actualizables.

Ejemplos conceptuales:

```text
change/CHG-20260818-01
knowledge/windows-posix-shell
```

El formato concreto se define en la capa de dominio/adaptador; el executor no lo inventa ad hoc.

Dentro de un proyecto y kind, una key canónica es única.

### `subject`

Permite asociar un record a otro record SDD sin exigir relaciones nativas del backend.

Ejemplo: Evidence cuyo subject es un Change.

### `version`

Token opaco devuelto por el store para optimistic concurrency.

SDD no asume que sea un entero. Puede mapearse a revision, ETag, version id u otro mecanismo equivalente.

### `payload`

Datos tipados pertenecientes al modelo SDD.

El Memory Contract no define aquí todos sus campos. El adapter no puede reinterpretar su significado.

---

## 7. Identidad y namespaces

Todo acceso durable está partitionado por `project_id`.

Dos proyectos pueden tener la misma key sin colisionar.

Para un project:

```text
(project_id, kind, key) -> como máximo un record canónico vigente
(project_id, id)        -> un único record lógico
```

Una implementación que no pueda garantizar esta unicidad no puede ser backend canónico de SDD.

### Consecuencia para Change IDs

La generación de `CHG-YYYYMMDD-NN` no es una primitive del Memory Store.

La capa SDD puede calcular un candidato, pero la unicidad final se garantiza con **create-if-absent atómico**.

Ejemplo conceptual:

```text
actor A -> intenta crear CHG-...-05 -> success
actor B -> intenta crear CHG-...-05 -> conflict
actor B -> recalcula/reintenta      -> CHG-...-06
```

Así, la identidad no depende de un allocator file-based ni de que un único proceso posea el workspace.

---

## 8. Primitivas del contrato

El contrato conserva una superficie pequeña: cinco primitivas.

La diferencia respecto de versiones anteriores es que ahora sus **semánticas de identidad, concurrencia e idempotencia son obligatorias**.

### 8.1 `put(record, precondition)`

Crea o reemplaza el estado canónico de un record.

`put` debe soportar dos precondiciones para records canónicos:

#### `absent`

Crear solo si no existe la misma identidad canónica.

Resultado:

```text
created | conflict
```

La comprobación y el write deben ser atómicos desde la perspectiva observable del contrato.

Uso:

- crear Change;
- crear knowledge canónico nuevo;
- reservar una identidad sin lock local.

#### `version = <token>`

Actualizar solo si la versión actual coincide con la versión leída por el caller.

Resultado:

```text
updated(new_version) | conflict
```

Uso:

- actualizar frontier;
- cambiar lifecycle;
- modificar scope/acceptance;
- cerrar Change.

#### Blind overwrite

Un write canónico sin precondición **no está permitido en el hot path SDD**.

Esto evita last-write-wins silencioso.

### 8.2 `append(record)`

Crea un record histórico/no-canónico sin reemplazar otro.

El `record.id` se genera antes del write y debe hacer el retry idempotente:

```text
append(id=X)
network ambiguity
append(id=X) again
```

no puede crear dos records lógicos distintos.

Si `id=X` ya existe con contenido incompatible, el adapter devuelve `conflict`.

Uso típico:

- Decision con historia propia;
- Evidence independiente;
- otros hechos durables que más adelante demuestren valor.

### 8.3 `get(ref)`

Recupera un record exacto por:

```text
id
```

o por identidad canónica:

```text
(project_id, kind, key)
```

Resultado:

```text
record | not_found
```

No puede resolverse mediante ranking semántico.

Cuando SDD conoce `CHG-...`, este es el camino normal de recuperación.

### 8.4 `query(selector, page)`

Recuperación estructural y paginada.

Selectors mínimos obligatorios:

```text
project_id        required
kind              optional exact
subject           optional exact
id                optional exact
key               optional exact
created range     optional
updated range     optional
```

El adapter puede internamente escanear/filtrar si el backend no ofrece todos esos índices, siempre que el resultado sea:

- determinista;
- completo para el selector declarado;
- paginado/bounded;
- no basado en ranking fuzzy.

SDD puede aplicar filtros de dominio sobre `payload` después de recuperar records estructuralmente. Por ejemplo, `listOpenChanges()` puede consultar `kind=change` y filtrar lifecycle según el Change Model.

Si este costo resulta inaceptable en un backend real, se resuelve en el adapter/capabilities o se descarta ese backend; no se deforma el modelo SDD para acomodarlo.

### 8.5 `search(text, filters)`

Búsqueda textual/semántica aproximada para contexto cuyo identificador se desconoce.

Es **capacidad opcional para correctness del core**.

Puede utilizarse para:

- descubrir Knowledge relevante;
- encontrar decisiones históricas sin referencia conocida;
- explorar contexto previo cuando no existe identidad suficiente.

No puede utilizarse como única implementación de `get()` o `query()`.

---

## 9. Operaciones que NO pertenecen al Memory Contract

Estas son operaciones de dominio/servicio SDD, no primitivas del store:

```text
openChange()
updateChange()
closeChange()
listOpenChanges()
allocateChangeId()
getExecutionFrontier()
relateChanges()
promoteKnowledge()
verifyAcceptance()
getProjectContext()
getRoadmap()
getTimeline()
exportMarkdown()
```

Ejemplo:

```text
closeChange()
  -> get(change)
  -> comprobar precondiciones SDD
  -> append evidence si necesita record independiente
  -> put(change closed, expected_version)
```

El backend no necesita saber qué significa `completed`.

---

## 10. Concurrencia y lost-update prevention

La robustez multi-agent/multi-worktree no se resuelve con un lock del workspace local.

El contrato exige optimistic concurrency en la autoridad durable.

### Caso: dos actores editan el mismo Change

```text
A get -> version V4
B get -> version V4

A put expected V4 -> success, V5
B put expected V4 -> conflict
```

B debe:

1. volver a leer;
2. reevaluar el cambio de estado;
3. reintentar solo si sigue siendo válido.

Nunca se permite:

```text
B pisa V5 con su copia de V4
```

### Caso: dos actores crean la misma identidad

`put(..., absent)` debe permitir un solo success.

Esta propiedad será obligatoria en el adapter con el que se vuelva a dogfood.

---

## 11. Consistencia mínima requerida

El contrato no exige distributed transactions ni linearizability global de todos los queries.

Sí exige las siguientes propiedades observables:

### Write acknowledgement

Cuando `put/append` retorna success, el record debe haber cruzado la frontera de durability que el backend declara.

### Exact read after acknowledged write

Después de un write confirmado, `get` por esa identidad debe retornar esa revisión o una posterior.

### No phantom success

Si el adapter no sabe si el write ocurrió, debe devolver un resultado ambiguo/error, nunca `success` inventado.

### Deterministic canonical lookup

`get` de una identidad conocida no puede depender del orden de resultados de search.

### Project isolation

Una consulta de un proyecto no puede devolver records de otro como si fueran propios.

---

## 12. Idempotencia y retries

Los adapters deben asumir que pueden existir retries por timeout, process restart o transporte.

### Canonical `put`

Un retry con la misma precondición después de success puede recibir conflict porque la versión cambió. La Semantic API debe resolverlo mediante `get` y comparación de resultado, no mediante overwrite ciego.

### `append`

Debe ser idempotente por `record.id`.

### Read operations

`get/query/search` no tienen side effects SDD.

El executor no necesita implementar esta política manualmente; pertenece a Semantic API + adapter.

---

## 13. Mutabilidad e historia

No se adopta event sourcing completo.

Regla base:

```text
estado vigente canónico -> put con version precondition
hecho durable independiente -> append
```

### Mutable/canónico

- Change;
- Knowledge canónico cuando evoluciona;
- WorkUnit materializado si finalmente se valida.

### Histórico/independiente

- Decision cuando necesita historia propia;
- Evidence cuando necesita identidad propia.

La capa de dominio decide cuándo embebir un resumen/reference dentro del Change y cuándo crear record separado.

---

## 14. Continuidad y recovery

El Memory Contract conserva continuidad; no reconstruye un plan completo.

### Known Change

```text
Change ID conocida
  -> get exact
  -> leer intent/frontier/constraints/evidence relevante
  -> inspección dirigida del repo
  -> ACT
```

No:

```text
search "SDD Change"
  -> ranking
  -> adivinar cuál era
  -> reconstruir conversación
```

### Change desconocido / “continuar lo pendiente”

```text
query(project, kind=change)
  -> SDD filtra Changes abiertos
  -> si queda uno relevante, get/context dirigido
  -> si hay varios, resolver por señales explícitas/repo/user
```

`search` puede enriquecer después, pero no sustituye el listado estructural.

### Stop retrieval

Cuando intención, restricciones y próxima frontier ya son suficientes para actuar de forma segura, SDD detiene recuperación adicional.

La existencia del backend no justifica cargar timeline, summaries o history “por si acaso”.

---

## 15. Evidence y cierre sin transacción multi-record obligatoria

El Memory Contract no exige una transacción distribuida entre Change y Evidence.

SDD puede preservar correctness mediante orden de writes.

Ejemplo cuando Evidence necesita record propio:

```text
1. append(evidence) -> confirmed ref/id
2. put(change closed + evidence ref, expected_version)
```

Si 1 falla:

- el Change no se cierra.

Si 1 funciona y 2 falla/conflicta:

- el Change permanece abierto;
- puede quedar Evidence no referenciada todavía;
- SDD re-lee y decide si reintenta.

Es preferible un Evidence huérfano recuperable a un Change marcado completed sin evidencia durable.

El nivel de evidencia requerido pertenece al Change/Verification contract, no al store.

---

## 16. Failure model normalizado

Los adapters deben traducir errores físicos a un conjunto pequeño de resultados semánticos.

```text
not_found
conflict
unavailable
unsupported
invalid
ambiguous_write
backend_error
```

### `not_found`

La identidad exacta no existe.

### `conflict`

Falló una precondición de unicidad/versionado.

Es un resultado esperado de concurrencia, no un crash.

### `unavailable`

El backend/transporte no está disponible.

### `unsupported`

El backend no puede implementar una capacidad solicitada con las garantías del contrato.

### `invalid`

Record/selector no cumple el contrato.

### `ambiguous_write`

El adapter perdió confirmación después de enviar un write y no puede determinar si se aplicó.

La Semantic API debe resolver mediante exact read/idempotency antes de reintentar destructivamente.

### `backend_error`

Fallo interno no clasificado.

---

## 17. Comportamiento ante fallo según durability

### Trabajo `ephemeral`

Si nunca requirió record SDD durable, una caída del backend no bloquea la edición/verify normal del repo.

No se crea artificialmente un Change para registrar el fallo de memoria.

### `receipt`

Si el trabajo requiere receipt durable, no se puede afirmar que el receipt existe hasta confirmar persistencia.

El código puede estar correctamente implementado, pero SDD debe distinguir:

```text
implementation completed
persistence/closure pending
```

si la memoria no está disponible.

### `continuity`

Antes de terminar/handoff, el contexto mínimo de continuidad debe estar confirmado durablemente.

Si no puede persistirse, SDD reporta el bloqueo. No finge que una próxima sesión podrá recuperarlo.

---

## 18. Capabilities de backend

Un adapter publica capabilities reales.

### Required para backend canónico

```yaml
canonical_put:
  create_if_absent: true
  compare_and_set: true
exact_get: true
structured_query: true
append_idempotent: true
durable_ack: true
```

Sin estas capacidades —nativas o emuladas con equivalencia demostrada— el backend **no puede ser autoridad canónica de SDD**.

### Optional

```yaml
search: true|false
bulk_export: true|false
native_relations: true|false
native_transactions: true|false
```

SDD core no depende de las opcionales para correctness.

### Emulación válida

Un adapter puede construir una capacidad requerida encima de primitivas más bajas del backend si:

- sigue habiendo una sola autoridad;
- no usa fuzzy search como sustituto de exact lookup;
- resiste process restart;
- mantiene unicidad/concurrency semantics;
- pasa el contract test suite.

Un índice técnico local puede existir solo si es cache reconstruible. No puede ser necesario para recuperar la verdad después de perderlo.

---

## 19. Engram: posición arquitectónica

Engram continúa como **primer backend candidato**, no como decisión incuestionable.

La evidencia histórica ya mostró que:

- persiste datos entre sesiones;
- funciona en Docker;
- puede ser consumido por agentes;
- permitió recovery cross-session.

Eso valida su utilidad como sistema de memoria, pero no demuestra todavía que pueda satisfacer este contrato como autoridad canónica.

En esta reconstrucción no se incorporan al Memory Contract conceptos específicos como:

```text
topic_key
observation type
mem_search
mem_timeline
session id
revision_count
```

El Engram Adapter puede utilizarlos internamente si sirven para implementar la semántica requerida.

### Regla de aceptación

Si Engram no puede implementar una primitive requerida de forma exacta y robusta, hay tres opciones, en este orden:

1. construir una traducción determinista dentro del adapter;
2. reducir/corregir el contrato **solo si la necesidad SDD estaba sobrediseñada**;
3. usar otro backend canónico.

No se vuelve a introducir un file store autoritativo para compensar silenciosamente una carencia de Engram.

---

## 20. Search y memoria semántica adicional

Es posible que un backend como Engram siga siendo muy útil para memoria semántica incluso si no termina siendo el store canónico.

La arquitectura permite separar:

```text
canonical SDD records -> backend que cumple contrato
semantic/context search -> provider opcional
```

Pero no se agregará esa doble infraestructura preventivamente.

Primero se probará si un mismo Engram Adapter puede cumplir ambos roles sin degradar correctness.

---

## 21. Export y proyecciones

Export no pertenece al core del Memory Contract.

```text
query/get normalized records
          |
          v
      projector
      /   |    \
 Markdown JSON Roadmap/Timeline
```

Markdown nunca vuelve a ser source of truth por el hecho de poder exportarse.

Projectors se diseñan después, cuando exista necesidad concreta de audit/handoff/reporting.

---

## 22. Contract test suite obligatoria

Un adapter no se considera implementado porque compile o porque una demo guarde un record.

Debe ejecutar la misma suite de conformidad que un backend de referencia.

### C1 — create + exact get

Crear Change canónico con `absent` y recuperarlo exactamente por key.

### C2 — uniqueness

Crear dos veces la misma key con `absent`:

```text
1 success
1 conflict
```

Nunca dos successes lógicos.

### C3 — optimistic concurrency

Dos readers obtienen la misma version. Solo una actualización contra esa version puede ganar.

### C4 — no lost update

El segundo actor no puede sobrescribir silenciosamente el cambio del primero.

### C5 — append idempotency

Reintentar `append` con el mismo `record.id` no duplica el record.

### C6 — exact query

`query(project, kind)` devuelve el conjunto correcto sin depender de FTS/ranking.

### C7 — project isolation

Records de proyecto A no aparecen como pertenecientes a B.

### C8 — restart durability

Tras reiniciar proceso/backend, `get` recupera los writes confirmados.

### C9 — new process recovery

Una nueva sesión/proceso sin estado local accidental recupera el Change exacto desde la autoridad durable.

### C10 — missing local cache

Eliminar cualquier cache/index reconstruible no destruye la capacidad de recuperar la verdad canónica.

### C11 — ambiguous write recovery

Simular pérdida de respuesta después de un write y demostrar resolución segura mediante id/idempotency/exact read.

### C12 — backend unavailable

El adapter devuelve `unavailable`; no inventa success ni crea fallback autoritativo silencioso.

### C13 — optional search separation

Desactivar `search` no rompe create/get/update/query/closure persistence del core.

### C14 — reference backend parity

El mismo escenario de contrato pasa contra:

- un `InMemory`/reference store diseñado solo para tests;
- el adapter candidato real.

La suite compara semántica observable, no detalles internos.

---

## 23. Adapter spike — alcance exacto de la siguiente implementación

Después de aprobar `change-model.md`, el primer código nuevo de persistencia debe ser un **spike**, no una nueva Alpha.

Archivos tentativos del lote:

```text
lib/memory/contract.mjs
lib/memory/engram-adapter.mjs
tests/memory-contract.test.mjs
```

Los nombres pueden ajustarse cuando se vea el repo, pero el alcance conceptual no debe crecer.

Fuera de ese spike:

```text
cli/*
runtime/*
skills/*
lib/control-state.mjs
migration/update
OpenCode adapter
WorkUnit machinery
exporters
```

### El spike debe contestar

1. ¿Engram puede dar exact get por identidad SDD sin fuzzy search?
2. ¿puede garantizar create-if-absent?
3. ¿puede soportar compare-and-set/version precondition?
4. ¿puede hacer append idempotente?
5. ¿puede query estructurado de manera completa y bounded?
6. ¿sobrevive restart sin side state local autoritativo?
7. ¿qué emulación exige el adapter y cuánto cuesta?

Si alguna respuesta es “no”, se registra como resultado del spike antes de modificar arquitectura/runtime.

---

## 24. Decisiones cerradas en esta frontier

1. No existe `state.json` como autoridad de Change.
2. Todo record SDD durable atraviesa Memory Contract + adapter.
3. El agente no implementa manualmente la serialización/lookup de records canónicos.
4. `put`, `append`, `get`, `query`, `search` siguen siendo una superficie suficiente, pero `put` ahora exige precondiciones de concurrencia.
5. Canonical create usa `absent`; canonical update usa `version`.
6. Blind overwrite de estado canónico queda prohibido.
7. `append` debe ser idempotente por SDD record id.
8. Exact lookup/query son required; semantic search es optional para correctness.
9. Unicidad y lost-update prevention se resuelven en la autoridad durable, no con un lock/file allocator del workspace.
10. No se requiere transacción multi-record para closure si SDD ordena Evidence antes de cerrar Change.
11. `event` y `session_summary` salen del core actual.
12. Engram debe demostrar conformidad; no se deforma el modelo para declararlo compatible.
13. Ningún fallback file-based autoritativo se introduce durante esta reconstrucción.
14. El adapter real debe pasar una contract test suite común antes de entrar al runtime.

---

## 25. Preguntas deliberadamente diferidas

Estas preguntas no se resuelven en Memory Contract:

- payload exacto de Change;
- campos mínimos para receipt/continuity;
- closure lifecycle final;
- relaciones exactas entre Changes;
- identidad final de Decision/Evidence;
- si WorkUnit se estabiliza;
- forma de la Semantic API pública;
- CLI vs MCP vs library como surface;
- skill set definitivo;
- deployment global/project-local;
- migration desde Alpha.1.

Resolverlas aquí mezclaría storage semantics con domain/runtime design.

---

## 26. Gate para cerrar Frontier 2

Esta frontier se considera cerrada cuando podemos responder sin ambigüedad:

1. ¿Dónde vive la autoridad durable de un Change? — detrás del Memory Contract.
2. ¿Cómo se recupera un Change conocido? — `get` exacto.
3. ¿Cómo se listan records sin identidad conocida? — `query` estructurado.
4. ¿Para qué existe `search`? — descubrimiento aproximado, no control state.
5. ¿Cómo evitamos dos IDs iguales? — create-if-absent atómico + retry de dominio.
6. ¿Cómo evitamos lost updates? — version precondition/optimistic concurrency.
7. ¿Cómo se reintenta un append? — record id estable/idempotente.
8. ¿Qué ocurre si memory falla? — error explícito; no phantom persistence.
9. ¿Puede un adapter usar cache? — sí, solo derivable/no autoritativo.
10. ¿Engram ya está aprobado como canonical backend? — no; debe pasar el spike y contract suite.

### Siguiente frontier

**Único archivo activo:**

```text
docs/change-model.md
```

No modificar todavía:

```text
runtime/*
cli/*
lib/*
skills/*
adapters/*
tests/*
```

La siguiente pregunta es:

> ¿Cuál es el mínimo modelo de Change que necesita SDD para expresar intent, continuity y evidence correctamente sobre este Memory Contract, sin reintroducir V1 documental ni cargar campos por anticipado?
