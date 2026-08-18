# SDD V2 — Change Model

## 1. Estado y propósito

**Estado:** contrato activo de dominio para la reconstrucción de SDD V2.

Un `Change` representa una intención durable de modificar un proyecto cuando esa intención necesita trazabilidad, cierre verificable o continuidad más allá del contexto inmediato.

Este documento define:

- cuándo existe un Change;
- qué identidad tiene;
- lifecycle;
- contenido mínimo y adaptativo;
- continuity/frontier;
- scope drift y relaciones;
- receipt;
- evidence y closure;
- el modelo de concurrencia soportado.

Depende de:

```text
rebaseline-architecture.md
  -> una sola autoridad durable
  -> host-native first
  -> no side-state autoritativo
  -> no garantías no justificadas

memory-contract.md
  -> put / get / list
  -> exactitud semántica verificable
  -> IDs sin allocator central
  -> same-Change concurrent writers fuera de la primera Alpha
```

No define:

- formato físico de Engram;
- adapter;
- CLI;
- runtime;
- skills;
- WorkUnits;
- router `direct|compact|full`;
- migration desde Alpha.1.

---

## 2. Qué problema resuelve Change

El repo muestra **qué código existe ahora**.

No siempre conserva suficientemente:

- qué resultado se intentaba obtener;
- qué límites/no-objetivos eran importantes;
- qué queda pendiente al cambiar de sesión/agente;
- por qué se tomó una decisión material;
- qué evidencia justifica decir que el trabajo terminó;
- qué nueva intención apareció durante la ejecución.

Change cubre ese espacio.

No equivale a:

```text
Change != chat
Change != sesión
Change != branch
Change != commit
Change != ticket externo
Change != plan completo
Change != lista de tareas
Change != WorkUnit
```

La meta es conservar semántica útil sin volver a:

```text
proposal
-> spec
-> design
-> tasks
-> state
-> verify document
```

---

## 3. Cuándo existe un Change

No toda petición crea estado SDD.

La política durable conserva tres comportamientos.

### 3.1 Ephemeral

Trabajo donde no existe valor suficiente en crear un record durable SDD.

Ejemplos típicos:

- wording/UI cosmético;
- rename mecánico;
- corrección trivial;
- cambio local cerrado cuya intención se reconstruye fácilmente desde repo/tests;
- trabajo sin continuidad pendiente ni decisión durable.

Resultado:

```text
no Change
```

No se crea un Change retrospectivo para demostrar que SDD participó.

### 3.2 Receipt

Trabajo material que ya terminó dentro del contexto actual, pero cuyo resultado merece una huella durable.

El Change puede crearse **al cierre**.

Ejemplo conceptual:

```yaml
change:
  id: CHG-...
  title: Cambiar estado del ticket desde detalle
  lifecycle: closed
  intent: Permitir alternar open/closed desde la vista de detalle.

  close:
    reason: completed
    outcome: El estado puede cambiarse desde detalle y persiste.
    evidence:
      summary: Tests de feature cubren ambos estados y persistencia.
```

Un receipt no inventa:

- continuity previa;
- WorkUnits;
- planning history;
- session summary;
- timeline.

### 3.3 Continuity

Trabajo que necesita sobrevivir al contexto actual.

Se usa cuando:

- continuará en otra sesión;
- existe handoff explícito;
- queda una frontier pendiente;
- existe blocker o decisión pendiente;
- reconstruir intención/restricciones sería costoso o riesgoso.

Resultado:

```text
open Change
+ continuity suficiente para reanudar
```

### 3.4 Regla

```text
sin valor durable                -> ephemeral
trabajo material ya terminado    -> receipt
trabajo durable todavía pendiente -> continuity
```

`receipt` y `continuity` **no son lifecycle states**.

Describen cuándo y cuánto estado durable hace falta.

---

## 4. Identidad

### 4.1 Requisito

Un Change necesita un ID:

- estable;
- backend-independent;
- host-independent;
- generado sin contador central;
- seguro para múltiples agentes/worktrees que creen Changes distintos;
- no dependiente de un file allocator.

### 4.2 Formato

La primera Alpha usa:

```text
CHG-<ULID>
```

Ejemplo:

```text
CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW
```

Motivos:

- puede generarse localmente;
- no requiere coordinación;
- incorpora orden temporal aproximado;
- tiene espacio aleatorio suficiente para evitar un allocator;
- es portable entre backends;
- existe como formato estándar y no inventamos una secuencia propia.

La parte `CHG-` distingue el tipo lógico.

### 4.3 Por qué se retira `CHG-YYYYMMDD-NN`

El formato anterior era legible, pero `NN` introducía una obligación de coordinación:

```text
¿cuál fue el último número?
-> reservar siguiente
-> evitar carrera
-> mantener allocator
```

Eso terminó empujando `state.json`, high-watermarks y luego `create-if-absent` al núcleo.

La legibilidad humana se resuelve con `title`/`slug`, no convirtiendo el ID en un contador de workflow.

### 4.4 Collision handling

La Semantic API genera el ULID.

Puede comprobar:

```text
get(candidate)
```

y regenerar si ya existe.

Esto no se presenta como una reserva atómica.

Dentro del modelo soportado, la probabilidad de colisión accidental es suficientemente baja y same-ID concurrent creation no requiere coordinación central.

Un ID existente **nunca se reutiliza deliberadamente para otra intención**.

### 4.5 Title y slug

`title` es requerido para ergonomía humana.

`slug` es opcional.

Ejemplo:

```yaml
id: CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW
title: Estado del ticket desde detalle
slug: ticket-status-toggle
```

Cambiar title/slug no cambia identidad.

---

## 5. Lifecycle

El lifecycle canónico es:

```text
open
closed
```

Nada más.

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

### 5.1 `open`

Existe trabajo o una decisión pendiente bajo esa intención.

Puede estar:

- en implementación;
- esperando input;
- bloqueado;
- parcialmente completado;
- esperando otra sesión/agente.

### 5.2 `closed`

Ya no existe trabajo pendiente bajo esa identidad.

Todo `closed` tiene `close.reason`.

Razones core:

```text
completed
cancelled
superseded
split
```

#### completed

La intención se considera satisfecha y existe evidence proporcional.

#### cancelled

La intención deja de perseguirse.

Puede conservar `rationale` cuando evita ambigüedad.

#### superseded

Otro Change reemplaza esta intención.

Debe existir relación verificable hacia el reemplazante.

#### split

El Change original deja de ser unidad ejecutable porque su scope completo fue repartido deliberadamente en otros Changes.

Crear un hijo no obliga a cerrar el parent como `split`.

---

## 6. Forma lógica

Forma máxima conceptual:

```yaml
change:
  id: CHG-01K2Z8E7M3R6J4V9Q1T5X8N2CW
  title: Estado del ticket desde detalle
  slug: ticket-status-toggle

  lifecycle: open

  intent: >
    Permitir cambiar un ticket entre open y closed desde su detalle,
    sin introducir estados nuevos.

  contract:
    scope:
      in:
        - cambiar estado desde detalle
      out:
        - agregar estados adicionales
    acceptance:
      - id: A1
        condition: solo se aceptan open y closed
      - id: A2
        condition: el estado persiste y vuelve a mostrarse correctamente
    constraints:
      - conservar compatibilidad con los valores actuales

  continuity:
    completed:
      - endpoint PATCH implementado y cubierto por test
    next: agregar el control en la vista de detalle
    blockers: []

  relations:
    split_from: CHG-...
    spawned_from: CHG-...
    depends_on:
      - CHG-...
    supersedes: CHG-...

  close:
    reason: completed
    outcome: ...
    evidence:
      summary: ...
      refs:
        - EVD-...
```

Esto **no es una plantilla obligatoria**.

No se escriben campos vacíos para parecer completo.

---

## 7. Campos mínimos

Todo Change durable contiene:

```text
id
title
intent
lifecycle
```

El envelope del Memory Contract aporta:

```text
project_id
kind=change
created_at
updated_at
```

No existe `version` obligatorio.

### Cuando aporta valor

Puede agregar:

```text
slug
contract
continuity
relations
close
```

Y dentro de `contract`, solo si son materiales:

```text
scope
acceptance
constraints
risks
edge_cases
rollback
```

### Regla de densidad

> Un campo entra porque reduce ambigüedad, riesgo o costo de recovery; no porque existe en el schema máximo.

---

## 8. Intent

`intent` expresa el cambio observable que se persigue.

Debe permitir distinguir:

```text
qué significa éxito
```

sin narrar el HOW local.

Demasiado pobre:

```text
"tickets"
"arreglar estados"
```

Demasiado procedural:

```text
"editar controller, luego route, luego Blade..."
```

Preferido:

```text
"Permitir cambiar un ticket entre open y closed desde su vista de detalle,
sin introducir estados adicionales."
```

El HOW pertenece al executor/repo salvo que una restricción técnica sea material.

---

## 9. Contract adaptativo

No existe una spec obligatoria por Change.

`contract` aparece cuando `intent` solo no evita suficiente ambigüedad.

### 9.1 Scope

```yaml
scope:
  in: [...]
  out: [...]
```

`out` solo enumera no-objetivos que realmente previenen scope drift.

No se listan archivos por anticipado salvo que sean una restricción material.

### 9.2 Acceptance

Acceptance expresa condiciones observables de éxito.

Ejemplo:

```yaml
acceptance:
  - id: A1
    condition: pending es rechazado
  - id: A2
    condition: open/closed persisten
```

Debe evitar tautologías:

```text
"funciona"
"implementar lo pedido"
```

Los IDs `A1`, `A2` son locales al Change y existen solo cuando ayudan a mapear evidence.

### 9.3 Constraints

Restricciones que afectan la solución o recovery.

Ejemplos:

- mantener compatibilidad pública;
- no introducir dependencia nueva;
- preservar formato existente.

### 9.4 Risks / edge cases / rollback

Son opcionales.

Se guardan cuando cambian:

- implementación;
- decisión;
- verification;
- rollback;
- próxima frontier.

No se crean como checklist.

---

## 10. Continuity y Execution Frontier

`continuity` existe cuando un Change abierto debe cruzar una frontera de contexto.

Forma pequeña:

```yaml
continuity:
  completed:
    - hechos ya confirmados que no deben repetirse
  next: próxima acción concreta y segura
  blockers:
    - bloqueo real si existe
```

Restricciones durables siguen en `contract.constraints` o en una Decision referenciada; no se duplican aquí.

### 10.1 `next` es la frontier

Debe permitir:

```text
get(Change)
-> inspección dirigida del repo
-> ACT
```

Malo:

```text
seguir
terminar UI
revisar pendientes
```

Bueno:

```text
Agregar en el detalle del ticket un selector open/closed que use
el PATCH existente y conserve las etiquetas actuales.
```

### 10.2 `completed`

Solo resume hechos que evitan repetir trabajo.

No es changelog.

### 10.3 `blockers`

`blocked` es una condición derivada, no lifecycle.

Puede surgir porque:

- `continuity.blockers` tiene contenido;
- una dependencia no está satisfecha;
- falta una decisión material.

### 10.4 Handoff invariant

Antes de entregar un Change abierto a otra sesión/agente:

```text
intent vigente
+ contract material
+ next frontier
+ blockers/dependencies relevantes
```

deben estar confirmados durablemente.

`SessionSummary` no es necesario.

---

## 11. Scope drift

Una conversación no amplía silenciosamente el Change.

### Dentro del mismo Change

Actualizar el mismo Change cuando:

- se aclara wording;
- se precisa acceptance;
- se incorpora un edge case coherente;
- se restringe scope sin cambiar el objetivo;
- se descubre HOW local necesario.

### Nuevo Change

Crear otro Change cuando:

- aparece una capability independiente;
- el objetivo cambia materialmente;
- el trabajo puede completarse/posponerse por separado;
- mezclarlo haría ambiguo `completed`.

### Split

Parte del scope original se convierte en Changes independientes:

```text
child -> split_from -> original
```

### Spawn

Durante el trabajo aparece una intención nueva fuera del scope original:

```text
new -> spawned_from -> origin
```

### Supersede

Una intención nueva reemplaza otra:

```text
new -> supersedes -> old
```

---

## 12. Relaciones core

Solo se persisten relaciones que cambian interpretación, orden o scope:

```text
split_from
spawned_from
depends_on
supersedes
```

No se persiste `blocks`.

Es derivable:

```text
A depends_on B
=> B blocks A
```

Tampoco se incluye `related_to` en el core porque su semántica débil puede producir graph noise.

### No duplicar inversos

No guardar simultáneamente:

```text
A depends_on B
B blocks A
```

como dos autoridades.

---

## 13. Decisions

No toda elección merece un record durable.

Una Decision separada se justifica cuando:

- afecta arquitectura o contrato público;
- cambia seguridad/comportamiento material;
- tiene trade-offs relevantes;
- sería costoso o riesgoso redescubrirla;
- otro actor necesita conocerla;
- su supersession/history importa.

Decisiones locales rutinarias permanecen en repo/contexto.

El Change conserva solo:

```text
constraint/resumen que necesita para ejecutar
+
ref a Decision cuando la historia propia aporta valor
```

Recovery de una frontier conocida no debería requerir buscar todas las Decisions.

---

## 14. Evidence

Evidence es información observable que soporta una afirmación de cumplimiento.

### 14.1 Embebida

Preferida cuando basta un resumen pequeño:

```yaml
close:
  reason: completed
  outcome: El estado puede alternarse y persiste.
  evidence:
    summary: >
      Feature tests cubren open/closed y rechazo de pending;
      diff check correcto.
```

### 14.2 Record separado

Crear `Evidence` propia cuando:

- necesita auditoría/identidad;
- varios criterios la referencian;
- tiene metadata estructurada relevante;
- el resumen dentro del Change sería insuficiente.

Ejemplo:

```yaml
evidence:
  id: EVD-<ULID>
  subject_id: CHG-...
  observation: Feature tests de estado
  result: pass
  covers: [A1, A2]
```

### 14.3 No es string ceremonial

Para `completed`, SDD debe poder responder:

```text
qué se observó
qué resultado produjo
qué afirmación/acceptance soporta
```

No alcanza:

```text
evidence = "done"
```

### 14.4 Proporcionalidad

No toda closure requiere test suite completa.

Ejemplos:

- cambio mecánico: readback/diff;
- comportamiento local: targeted test;
- boundary/integración: integration/runtime check;
- riesgo alto: checks más amplios.

---

## 15. Closure

### 15.1 completed

Antes de cerrar:

1. el outcome responde al intent;
2. no queda frontier bajo ese Change;
3. acceptance explícita está cubierta suficientemente;
4. no existe blocker conocido incompatible con completion;
5. evidence necesaria está confirmada;
6. el Change cerrado puede persistirse.

Flujo:

```text
get Change
-> verificar closure
-> persistir Evidence separada si hace falta
-> put Change closed
-> confirmar
```

No existe requisito CAS en la primera Alpha.

Esto es correcto porque concurrent writers sobre el mismo Change no forman parte del modelo soportado.

### 15.2 cancelled

No exige evidence de cumplimiento.

El Change deja de tener frontier pendiente.

### 15.3 superseded

Debe identificar el Change reemplazante.

### 15.4 split

Se usa solo cuando todo el trabajo pendiente del original fue trasladado deliberadamente a hijos y el original deja de ser unidad ejecutable.

---

## 16. Receipt

Receipt **no es una entidad distinta**.

Es un Change cerrado mínimo creado al final del trabajo.

Ejemplo:

```yaml
id: CHG-01K2Z8...
title: Estado del ticket desde detalle
lifecycle: closed
intent: Permitir cambiar open/closed desde detalle.

close:
  reason: completed
  outcome: Cambio disponible y persistente.
  evidence:
    summary: Feature tests relevantes pasan.
```

Puede incluir contract/Decision/Evidence refs si realmente fueron necesarias.

No requiere continuity retroactiva.

### Materialidad candidata

Tienden a merecer receipt:

- capability de dominio;
- schema persistente;
- API/contrato público;
- seguridad/policy material;
- dependencia/tooling material;
- arquitectura significativa.

Esto es una heurística a validar, no una checklist automática.

---

## 17. Continuity

Un Change de continuity permanece `open`.

Antes del handoff debe contener suficiente estado para:

```text
nuevo proceso
-> get exact Change
-> inspección dirigida
-> ACT
```

No depende de:

- chat previo;
- SessionSummary;
- Progress record;
- WorkUnit;
- state.json local.

### Recovery con ID conocido

```text
get(Change ID)
-> intent + contract material + continuity
-> ACT
```

### Recovery sin ID

```text
list(project, kind=change)
-> filtrar lifecycle=open
-> resolver relevante
-> get exact
-> ACT
```

Si `list` no es completo dentro del bound declarado, SDD no finge que enumeró todos los Changes.

---

## 18. Concurrencia soportada

### 18.1 Changes independientes

Soportado:

```text
Agent A -> Change A
Agent B -> Change B
```

incluyendo worktrees distintos.

Cada Change tiene identidad collision-resistant y persistencia independiente.

### 18.2 Handoff secuencial

Soportado:

```text
Agent A
-> persist frontier
-> termina

Agent B
-> get Change
-> continúa
```

### 18.3 Same-Change concurrent writers

No soportado en la primera Alpha:

```text
Agent A ----\
             > mutan el mismo Change simultáneamente
Agent B ----/
```

No existe lock/lease/CAS implícito.

SDD debe evitar planificar ese topology sobre la misma identidad.

Si el host delega trabajo paralelo, debe hacerlo sobre unidades/Changes realmente independientes o mantener un único writer del Change canónico.

### 18.4 Evolución futura

Si same-Change multi-writer demuestra valor real:

```text
Change Model
-> define merge/ownership semantics
-> Memory Contract agrega conditional_put
-> adapter demuestra capability
```

No se agrega CAS antes de esa decisión.

---

## 19. WorkUnit, Progress y SessionSummary

No forman parte del core actual.

### WorkUnit

Puede volver si dogfood demuestra que una unidad durable de ejecución distinta de Change reduce costo cognitivo/coordinación.

Hasta entonces el host puede:

- dividir trabajo localmente;
- usar subagentes;
- ejecutar pasos internos;

sin persistir otra entidad SDD.

### Progress

No existe como record separado.

La continuidad vigente vive en:

```text
Change.continuity
```

### SessionSummary

No es primitive SDD.

El dogfood mostró que Change + frontier bastaba para recovery y que session lifecycle agregó fricción.

---

## 20. Knowledge

Knowledge durable contiene hechos reusables más allá de un Change.

Ejemplo:

```text
"Este proyecto usa la convención pivot tag_ticket."
```

No promover automáticamente:

- error aislado;
- stdout;
- workaround descartado;
- decisión específica sin reutilización.

El repo sigue siendo autoridad de su realidad técnica actual.

Knowledge complementa el repo; no lo duplica.

---

## 21. Roadmap y timeline

No son estado canónico independiente.

### Roadmap

Puede proyectarse de:

```text
Changes
+ lifecycle
+ relations
+ metadata opcional futura
```

### Timeline

Se deriva de timestamps y records durables que realmente existan.

No se mantiene un `roadmap.md` o `timeline.md` paralelo como source of truth.

---

## 22. Independencia de backend y host

El Change payload no contiene conceptos físicos como:

```text
Engram topic_key
observation id
revision_count
FTS query
MCP tool name
SQLite row id
Codex session id
```

Ruta correcta:

```text
Host Agent
-> SDD Semantic API
-> Change Model
-> Memory Contract
-> Backend Adapter
-> Backend
```

El host sigue resolviendo:

- repo navigation;
- shell;
- tests;
- subagentes;
- skills;
- tool invocation.

---

## 23. Operaciones de dominio esperadas

La futura Semantic API debe poder expresar al menos:

```text
openChange(...)
createReceipt(...)
getChange(id)
listOpenChanges(project)
updateChange(id, semantic change)
closeChange(id, reason, evidence...)
relateChange(...)
```

No debe exponer al agente:

```text
put arbitrary Change JSON
```

como operación normal.

Preferir operaciones semánticas, por ejemplo:

```text
setFrontier(...)
refineAcceptance(...)
recordConstraint(...)
addDependency(...)
closeCompleted(...)
```

La superficie exacta se decide después del adapter spike.

---

## 24. Invariantes falsables

### C1 — Ephemeral stays ephemeral

Un cambio trivial puede terminar sin crear Change.

### C2 — Identity without allocator

Dos agentes creando Changes independientes no necesitan consultar/modificar un contador compartido para obtener identidad.

### C3 — Stable identity

Title/slug puede cambiar sin cambiar Change ID.

### C4 — Exact recovery

Con ID conocido, el Change correcto se recupera sin que el LLM elija entre resultados similares.

### C5 — Intent durable

Todo Change tiene intent suficiente para distinguir su objetivo.

### C6 — Actionable continuity

Antes de handoff, `continuity.next` permite reanudar sin reconstruir la conversación.

### C7 — Evidence-backed completion

`closed/completed` no se justifica con texto ceremonial vacío.

### C8 — Acceptance coverage

Si acceptance existe, closure puede explicar qué evidence la soporta.

### C9 — No silent scope drift

Una intención nueva no entra silenciosamente al Change activo.

### C10 — Relation consistency

No se persisten relaciones inversas como dos autoridades.

### C11 — Backend independence

El payload no contiene conceptos propios de Engram.

### C12 — Cache independence

Perder caches/local state no pierde Change durable.

### C13 — Receipt without retroactive ceremony

Receipt no inventa WorkUnit, Progress, SessionSummary o planning history.

### C14 — Cross-process continuity

Un proceso nuevo recupera continuidad desde Memory Contract.

### C15 — Declared concurrency honesty

La primera Alpha no presenta same-Change concurrent mutation como segura.

### C16 — Multiple independent Changes

Varios Changes independientes pueden coexistir y enumerarse sin allocator local.

---

## 25. Qué se retira respecto del modelo anterior

Se elimina del modelo activo:

```text
CHG-YYYYMMDD-NN
allocator / high-watermark
create-if-absent como requisito de identidad
version token obligatorio
optimistic concurrency / CAS
conflict-aware close
query() como primitive
append() como primitive
same-Change multi-writer guarantee
```

También permanecen fuera del core:

```text
ChangeBrief separado
Progress separado
SessionSummary SDD
event stream
WorkUnit
blocks persistido
related_to
```

No se mantienen como secciones deprecated; simplemente dejan de formar parte del modelo vigente.

---

## 26. Qué se conserva

Porque sigue alineado con arquitectura y evidencia:

- Change separado de conversación;
- lifecycle `open|closed`;
- close reason separado;
- persistencia adaptativa;
- receipt como Change cerrado;
- continuity dentro del Change;
- frontier mínima;
- contenido adaptativo;
- scope drift explícito;
- split/spawn/supersede/dependencies;
- Decision/Evidence/Knowledge solo cuando aportan;
- evidence antes de completion;
- roadmap/export como proyecciones;
- recovery selectivo;
- backend independence.

El dogfood previo ya mostró que un Change abierto con frontier fue suficiente para recuperar trabajo en otra sesión y que `session_summary` añadió fricción; esa evidencia sigue siendo una razón fuerte para mantener continuity pequeña. 

---

## 27. Preguntas deliberadamente abiertas

No se decide todavía:

- heurística final de qué trabajo merece receipt;
- si `slug` debe ser generado automáticamente;
- IDs finales de Decision/Evidence/Knowledge;
- si WorkUnit volverá a existir;
- prioridad/roadmap ordering;
- tamaño recomendado de acceptance;
- packaging de verification;
- cuándo habilitar same-Change concurrent writers.

Engram ya no es una pregunta abierta de esta frontier: F5 demostró que el Memory Contract inicial puede implementarse sobre Engram 1.20.0 sin modificar el backend.

Estas preguntas restantes no bloquean Semantic API.

---

## 28. Gate de Frontier 3

Change Model queda cerrado porque podemos responder:

1. **¿Cuándo existe Change?**  
   Receipt o continuity; ephemeral no obliga record.

2. **¿Qué identidad usa?**  
   `CHG-<ULID>`, sin allocator central.

3. **¿Qué lifecycle tiene?**  
   `open|closed`.

4. **¿Qué siempre contiene?**  
   `id`, `title`, `intent`, `lifecycle`.

5. **¿Qué necesita continuity?**  
   Frontier accionable y solo contexto durable material.

6. **¿Qué necesita completed?**  
   Outcome + evidence proporcional.

7. **¿Cómo se controla scope drift?**  
   Refinar mismo Change o crear split/spawn/superseding Change.

8. **¿Qué relaciones son core?**  
   `split_from`, `spawned_from`, `depends_on`, `supersedes`.

9. **¿Necesita WorkUnit?**  
   No en la primera Alpha.

10. **¿Qué concurrencia soporta?**  
    Changes independientes + handoff secuencial; no same-Change concurrent writers.

11. **¿Depende de Engram?**  
    No.

12. **¿El modelo puede persistirse sobre el backend candidato real?**  
    Sí; F5 validó `put/get/list`, update secuencial, exact recovery y project isolation sobre Engram 1.20.0.

---

## 29. Próxima frontier

```text
F6 — Semantic API
```

La siguiente pregunta ya no es cómo guardar un Change sino:

> ¿qué operaciones semánticas mínimas debe exponer SDD para que el agente use este modelo correctamente sin construir lifecycle/persistence/closure manualmente en cada request?

No crear todavía runtime, CLI o skills hasta cerrar esa superficie.
