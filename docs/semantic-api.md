# SDD V2 — Semantic API

## 1. Estado y propósito

**Estado:** contrato de diseño de F6; todavía no es implementación productiva.

La Semantic API es la capa que evita que el agente implemente manualmente, request por request:

- lifecycle de Change;
- generación de identidad;
- persistencia;
- continuity/frontier;
- reglas mínimas de closure;
- aislamiento de proyecto.

Arquitectura:

```text
Host Agent / Harness
        |
        v
SDD Semantic API
        |
        v
SDD Domain Model
        |
        v
Memory Contract
        |
        v
Backend Adapter
```

La Semantic API **no reemplaza al agente** para decisiones semánticas que requieren comprensión del cambio.

Su responsabilidad es más limitada:

> hacer deterministas las invariantes mecánicas de SDD y ofrecer operaciones de dominio pequeñas, evitando que el LLM manipule records canónicos arbitrariamente.

---

## 2. Qué problema resuelve

Sin esta capa, el agente tendría que hacer algo equivalente a:

```text
decidir ID
-> construir JSON Change
-> recordar lifecycle válido
-> decidir cómo actualizar continuity
-> impedir cierre sin evidence
-> llamar Memory Contract
-> interpretar errores
-> evitar cambiar project_id/kind/id
-> recordar qué campos borrar al cerrar
```

Eso recrearía el problema ya observado en Alpha.5:

> la semántica existe en documentación, pero el LLM actúa como implementation layer.

La API debe convertir ese flujo en operaciones como:

```text
openChange(...)
updateChange(...)
closeChange(...)
```

donde las reglas mecánicas viven en código.

---

## 3. Qué NO resuelve

La Semantic API no debe convertirse en:

- router general de requests;
- phase engine;
- planner;
- task manager;
- workflow DSL;
- spec generator;
- shell/test runner;
- repo navigator;
- subagent coordinator;
- memory search engine;
- replacement de Codex/OpenCode/etc.

Especialmente, no existe:

```text
beginRequest()
plan()
design()
createTasks()
implement()
verifyPhase()
```

como pipeline obligatorio.

El host sigue resolviendo HOW, herramientas y ejecución.

---

## 4. Regla principal: no existe una operación `ephemeral`

`ephemeral` significa precisamente que SDD no necesita crear estado durable.

Por tanto, la API **no** debe ofrecer:

```text
startEphemeralChange()
recordEphemeral()
```

ni exigir una llamada SDD por cada request.

La ausencia de una operación durable es válida.

Esto mantiene:

```text
trabajo trivial
-> host actúa
-> verifica proporcionalmente
-> termina
```

sin ceremony SDD.

La Semantic API entra cuando el agente necesita:

```text
receipt
o
continuity
o
recovery de estado durable existente
```

---

## 5. Binding por proyecto

La API se instancia ligada a un único `project_id`.

Forma conceptual:

```javascript
const sdd = createSemanticApi({
  projectId,
  memory,
  idFactory,
});
```

Las operaciones normales no reciben `project_id` repetidamente:

```text
sdd.openChange(...)
sdd.getChange(id)
sdd.listOpenChanges(...)
```

### Motivo

Esto evita una clase completa de errores:

```text
agente construye record para proyecto A
-> accidentalmente persiste/consulta proyecto B
```

El binding pertenece a configuración/wiring.

El `project_id` lógico sigue siendo parte del record durable, pero no es un parámetro libre en cada mutation.

---

## 6. Superficie mínima de la primera Alpha

La superficie propuesta es deliberadamente pequeña:

```text
openChange(input)
createReceipt(input)

getChange(id)
listOpenChanges(options?)

updateChange(id, mutations)

closeChange(id, input)
```

Seis operaciones.

No se agrega una operación hasta que exista un caso de dominio que no pueda expresarse correctamente con éstas.

### No incluido todavía

```text
recordDecision()
recordKnowledge()
recordEvidence()
relateChange()
addDependency()
supersedeChange()
splitChange()
coordinateAgents()
```

Decision, Knowledge y Evidence siguen siendo conceptos válidos del Domain Model.

Pero no necesitan API dedicada para validar el primer slice de Change continuity/receipt.

Evidence pequeña puede vivir embebida en closure, como ya permite Change Model.

---

## 7. `openChange(input)`

Crea un Change `open` para continuity.

Entrada conceptual:

```yaml
title: Estado del ticket desde detalle

intent: >
  Permitir cambiar un ticket entre open y closed desde su detalle,
  sin introducir estados nuevos.

contract:
  scope:
    out:
      - agregar estados adicionales
  acceptance:
    - id: A1
      condition: solo open/closed son válidos

continuity:
  next: >
    Inspeccionar el flujo actual de actualización de estado y
    localizar el slice mínimo para exponerlo desde detalle.

  completed: []
  blockers: []
```

### 7.1 Invariantes impuestas por código

`openChange` debe:

1. generar `CHG-<ULID>`;
2. establecer `lifecycle=open`;
3. impedir que caller suministre otro ID;
4. impedir que caller suministre `project_id`, `kind` o lifecycle;
5. requerir `title` no vacío;
6. requerir `intent` no vacío;
7. requerir `continuity.next` no vacío;
8. normalizar listas vacías sin inventar secciones;
9. rechazar `relations` en el slice inicial;
10. persistir mediante un único `memory.put`;
11. devolver solo después de confirmación durable.

### 7.2 Por qué `next` es obligatorio

Un Change abierto existe para preservar continuidad.

Permitir:

```text
open Change
+ no frontier
```

volvería a crear state durable que no sabe cómo reanudarse.

La frontier puede ser pequeña:

```text
"Inspeccionar el endpoint actual y elegir el slice ejecutable."
```

No necesita ser un plan.

### 7.3 Qué NO hace

`openChange` no:

- inspecciona el repo;
- decide si el request era realmente continuity;
- genera acceptance artificial;
- inventa scope;
- decide HOW;
- crea WorkUnits.

La decisión `ephemeral | receipt | continuity` sigue siendo una decisión semántica del agente/host.

---

## 8. `createReceipt(input)`

Crea directamente un Change `closed/completed`.

No hace:

```text
open
-> update
-> close
```

porque eso inventaría lifecycle que nunca existió.

Entrada conceptual:

```yaml
title: Corregir validación de estado

intent: Rechazar cualquier estado distinto de open/closed.

outcome: La validación rechaza pending y preserva open/closed.

evidence:
  summary: >
    Test dirigido cubre open, closed y pending; todos los casos
    producen el resultado esperado.
  covers:
    - A1

contract:
  acceptance:
    - id: A1
      condition: pending es rechazado
```

### 8.1 Invariantes

Debe:

1. generar ID;
2. construir `lifecycle=closed`;
3. usar `close.reason=completed`;
4. requerir `outcome` no vacío;
5. requerir evidence no vacía;
6. si existe acceptance explícita, exigir coverage completo mediante `evidence.covers`;
7. no crear `continuity`;
8. persistir en un único `put`;
9. confirmar antes de devolver.

### 8.2 Evidence mínima

Para la primera Alpha, la API no necesita diseñar todavía un Evidence Model nuevo.

Acepta la forma embebida del Change Model:

```yaml
evidence:
  summary: non-empty
  covers: optional acceptance ids
  refs: optional
```

La API puede validar estructura y presencia.

No puede verificar por sí sola que el test realmente ocurrió.

La observación real sigue proviniendo del host:

```text
shell/test/readback/browser/etc.
```

La API hace determinista:

```text
completed requiere evidence
```

no:

```text
evidence es verdadera porque llegó como string
```

La calidad factual se prueba en el slice de integración/host más adelante.

---

## 9. `getChange(id)`

Recupera un Change conocido mediante Memory Contract.

Flujo:

```text
validate Change ID
-> memory.get(project + kind=change + id)
-> validate record shape
-> return Change
```

### Invariantes

No:

```text
semantic search
-> elegir el que parece correcto
```

La exactitud ya fue validada en F5.

### Recovery fast-path

Cuando el Change recuperado contiene:

```text
intent
+ contract material
+ continuity.next ejecutable
```

la API no debe producir planning adicional.

Devuelve el estado.

El host hace:

```text
inspección dirigida
-> ACT
```

---

## 10. `listOpenChanges(options?)`

Enumera Changes abiertos del proyecto ligado.

Flujo:

```text
memory.list(project, kind=change)
-> validar cada Change
-> lifecycle == open
-> devolver items + complete
```

Resultado conceptual:

```yaml
items:
  - CHG-...
  - CHG-...
complete: true
```

### Invariante importante

Si Memory Contract devuelve:

```text
complete=false
```

la Semantic API conserva:

```text
complete=false
```

No convierte un resultado parcial en "todos los Changes abiertos".

### No decide automáticamente cuál continuar

Si hay varios Changes abiertos:

```text
listOpenChanges()
```

no elige uno por similitud.

La selección puede depender de:

- ID conocido;
- instrucción del usuario;
- contexto explícito del host.

---

## 11. `updateChange(id, mutations)`

Esta es la única mutation genérica del core, pero **no es JSON Patch** ni `put arbitrary JSON`.

Forma:

```javascript
updateChange(id, [
  { type: "refine", ... },
  { type: "set_frontier", ... },
])
```

La API:

```text
get exact
-> comprobar lifecycle=open
-> aplicar mutations conocidas
-> validar Change final
-> un único put
```

Esto permite agrupar varias modificaciones semánticas en un write sin ampliar la superficie pública con decenas de métodos.

---

## 12. Mutation `refine`

Sirve para clarificaciones dentro de la **misma intención**.

Ejemplo:

```yaml
type: refine

title: optional-new-title
intent: optional-refined-intent

contract:
  optional updated contract
```

### Permitido

- mejorar wording;
- precisar acceptance;
- agregar constraint material;
- reducir scope;
- registrar edge case coherente.

### No permitido conceptualmente

Usar `refine` para convertir:

```text
"cambiar estado de ticket"
```

en:

```text
"crear sistema completo de permisos"
```

Eso es scope drift.

### Límite de enforcement

La API puede impedir cambios estructurales ilegales.

No puede determinar con certeza si dos textos representan la misma intención.

Esa decisión sigue siendo semántica del agente.

La regla correcta es:

```text
si cambia la intención material
-> no refine
-> nuevo Change / spawn / supersede
```

No se intenta resolver comprensión semántica mediante heurísticas ocultas.

---

## 13. Mutation `set_frontier`

Actualiza continuity para handoff/recovery.

Entrada:

```yaml
type: set_frontier

completed:
  - endpoint PATCH implementado
  - test de dominio pasa

next: >
  Agregar el control open/closed en la vista de detalle usando
  el endpoint ya validado.

blockers: []
```

### Invariantes

Debe:

1. funcionar solo sobre Change `open`;
2. exigir `next` no vacío;
3. reemplazar la frontier vigente, no acumular history;
4. mantener `completed` como resumen compacto;
5. normalizar blockers;
6. persistir un único snapshot vigente.

No crea:

- Progress record;
- session summary;
- event stream.

---

## 14. Relaciones: diferidas del slice inicial

El Change Model conserva relaciones válidas como:

```text
split_from
spawned_from
depends_on
supersedes
```

pero F6A no expone todavía mutations de relaciones.

Motivos:

- `supersedes` requiere coordinar al menos dos Changes;
- `split_from` forma parte de una operación de split aún no diseñada;
- `depends_on` no fue necesario para validar continuity/receipt en el dogfood previo;
- agregar relaciones ahora ampliaría el primer slice sin evidencia de que sean necesarias para probar la Semantic API.

Por tanto no existe todavía:

```text
add_dependency
relateChange
supersedeChange
splitChange
```

Si el siguiente dogfood demuestra que una dependencia durable cambia una frontier real, se diseña y prueba esa operación explícitamente.

Esto no elimina las relaciones del Domain Model; solo evita promocionarlas prematuramente a la primera API ejecutable.

---

## 15. `closeChange(id, input)`

La primera superficie implementable debe soportar:

```text
completed
cancelled
```

Los reasons:

```text
superseded
split
```

siguen perteneciendo al Change Model, pero se difieren hasta definir una operación multi-Change que no deje relaciones parciales o contradictorias.

Esto evita implementar prematuramente coordinación de dos o más records.

---

## 16. `closeChange(... completed ...)`

Entrada:

```yaml
reason: completed

outcome: >
  El estado puede cambiarse desde detalle y persiste.

evidence:
  summary: >
    Tests dirigidos cubren open/closed y persistencia.
  covers:
    - A1
    - A2
  refs: optional

```

### Invariantes mecánicas

La API debe rechazar completion si:

- Change ya está closed;
- `outcome` está vacío;
- evidence está vacía;
- existen blockers en continuity;
- acceptance explícita existe pero caller no declara cobertura suficiente;
- el Change final no puede persistirse.

### Acceptance coverage

Si el Change contiene:

```yaml
acceptance:
  - id: A1
  - id: A2
```

el close input debe poder declarar la cobertura dentro de la propia evidence:

```yaml
evidence:
  summary: Tests dirigidos cubren la aceptación.
  covers:
    - A1
    - A2
```

La API verifica que todos los IDs requeridos estén presentes en `evidence.covers`.

Esto **no prueba** que el test sea verdadero.

Sí impide un bug mecánico:

```text
hay acceptance explícita
-> caller cierra sin siquiera identificar qué evidence la cubre
```

### Efecto de closure

Al cerrar completed:

```text
lifecycle = closed
close.reason = completed
close.outcome = ...
close.evidence = ...
continuity = removed
```

No queda `next` stale en un Change cerrado.

---

## 17. `closeChange(... cancelled ...)`

Entrada:

```yaml
reason: cancelled
rationale: optional
```

Reglas:

- no requiere evidence de cumplimiento;
- elimina continuity;
- deja `lifecycle=closed`;
- no inventa outcome completed.

---

## 18. Supersede y split: deliberadamente fuera del primer slice

El Domain Model ya reconoce:

```text
superseded
split
```

Pero implementarlos correctamente implica varios records.

Ejemplo supersede:

```text
crear nuevo Change
-> new.supersedes = old
-> cerrar old como superseded
```

Sin transacción multi-record pueden ocurrir fallos parciales.

No es correcto esconder eso detrás de:

```text
closeChange(old, superseded)
```

y fingir que el relation graph quedó consistente.

Por tanto F6 inicial **no implementa todavía** esas dos operations.

Cuando exista necesidad real, se diseña una operación compuesta con failure/recovery explícitos.

---

## 19. Errores de dominio

La API no debe filtrar detalles físicos de Engram.

Errores conceptuales mínimos:

```text
change_not_found
invalid_change
change_closed
closure_rejected
dependency_invalid

memory_unavailable
memory_ambiguous
memory_unsupported
memory_error
```

Ejemplo:

```text
Engram HTTP 503
-> Memory Contract unavailable
-> Semantic API memory_unavailable
```

No:

```text
caller recibe "curl exited 7"
```

Los detalles backend pueden conservarse como `cause` diagnóstica, no como semántica pública.

---

## 20. Qué vive en lógica pura

Antes de escribir un adapter productivo, la mayor parte del comportamiento puede probarse sin backend:

```text
generateChangeId
buildOpenChange
buildReceipt
validateChange
applyMutation
closeCompleted
closeCancelled
validateAcceptanceCoverage
```

Estas funciones:

- no conocen Engram;
- no conocen HTTP;
- no conocen Docker;
- no leen el repo;
- no ejecutan tests.

La capa effectful queda pequeña:

```text
get
list
put
```

a través del Memory Contract.

---

## 21. Forma conceptual

```text
SemanticApi
|
+-- project binding
+-- idFactory
+-- MemoryPort
|
+-- openChange
|     -> buildOpenChange
|     -> validate
|     -> memory.put
|
+-- createReceipt
|     -> buildReceipt
|     -> validate
|     -> memory.put
|
+-- getChange
|     -> memory.get
|     -> validate
|
+-- listOpenChanges
|     -> memory.list
|     -> validate/filter
|
+-- updateChange
|     -> getChange
|     -> apply mutations
|     -> validate
|     -> memory.put
|
+-- closeChange
      -> getChange
      -> closeCompleted/cancelled
      -> validate
      -> memory.put
```

No hay state store adicional.

---

## 22. Atomicidad dentro del modelo soportado

Para la primera Alpha:

```text
una Semantic API operation
-> un writer sobre ese Change
```

`updateChange` y `closeChange` usan:

```text
get
-> pure transformation
-> put
```

No prometen protección contra otro writer simultáneo sobre el mismo Change.

Eso coincide con Memory Contract.

No se agrega version/CAS por debajo para simular una garantía que el producto no declara.

---

## 23. API y persistencia adaptativa

La clasificación no debe convertirse en un router burocrático.

Flujo esperado:

### Trabajo trivial

```text
request
-> ACT
-> verify
-> fin

Semantic API calls: 0
```

### Trabajo material terminado en la sesión

```text
request
-> ACT
-> verify
-> createReceipt

Semantic API calls durables: 1
```

### Trabajo que necesita continuity

```text
request
-> entender suficiente para frontier
-> openChange
-> ACT
-> updateChange(set_frontier) cuando haga falta handoff
-> otra sesión: getChange
-> ACT
-> closeChange(completed)
```

No existe obligación de actualizar Change después de cada paso.

---

## 24. Progressive disclosure

La API tampoco debe obligar al agente a cargar el modelo completo.

Para una operación concreta, el caller necesita solo su schema.

Ejemplos:

```text
closeCompleted
-> necesita closure invariants
-> no necesita documentación de split/spawn

set_frontier
-> necesita continuity shape
-> no necesita Evidence Model completo
```

Esto será relevante en F7/F8 para decidir qué reglas deben proyectarse al host y cuáles pueden descubrirse on-demand.

No se crean skills todavía.

---

## 25. Qué NO debe exponer el primer producto

```text
putRecord(json)
patchRecord(path, value)
setLifecycle("closed")
setProject(...)
setKind(...)
setChangeId(...)
writeRawEvidence(...)
writeEngramTopicKey(...)
```

Esas operations permiten saltarse el Domain Model.

El Memory Contract existe debajo de la Semantic API, no como tool normal del agente para manipular Changes.

---

## 26. Primer slice falsable

Después de aprobar este contrato, la implementación inicial no debe cubrir toda F6.

Debe probar únicamente:

```text
openChange
getChange
updateChange(refine / set_frontier)
closeChange(completed / cancelled)
createReceipt
listOpenChanges
```

con un `MemoryPort` in-memory.

### Casos que deben romperse deliberadamente

1. ephemeral no genera ninguna escritura;
2. open sin frontier -> reject;
3. caller intenta suministrar ID/lifecycle/project/kind -> reject;
4. open con `relations` -> reject en el slice inicial;
5. recovery exacto devuelve frontier actual;
6. `refine` preserva id/project/kind/lifecycle;
7. `refine` con campos reservados -> reject;
8. set_frontier sobre closed -> reject;
9. close completed sin outcome -> reject;
10. close completed sin evidence -> reject;
11. acceptance parcial -> reject;
12. close completed con blocker -> reject;
13. closure elimina continuity;
14. close cancelled no inventa outcome/evidence;
15. receipt se crea cerrado directamente;
16. receipt no inventa continuity;
17. receipt con acceptance y coverage parcial -> reject;
18. listOpenChanges no incluye closed;
19. `complete=false` del MemoryPort se preserva;
20. memory unavailable no se transforma en success.

No Engram todavía.

F5 ya validó el Memory Contract ↔ Engram boundary.

F6 debe aislar primero la semántica.

---

## 27. Criterio de promoción

El slice puede pasar de `experiments/` a producto solo si demuestra:

- menos semántica manual para el agente;
- no introduce otro source of truth;
- no exige llamada para ephemeral;
- closure mecánicamente segura;
- recovery/action frontier simple;
- API pequeña;
- lógica pura mayoritaria;
- backend totalmente detrás de MemoryPort;
- tests orientados a invariantes;
- ningún componente depende de Engram directamente.

Si para implementar estas seis operations aparece necesidad de:

```text
router
WorkUnit
state.json
phase graph
skill catalog
migration
```

la implementación está ampliando la frontier incorrectamente.

---

## 28. Decisiones diferidas

Fuera de F6 inicial:

- API dedicada de Decision;
- API dedicada de Evidence separado;
- Knowledge promotion;
- relations / `add_dependency`;
- supersede multi-record;
- split multi-record;
- same-Change multi-writer;
- CAS;
- transport final del adapter;
- CLI;
- MCP SDD;
- host adapters;
- runtime projection;
- skills;
- packaging;
- migration;
- exporters.

No se agregan como placeholders.

---

## 29. Gate de F6A

Este contrato queda aprobado cuando podemos responder:

1. **¿El trabajo ephemeral requiere SDD API?**  
   No.

2. **¿Cómo se crea continuity?**  
   `openChange`, con frontier requerida.

3. **¿Cómo se crea receipt?**  
   `createReceipt`, cerrado directamente.

4. **¿Cómo se recupera un Change conocido?**  
   `getChange`.

5. **¿Cómo se actualiza sin arbitrary JSON patch?**  
   `updateChange` con mutations semánticas conocidas: inicialmente `refine` y `set_frontier`.

6. **¿Cómo se cierra completed?**  
   `closeChange` con outcome + evidence + acceptance coverage + cero blockers.

7. **¿Qué persiste la API?**  
   Solo vía Memory Contract.

8. **¿Dónde vive project identity?**  
   En el binding de la instancia + record durable.

9. **¿Qué concurrencia promete?**  
   La misma que Memory Contract: un writer por Change a la vez.

10. **¿Qué se implementa primero?**  
    Un slice puro/in-memory; no Engram ni runtime.

---

## 30. Próxima frontier

Si F6A se aprueba:

```text
F6B — Semantic API pure-domain spike
```

Ubicación temporal:

```text
experiments/semantic-api/
```

Objetivo:

> falsar las invariantes de este documento sin backend real y sin crear todavía producto distribuible.

Cuando el spike termine:

```text
evidencia útil
-> decisión
-> promoción mínima o corrección
-> eliminar experimento
```
