# SDD V2 — Change Model

## 1. Status y propósito

**Estado:** contrato de dominio para la reconstrucción de SDD V2.

Este documento define qué significa un `Change` dentro de SDD y qué invariantes debe preservar la futura Semantic API.

Depende de dos fronteras ya fijadas:

```text
rebaseline-architecture.md
  -> una sola autoridad semántica durable
  -> SDD no replica capacidades del host
  -> Change representa intención durable, no una conversación

memory-contract.md
  -> records SDD persisten únicamente vía Memory Contract
  -> exact get antes que search
  -> create-if-absent para identidad
  -> optimistic concurrency para updates
  -> writes confirmados antes de considerarlos durable
```

Este documento **no** define:

- el formato físico de Engram;
- la implementación del adapter;
- el CLI;
- el runtime prompt;
- una skill;
- WorkUnits definitivos;
- routing `direct|compact|full`;
- una migration desde Alpha.1.

El objetivo es cerrar primero un modelo suficientemente preciso como para que el adapter spike y la Semantic API puedan ser falsados contra invariantes concretas.

---

## 2. Por qué existe Change

Un `Change` representa una **intención de modificación del proyecto que merece identidad y continuidad propias**.

No equivale a:

```text
Change != chat
Change != sesión
Change != branch
Change != commit
Change != documento
Change != lista completa de tareas
Change != WorkUnit
Change != ticket externo
```

Puede relacionarse con cualquiera de ellos, pero no obtiene su identidad de esas entidades.

SDD usa Change para conservar aquello que el repo por sí solo no siempre explica de forma suficiente:

- qué se intentaba lograr;
- qué límites importaban;
- qué condición define éxito;
- qué trabajo relevante queda pendiente;
- qué decisiones/restricciones deben sobrevivir;
- qué evidencia permite afirmar que el cambio está completado;
- cómo se relaciona con otros cambios materiales.

La intención es preservar esa semántica **sin reconstruir** `proposal/spec/design/tasks/state/verify` como artefactos obligatorios.

---

## 3. Cuándo existe un Change

No toda petición produce un Change durable.

SDD conserva tres comportamientos de persistencia:

### 3.1 Ephemeral

Trabajo que puede completarse dentro del contexto actual y cuya intención/resultado quedan suficientemente reconstruibles desde el repo y la conversación inmediata.

Ejemplos típicos:

- ajuste cosmético local;
- rename mecánico;
- corrección trivial sin decisión durable;
- edición pequeña que no deja trabajo pendiente.

Resultado SDD:

```text
no Change record requerido
```

No se crea un Change retrospectivo solo para demostrar que SDD participó.

### 3.2 Receipt

Trabajo material que terminó sin necesitar continuidad previa, pero cuyo resultado merece trazabilidad durable.

El Change puede crearse **al cierre**, no obligatoriamente antes de implementar.

Resultado conceptual:

```text
closed Change
  intent
  outcome
  contract/acceptance solo si aportó
  evidence suficiente
  decisiones/referencias solo si existieron
```

No se fabrican WorkUnits ni planning history retroactivos.

### 3.3 Continuity

Trabajo que debe sobrevivir al contexto actual:

- continuará en otra sesión;
- existe handoff/delegación;
- queda una frontier explícita;
- hay blocker o decisión pendiente;
- la intención/restricciones serían costosas o riesgosas de reconstruir;
- varios actores deben recuperar el mismo estado durable.

En ese caso el Change debe existir **antes de perder el contexto**.

Un Change abierto usado para continuity debe contener suficiente información para reconstruir la próxima acción segura sin recuperar la conversación completa.

### Regla

```text
sin necesidad durable       -> ephemeral
resultado material cerrado  -> receipt
trabajo durable pendiente   -> continuity
```

`receipt` y `continuity` describen **cuándo y cuánto persistir**, no son lifecycle states del Change.

---

## 4. Identidad

### 4.1 ID canónico

Formato actual:

```text
CHG-YYYYMMDD-NN
```

Ejemplo:

```text
CHG-20260818-03
```

Propiedades:

- estable durante toda la vida del Change;
- independiente del título;
- independiente de prioridad;
- independiente del roadmap;
- independiente del backend;
- independiente del host;
- no se reutiliza dentro del mismo proyecto.

La fecha representa fecha local de creación del Change lógico. `NN` representa secuencia de creación para esa fecha.

El formato es parte de SDD, no de Engram.

### 4.2 Título y slug

`title` es humano y puede evolucionar.

`slug` es opcional y sirve para vistas/export o ergonomía. No participa de la identidad.

Ejemplo:

```yaml
id: CHG-20260818-03
title: Cambiar estado del ticket desde el detalle
slug: ticket-status-toggle
```

Una modificación de `title` o `slug` no crea un Change nuevo.

### 4.3 Asignación concurrent-safe

La Semantic API puede proponer el siguiente ID observando Changes existentes, pero la unicidad real se garantiza en la autoridad durable:

```text
candidate = CHG-20260818-03

put(change, absent)
  -> created
  -> conflict
```

Ante `conflict`:

1. releer/listar identidad relevante;
2. calcular otro candidato;
3. reintentar.

No existe allocator canónico en un file local.

No se asume un único proceso, worktree o agente.

### 4.4 Key de persistencia

El Memory Contract puede usar una key exacta derivada, por ejemplo:

```text
change/CHG-20260818-03
```

La key es parte de la representación normalizada de SDD; el executor no inventa `topic_key` o strings de búsqueda ad hoc.

El `id` del Change sigue siendo `CHG-...`.

---

## 5. Lifecycle mínimo

El lifecycle canónico permanece deliberadamente pequeño:

```text
open
closed
```

No se agregan estados que describen fases de trabajo.

No son lifecycle states:

```text
planning
implementing
verifying
blocked
ready
review
archived
```

Esas condiciones, si alguna vez aportan valor, se representan como información derivada o contextual.

### 5.1 Open

Existe intención durable pendiente.

Un Change puede permanecer `open` mientras:

- se implementa;
- espera decisión;
- está bloqueado;
- tiene partes completadas y frontier pendiente;
- otro actor debe continuarlo.

### 5.2 Closed

Ya no existe trabajo pendiente bajo esa identidad.

`closed` requiere un `close.reason`.

Razones core:

```text
completed
cancelled
superseded
split
```

#### `completed`

La intención acordada se considera satisfecha y existe evidencia proporcional suficiente.

#### `cancelled`

La intención deja de perseguirse.

No requiere evidence de cumplimiento, pero puede conservar una razón breve cuando evita ambigüedad.

#### `superseded`

Otro Change reemplaza esta intención.

Debe existir una relación `supersedes` desde el Change reemplazante hacia este Change, o una referencia equivalente verificable por la Semantic API.

#### `split`

El Change original deja de ejecutarse como unidad porque su scope fue repartido deliberadamente entre nuevos Changes.

Los nuevos Changes deben declarar `split_from` hacia el original.

### Invariante

Cerrar un Change no borra su identidad ni su historia durable.

---

## 6. Forma lógica del Change

El `Change` vive como payload de un record `kind=change` del Memory Contract.

Forma conceptual:

```yaml
change:
  id: CHG-20260818-03
  title: Cambiar estado del ticket desde el detalle
  slug: ticket-status-toggle

  lifecycle: open

  intent: >
    Permitir cambiar un ticket entre open y closed desde su detalle.

  contract:
    scope:
      in:
        - actualizar estado desde detalle
      out:
        - agregar nuevos estados
    acceptance:
      - id: A1
        condition: solo se aceptan open y closed
      - id: A2
        condition: el estado persiste y vuelve a mostrarse correctamente

  continuity:
    completed:
      - PATCH de estado implementado
    next: agregar control en la vista de detalle
    constraints:
      - conservar etiquetas Abierto/Cerrado
    blockers: []

  relations:
    split_from: CHG-...
    spawned_from: CHG-...
    depends_on:
      - CHG-...

  close:
    reason: completed
    outcome: ...
    evidence:
      summary: ...
      refs:
        - EVD-...
```

Es una forma conceptual.

**No se guardan campos, bloques o arrays vacíos solo porque existan en este ejemplo.**

Los timestamps y el `version` de concurrencia pertenecen al envelope normalizado del Memory Contract y no necesitan duplicarse dentro del payload.

---

## 7. Campos core y adaptativos

### 7.1 Siempre en un Change durable

```text
id
intent
lifecycle
```

Además el envelope aporta:

```text
project_id
version
created_at
updated_at
```

`title` debe estar disponible para ergonomía salvo casos puramente programáticos; puede derivarse inicialmente del intent.

### 7.2 Cuando reduce ambigüedad

```text
contract.scope
contract.acceptance
constraints
```

### 7.3 Cuando existe riesgo material

```text
risks
mitigations
rollback
edge_cases
```

No forman parte del mínimo obligatorio del payload.

### 7.4 Cuando existe continuity

```text
continuity
```

### 7.5 Cuando existen relaciones materiales

```text
relations
```

### 7.6 Al cerrar

```text
close.reason
```

Y según la razón:

```text
completed -> outcome + evidence suficiente
cancelled -> optional rationale
superseded -> replacement relationship verificable
split -> child split relationships verificables
```

### Regla de densidad

> Un campo entra al Change cuando reduce riesgo, ambigüedad o costo de recuperación. No porque exista en el schema máximo.

---

## 8. Intent

`intent` expresa **qué cambio de comportamiento/resultado se persigue y por qué importa**, con suficiente precisión para distinguirlo de otro Change.

Debe evitar dos extremos:

Demasiado pobre:

```text
"tickets"
"arreglar estado"
```

Demasiado procedural:

```text
"editar TicketController, agregar route PATCH,
después abrir Blade, escribir select..."
```

Forma preferida:

```text
"Permitir cambiar un ticket entre open y closed desde su vista de detalle,
sin introducir estados adicionales."
```

El HOW local pertenece al executor/repo, salvo que una restricción de implementación sea material para el contrato.

Un Change con `intent` incapaz de distinguir éxito de trabajo accidental no está suficientemente definido para durability.

---

## 9. Contract boundary: scope y acceptance

El Change no necesita una spec completa por defecto.

Cuando la petición sea material o ambigua, puede persistir un `contract` pequeño:

```yaml
contract:
  scope:
    in: [...]
    out: [...]
  acceptance:
    - id: A1
      condition: ...
```

### 9.1 Scope

`scope.in` aclara trabajo incluido cuando el intent no basta.

`scope.out` se usa únicamente para no-objetivos que realmente evitan scope drift.

No se enumeran todos los archivos o detalles de implementación salvo que formen parte de una restricción material.

### 9.2 Acceptance

Acceptance expresa condiciones observables de éxito.

Cada criterio debe ser:

- suficientemente concreto para verificar;
- independiente del HOW cuando sea posible;
- útil para decidir closure;
- pequeño en cantidad.

No se crean criterios tautológicos como:

```text
"el código debe funcionar"
"implementar lo pedido"
```

### 9.3 IDs de acceptance

Cuando haya varios criterios y evidence deba mapearse individualmente, cada criterio usa un ID local estable:

```text
A1
A2
A3
```

Esos IDs son locales al Change.

Permiten que Evidence declare cobertura sin copiar el texto completo.

---

## 10. Continuity y Execution Frontier

`continuity` existe solo mientras el Change necesita recuperación entre contextos/actores.

Su objetivo no es persistir un plan completo.

Forma mínima:

```yaml
continuity:
  completed:
    - resumen factual de trabajo ya terminado
  next: próxima acción concreta y segura
  constraints:
    - información que debe respetarse al continuar
  blockers:
    - bloqueo real, si existe
```

### 10.1 `next` es la frontier

`next` debe ser suficientemente concreta para que un nuevo executor pueda:

```text
get(Change)
-> inspección dirigida del repo
-> ACT
```

sin reconstruir un roadmap ni releer toda la historia.

Mala frontier:

```text
"seguir"
"terminar UI"
"revisar lo pendiente"
```

Mejor frontier:

```text
"Agregar al detalle del ticket un selector open/closed que invoque
el PATCH ya implementado y conserve las etiquetas Abierto/Cerrado."
```

### 10.2 `completed`

Resume hechos útiles para no repetir trabajo.

No es changelog exhaustivo.

### 10.3 `constraints`

Solo restricciones que pueden alterar la siguiente ejecución.

Una decisión material con historia propia puede vivir como `Decision`; el Change debe conservar suficiente resumen/ref para que recovery no dependa de una búsqueda amplia.

### 10.4 `blockers`

`blocked` es una condición derivada:

```text
continuity.blockers no vacío
o dependencia necesaria no satisfecha
o decisión material pendiente
```

No modifica lifecycle.

### 10.5 Invariante de handoff

Un Change `open` que va a cruzar una frontera de sesión/agente **no está listo para handoff** si `continuity.next` no permite reconstruir la próxima acción segura.

---

## 11. Progress sin `Progress` record obligatorio

Esta reconstrucción elimina `Progress` como record core independiente.

La continuidad mínima vive dentro del Change porque:

- es parte del estado vigente;
- debe recuperarse con un `get` exacto;
- separar progress obligaría a una segunda lookup para reconstruir el estado básico;
- el dogfood ya mostró que Change + frontier suficiente puede sostener recovery.

Eso no impide records históricos futuros si evidencia demuestra que hacen falta.

Regla actual:

```text
estado vigente de ejecución -> Change.continuity
historia detallada          -> no persistir por defecto
```

---

## 12. Relaciones entre Changes

Solo se persisten relaciones que cambian interpretación, orden o scope.

Core inicial:

```text
split_from
spawned_from
depends_on
supersedes
```

No se incluye `blocks` como relación canónica independiente porque es el inverso derivable de `depends_on`.

No se incluye `related_to` en el core porque su semántica débil puede producir graph noise sin cambiar ejecución.

Puede reintroducirse si dogfood demuestra valor.

### 12.1 `split_from`

El nuevo Change pertenecía al scope del Change original, pero se convirtió deliberadamente en unidad independiente.

```text
child -> split_from -> parent
```

### 12.2 `spawned_from`

El nuevo Change fue descubierto durante otro, pero representa una intención nueva que no debe ampliar silenciosamente su scope.

```text
new -> spawned_from -> origin
```

### 12.3 `depends_on`

El Change no puede satisfacer parte relevante de su contrato sin el resultado de otro Change.

```text
dependent -> depends_on -> prerequisite
```

`blocks` se deriva invirtiendo esa relación en una projection.

### 12.4 `supersedes`

El nuevo Change reemplaza conceptualmente al anterior.

```text
new -> supersedes -> old
```

El Change viejo se cierra con reason `superseded`.

### 12.5 No bidirectional duplication

No se escriben dos edges canónicos para representar la misma relación:

```text
A depends_on B
B blocks A
```

Solo `A depends_on B` es autoridad.

La vista `B blocks A` es derivada.

---

## 13. Scope drift

La conversación no modifica silenciosamente la intención durable.

Durante ejecución:

```text
descubrimiento sigue dentro del intent/contract
  -> continuar

scope original resulta demasiado grande
  -> crear Change hijo con split_from
  -> ajustar/cerrar parent según corresponda

aparece necesidad nueva independiente
  -> crear Change con spawned_from
  -> no expandir silenciosamente el Change actual

cambia materialmente la intención acordada
  -> actualizar contract solo si sigue siendo el mismo Change
  -> si cambia la identidad conceptual, crear/superseder Change
```

### Misma identidad vs Change nuevo

Actualizar el mismo Change es razonable cuando:

- se aclara wording;
- se restringe scope sin cambiar el objetivo;
- acceptance se hace más precisa;
- se incorpora un edge case coherente con la intención.

Un nuevo Change es preferible cuando:

- aparece una capability independiente;
- el objetivo cambia sustancialmente;
- el trabajo puede completarse/posponerse por separado;
- mezclarlo haría ambiguo qué significa `completed`.

---

## 14. Decisions

No toda elección del executor merece un record `decision`.

Una `Decision` durable separada se justifica cuando:

- afecta arquitectura, contrato público, seguridad o comportamiento material;
- existen trade-offs relevantes;
- sería costoso o riesgoso redescubrirla;
- otro actor necesita conocerla;
- puede ser supersedida y su historia importa.

Decisiones locales rutinarias permanecen en el código o contexto de ejecución.

### Relación con Change

El Change puede conservar:

```text
constraint/resumen mínimo necesario para continuity
+
reference a Decision cuando necesita historia propia
```

Recovery de una frontier conocida no debería necesitar buscar todas las Decisions del proyecto.

---

## 15. Knowledge

`Knowledge` es reusable fuera del Change que lo originó.

Ejemplo:

```text
"En este repo los tests de Tailwind fallan dentro del sandbox por spawn EPERM;
ejecutarlos fuera del sandbox cuando se necesite validar build."
```

No promover automáticamente:

- un error único;
- output de terminal;
- workaround descartado;
- decisión específica del Change sin valor general.

El Change puede referenciar Knowledge aplicable, pero el repo sigue siendo autoridad de su realidad técnica actual.

---

## 16. Evidence

Evidence es información observable que soporta una afirmación de cumplimiento.

Puede existir de dos formas:

### 16.1 Evidence embebida/resumida

Para Changes pequeños:

```yaml
close:
  reason: completed
  outcome: selector de estado agregado y persistencia validada
  evidence:
    summary: >
      TicketTest: 6 tests / 63 assertions; pending rechazado;
      route PATCH registrada; git diff --check pasó.
```

### 16.2 Evidence con record propio

Se usa cuando:

- tiene identidad/auditoría propia;
- varios criterios dependen de ella;
- debe conservar metadata estructurada;
- puede reutilizarse/referenciarse;
- el resumen dentro del Change sería insuficiente.

Ejemplo conceptual:

```yaml
evidence:
  id: EVD-...
  subject: CHG-...
  payload:
    kind: test
    observation: ...
    result: pass
    covers: [A1, A2]
```

El Change cerrado conserva refs y/o resumen necesario.

### 16.3 Evidence no es un string ceremonial

Para `completed`, la Semantic API debe poder distinguir al menos:

```text
qué se observó
qué resultado produjo
qué parte del contrato soporta
```

No alcanza con validar:

```text
evidence != ""
```

La intensidad de evidence es proporcional al riesgo y al acceptance definido.

### 16.4 Evidence no es log completo

Guardar:

```text
comando relevante
resultado
resumen/medida
referencia externa si aplica
```

No copiar megabytes de stdout salvo necesidad de auditoría externa.

---

## 17. Closure semantics

### 17.1 `completed`

Antes de persistir `closed/completed`, la Semantic API debe validar:

1. no queda frontier necesaria bajo este Change;
2. el outcome responde al intent;
3. acceptance existente tiene evidence suficiente;
4. no existe blocker conocido que contradiga completion;
5. evidence durable necesaria fue confirmada;
6. el update del Change se escribe con optimistic concurrency.

Conceptualmente:

```text
get Change @ V7
verify closure
append Evidence si corresponde
put closed Change expected V7
  -> updated V8
  -> conflict
```

Si hay `conflict`, se relee y se vuelve a evaluar. No se fuerza cierre con overwrite.

### 17.2 `cancelled`

No exige evidence de cumplimiento.

Debe eliminar la expectativa de frontier futura bajo esa identidad.

### 17.3 `superseded`

Requiere replacement identificable.

No se pierde la historia del Change anterior.

### 17.4 `split`

Se usa solo cuando el parent deja de ser unidad de ejecución.

Si el parent conserva trabajo propio además de hijos separados, puede permanecer abierto; no debe cerrarse `split` solo porque haya creado un hijo.

---

## 18. Receipt semantics

Receipt no es otro kind de record.

Es un `Change` cerrado mínimo cuya creación durable ocurre al final del trabajo.

Ejemplo:

```yaml
id: CHG-20260818-05
lifecycle: closed
intent: Agregar PATCH para cambiar estado open/closed desde ticket detail.
close:
  reason: completed
  outcome: ...
  evidence:
    summary: ...
```

Puede incluir contract/Decision/Evidence refs si el trabajo los necesitó.

No requiere:

```text
continuity
WorkUnits
session summary
planning history
timeline
```

### Materialidad candidata

Como mínimo, tienden a merecer receipt:

- nueva capability de dominio;
- schema persistente;
- contrato/API pública;
- cambio de seguridad/policy;
- dependencia/tooling material;
- cambio arquitectónico relevante.

Esta lista es policy y podrá refinarse con dogfood; no debe convertirse en una checklist burocrática.

---

## 19. Continuity semantics

Un Change usado para continuity debe ser durable y recuperable por exact identity.

Antes de handoff/session end debe confirmarse:

```text
intent vigente
contract relevante
completed relevante
next frontier
constraints/decisions indispensables
blockers/dependencies
evidence previa que afecte el siguiente paso
```

No todo eso requiere un campo separado si no existe.

### Recovery normal

```text
known CHG id
  -> get exact
  -> leer intent + continuity + contract necesario
  -> inspección dirigida del repo
  -> ACT
```

### “Continuar lo pendiente” sin ID

```text
query kind=change
  -> filtrar lifecycle=open
  -> resolver Change relevante
  -> exact get
  -> ACT
```

`search` no es parte necesaria de ese camino.

---

## 20. Concurrencia sobre Change

Todos los updates canónicos usan el `version` del Memory Contract.

### Caso: dos actores actualizan continuity

```text
A get -> V4
B get -> V4

A put expected V4 -> V5
B put expected V4 -> conflict
```

B:

1. obtiene V5;
2. compara su intención con estado nuevo;
3. decide si todavía aplica;
4. construye update desde V5;
5. reintenta.

No existe merge automático genérico de payloads.

### Por qué no merge automático

Campos como:

```text
intent
acceptance
frontier
close
relations
```

tienen semántica, no son bags de JSON.

Un merge sintáctico puede producir un Change válido como JSON pero falso como estado de dominio.

La Semantic API puede introducir merges específicos en el futuro solo si demuestra sus invariantes.

---

## 21. Change y WorkUnit

WorkUnit permanece **experimental**.

El Change Model solo fija la frontera:

```text
Change
  = intención durable / contract / continuity / closure

WorkUnit
  = posible unidad temporal de ejecución
```

No se exige WorkUnit para:

- receipt;
- continuity simple;
- cambio de una sola frontier;
- trabajo delegado que el host ya puede coordinar sin estado SDD adicional.

No se incluyen `tasks`, `execution_notes`, `conflicts_with` ni DAG dentro del Change.

Si WorkUnit se valida después, deberá referenciar `change_id` y no duplicar el intent/contract salvo la porción necesaria para ejecutar.

---

## 22. Roadmap y timeline

No son estado canónico propio del Change.

### Roadmap

Se proyecta desde:

```text
Changes
+ lifecycle
+ relations
+ metadata de orden/prioridad si alguna policy la introduce
```

La prioridad no forma parte del ID.

### Timeline

Se reconstruye desde timestamps de records y, si en el futuro se justifican eventos históricos, desde esos records.

No se mantiene un `roadmap.md` o `timeline.md` como autoridad paralela.

---

## 23. Independencia de backend y host

El Change Model no depende de:

```text
Engram observation types
topic_key
FTS
SQLite schema
MCP tool names
Codex
OpenCode
filesystem state
AGENTS.md
SKILL.md
```

La ruta correcta es:

```text
Host Agent
  -> SDD Semantic API
  -> Change Model
  -> Memory Contract
  -> Adapter
  -> Backend
```

El Change Model tampoco contiene policy específica de Laravel, React, AWS u otro stack.

---

## 24. Operaciones de dominio esperadas

Este documento no define aún la API final, pero el modelo debe poder sostener al menos:

```text
openChange(intent, optional contract)
getChange(id)
updateChange(id, expected_version, patch/command)
listOpenChanges(project)
closeChange(id, reason, evidence/relations...)
createReceipt(...)
relateChange(...)
```

`updateChange` no debe exponer un `put arbitrary JSON` al agente.

La futura Semantic API debería preferir **operaciones semánticas** o validación del modelo antes de persistir.

Ejemplos:

```text
setFrontier(...)
refineAcceptance(...)
addDependency(...)
recordConstraint(...)
closeCompleted(...)
```

La superficie exacta se decide después del adapter spike; no se congela aquí prematuramente.

---

## 25. Invariantes falsables

La próxima implementación no puede considerarse correcta si falla cualquiera de estas propiedades.

### C1 — No Change para ephemeral

Una edición trivial puede completarse sin crear records SDD.

### C2 — Identidad única

Dos actores no pueden crear exitosamente dos Changes lógicos distintos con el mismo `CHG-*` dentro del proyecto.

### C3 — Exact recovery

Con un Change ID conocido, recuperar el estado vigente no depende de search/ranking.

### C4 — No lost update

Dos writers concurrentes no pueden producir success silencioso pisándose.

### C5 — Intent durable

Todo Change durable tiene intent suficiente para distinguir qué significa ese Change.

### C6 — Continuity actionable

Antes de un handoff de Change abierto, existe frontier suficiente para reanudar sin reconstruir la conversación.

### C7 — Completion evidence-backed

Un Change `closed/completed` no puede persistirse únicamente con una afirmación vacía del agente.

### C8 — Acceptance coverage

Si existen criterios de acceptance explícitos, closure debe poder demostrar cobertura o justificar explícitamente cualquier criterio no aplicable.

### C9 — No silent scope drift

Una necesidad materialmente nueva no se incorpora al Change activo sin ajustar deliberadamente contract o crear una relación split/spawn.

### C10 — Relation consistency

No se persisten inversos duplicados como dos autoridades (`depends_on` + `blocks`).

### C11 — Backend independence

El payload del Change no contiene keys/types propios de Engram.

### C12 — Cache independence

Perder caches/indexes locales no pierde ningún Change durable.

### C13 — Receipt sin ceremonia retroactiva

Crear un receipt no obliga a inventar WorkUnits, Progress o SessionSummary inexistentes.

### C14 — Cross-process continuity

Un proceso nuevo puede recuperar un Change abierto desde la autoridad durable sin depender del estado privado del proceso anterior.

### C15 — Conflict-aware close

Un close concurrente contra una versión stale produce conflict/re-evaluación, no overwrite.

---

## 26. Qué se elimina respecto del Change Model anterior

Esta reconstrucción retira del core:

### `ChangeBrief` como record separado

El contenido vigente relevante pertenece al Change mismo.

No necesitamos una entidad adicional que replique intent/scope/acceptance.

### `Progress` como record separado

La frontier vigente pertenece a `Change.continuity`.

### `SessionSummary` como primitive SDD

No es requisito de recovery. Puede existir como capacidad del backend/host, pero no sustituye Change.

### `event` obligatorio

No se adopta event stream para explicar cada transición.

### `blocks` persistido

Se deriva de `depends_on`.

### `related_to` core

Se difiere hasta demostrar que aporta más señal que ruido.

### WorkUnit dentro del core

Sigue experimental.

### File allocator / control state

No pertenece al Change Model.

---

## 27. Qué se conserva del diseño previo

Se mantienen porque siguen alineados con la evidencia y arquitectura:

- Change como identidad durable separada de conversación;
- `CHG-YYYYMMDD-NN` + title/slug separado;
- lifecycle `open|closed`;
- close reason separado;
- contenido adaptativo, no secciones obligatorias;
- scope drift explícito;
- split vs spawn;
- Change != unidad de ejecución;
- roadmap como projection;
- Markdown como export;
- Decision/Evidence/Knowledge solo cuando aportan valor;
- recovery selectivo;
- evidence antes de completion.

---

## 28. Qué queda deliberadamente abierto

No se decide todavía:

- heurística definitiva de materialidad para `receipt`;
- forma final de IDs de `Decision`/`Evidence`/`Knowledge`;
- existencia final de WorkUnit;
- prioridad/roadmap ordering;
- merge semántico avanzado de updates concurrentes;
- relation kind débil como `related_to`;
- tamaño máximo/recomendado de contract/acceptance;
- packaging de verification como API/runtime/skill;
- si Engram cumple realmente las garantías requeridas.

Esas preguntas no bloquean el adapter spike.

---

## 29. Gate para la siguiente frontier

`change-model.md` está suficientemente cerrado para avanzar cuando podemos responder sin ambigüedad:

1. cuándo existe un Change y cuándo no;
2. quién posee su estado durable;
3. cómo obtiene identidad sin allocator file-based;
4. qué lifecycle tiene;
5. qué información siempre existe;
6. qué información es adaptativa;
7. cómo se representa una frontier recuperable;
8. cuándo scope drift produce split/spawn;
9. cómo se representa dependencia sin duplicar `blocks`;
10. qué exige `completed`;
11. cómo se protege de lost updates;
12. qué relación tiene con Decision/Evidence/Knowledge;
13. por qué Receipt no es otra entidad;
14. por qué WorkUnit no forma parte todavía del core;
15. qué propiedades deberá falsar el próximo spike.

Una vez aprobada esta frontier, **no se pasa directamente a CLI/runtime**.

La siguiente frontera es el **adapter spike mínimo** para comprobar si un backend real puede satisfacer `memory-contract.md` con las garantías que este Change Model necesita.

Ese spike debe ser pequeño y puede invalidar decisiones de Memory/Change antes de construir producto encima.
