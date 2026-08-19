# SDD V2 — Application API

## 1. Propósito

Este documento define la frontera programática de casos de uso de SDD.

**Application API no significa REST.**

Es una API semántica transport-free entre el host y el Domain Model:

```text
Host
  -> Application API
  -> Domain Model
  -> Memory Port
```

Library, MCP, CLI y un eventual HTTP API son exposiciones por encima.

La API existe para evitar que el LLM implemente manualmente:

- record envelopes;
- IDs;
- lifecycle;
- contract mutation;
- evidence/acceptance coverage;
- scope relations;
- project isolation;
- Memory error translation.

---

## 2. No es

No es:

- router de requests;
- planner;
- phase engine;
- task manager;
- shell runner;
- repo navigator;
- subagent coordinator;
- memory backend;
- REST por definición.

No existe:

```text
beginRequest
plan
design
createTasks
verifyPhase
```

como pipeline SDD obligatorio.

---

## 3. Binding

Forma conceptual:

```javascript
const sdd = createApplicationApi({
  projectId,
  memory,
  idFactory,
});
```

`projectId` queda ligado a la instancia.

Commands normales no reciben project arbitrario.

---

## 4. Persistencia adaptativa

No existe command `ephemeral`.

### Ephemeral

```text
0 Application API durable commands
```

### Receipt

```text
createReceipt(...)
```

### Continuity

```text
openChange(...)
setFrontier(...)
getChange(...)
closeChange(...)
```

No se llama a SDD después de cada tool call.

---

## 5. Superficie productiva inicial

### Queries

```text
getChange(id)
listOpenChanges(options?)

getDecision(id)
getEvidence(id)

searchKnowledge(query)   # capability opcional
```

### Change commands

```text
openChange(input)
createReceipt(input)
refineChange(id, refinement)
setFrontier(id, frontier)
spawnChange(originId, input)
addDependency(id, targetId)
closeChange(id, input)
```

### Related records

```text
recordDecision(input)
recordEvidence(input)
promoteKnowledge(input)
```

No se expone `put(record)` al agente como operación de dominio.

---

# Parte I — Cross-cutting rules

## 6. Validate before side effects

Para toda creación:

```text
validate input
-> validate semantic references/preconditions
-> allocate id
-> collision preflight
-> memory.put
-> confirm according to Memory Contract
```

Input inválido:

```text
0 IDs consumidos
0 writes
```

---

## 7. ID generation

Prefixes:

```text
CHG
DEC
EVD
KNW
```

Collision preflight:

```text
candidate
-> memory.get(exact)
-> not_found: create
-> exists: regenerate
-> ambiguous/unavailable/error: propagate
```

No retry infinito; implementación define un bound pequeño y falla explícitamente al agotarlo.

---

## 8. Error model

Public codes:

```text
not_found
invalid_input
invalid_state
closure_rejected
relation_invalid

memory_unavailable
memory_ambiguous
memory_unsupported
memory_error
```

No filtrar:

```text
curl exit code
Engram HTTP path
SQLite id
topic_key
```

como semántica pública.

Diagnostic cause puede conservarlos internamente.

---

## 9. Strict schemas

Todo key aceptado tiene schema.

Unknown field:

```text
invalid_input
```

No existe pass-through de objetos arbitrarios hacia payload.

---

## 10. Persisted-record validation

Un record recuperado se valida contra:

```text
envelope
kind
project
id
payload schema
domain invariants
```

Si el backend devuelve un record físicamente encontrado pero lógicamente inválido:

```text
memory_error
```

No se confunde con `invalid_input` del caller.

---

# Parte II — Change Queries

## 11. `getChange(id)`

```text
validate CHG id
-> memory.get({project, kind=change, id})
-> validate persisted Change
-> return domain Change
```

No fuzzy selection.

---

## 12. `listOpenChanges(options?)`

```text
memory.list({project, kind=change, bounded options})
-> validate items
-> filter lifecycle=open
-> preserve complete flag
```

Resultado:

```yaml
items: [...]
complete: true | false
next_cursor: optional
```

Si Memory dice `complete=false`, Application API nunca afirma exhaustividad.

---

# Parte III — Change Commands

## 13. `openChange(input)`

Entrada:

```yaml
title: ...
intent: ...

contract: optional
continuity:
  completed: optional
  next: required
  blockers: optional
```

Caller no puede suministrar:

```text
id
project_id
kind
lifecycle
relations
close
```

Flujo:

```text
validate
-> build open payload
-> generate/collision-check ID
-> put
-> return Change
```

`continuity.next` obligatorio.

---

## 14. `createReceipt(input)`

Entrada:

```yaml
title: ...
intent: ...
contract: optional
outcome: ...

evidence:
  - method: test
    result: pass
    summary: ...
    covers: [A1]
    source: optional
```

Reglas:

- outcome requerido;
- evidence embebida requerida;
- explicit acceptance exige coverage exacto;
- unknown coverage rechazado;
- `result=fail` no soporta completion;
- no crea continuity;
- un único Change nace `closed/completed`.

`createReceipt` **no acepta `evidence_refs`**.

Motivo: un Evidence independiente exige `subject_id=CHG-...`, pero el Change del receipt
todavía no tiene identidad antes de esta operación. Permitir refs aquí exigiría Evidence
dangling, preasignación externa del Change ID o una operación multi-record innecesaria.

Para un Change que ya existe, `closeChange(completed)` sí puede combinar evidence embebida
con `evidence_refs` previamente persistidas y validadas contra ese Change.

---

## 15. `refineChange(id, refinement)`

Solo Change `open`.

Entrada conceptual:

```yaml
title: optional
intent: optional

contract_patch:
  scope: value | null | omitted
  acceptance: value | null | omitted
  constraints: value | null | omitted
  risks: value | null | omitted
  edge_cases: value | null | omitted
  open_questions: value | null | omitted
  rollback: value | null | omitted
```

Semántica:

```text
omitted -> preserve
value   -> replace only that validated section
null    -> remove that optional section
[]      -> normalize to absent
```

No reemplaza contract completo.

No puede mutar:

```text
id
lifecycle
continuity
relations
close
```

La API no puede determinar por texto si el nuevo intent cambió materialmente el objetivo.
Ese juicio sigue siendo del agente; runtime indica que un cambio material usa `spawnChange`
o un nuevo Change.

---

## 16. `setFrontier(id, frontier)`

Solo Change `open`.

```yaml
completed: optional []
next: required
blockers: optional []
```

Reemplaza el snapshot de continuity.

No acumula history.

No crea Progress/Event records.

---

## 17. `spawnChange(originId, input)`

Nueva intención descubierta durante un Change existente.

Precondiciones:

```text
origin existe
input válido como openChange
```

Crea:

```yaml
newChange:
  lifecycle: open
  relations:
    spawned_from: originId
```

No muta origin.

Esto hace la operación segura con un único write canónico del child.

---

## 18. `addDependency(id, targetId)`

Precondiciones:

- source existe y está open;
- target existe;
- source != target;
- dependency no duplicada.

Efecto:

```text
source.relations.depends_on += target
```

No escribe:

```text
target.blocks += source
```

`blocks` es derivable.

---

## 19. `closeChange(id, { reason: completed, ... })`

Entrada:

```yaml
reason: completed
outcome: ...

evidence: optional [...]
evidence_refs: optional [...]
```

Precondiciones:

- Change open;
- outcome no vacío;
- no blockers activos;
- existe support evidence;
- every embedded evidence schema válido;
- every referenced Evidence existe y corresponde al Change;
- ninguna evidence usada tiene `result=fail`;
- union de `covers` satisface todos los acceptance IDs;
- union de `covers` no contiene IDs desconocidos.

Efecto:

```text
lifecycle = closed
close.reason = completed
close.outcome = ...
close.evidence = normalized embedded evidence
close.evidence_refs = refs if present
delete continuity
put
```

No hay CAS porque same-Change multiwriter no está soportado.

---

## 20. `closeChange(id, { reason: cancelled })`

Entrada:

```yaml
reason: cancelled
rationale: optional
```

No exige evidence de cumplimiento.

Efecto:

```text
closed/cancelled
continuity removed
```

---

## 21. Split y supersede

No hay commands automáticos iniciales.

No se implementan como dos `put` ingenuos.

Cuando exista necesidad:

```text
operation design
-> partial failure semantics
-> conformance test
-> implementation
```

---

# Parte IV — Decision

## 22. `recordDecision(input)`

```yaml
subject_id: optional CHG
statement: required
rationale: required
supersedes: optional DEC
```

Precondiciones:

- subject Change existe si se suministra;
- superseded Decision existe si se suministra.

Crea Decision nueva inmutable.

Retry idéntico puede reconciliarse; no hay arbitrary update.

---

## 23. `getDecision(id)`

Exact get + schema validation.

No search semántico para recuperar una Decision conocida.

---

# Parte V — Evidence

## 24. `recordEvidence(input)`

```yaml
subject_id: CHG-...
method: ...
result: ...
summary: ...
covers: optional [...]
source: optional
```

Precondiciones:

- Change existe;
- covers solo contiene IDs existentes del Change.

Crea Evidence inmutable.

Evidence `fail` puede registrarse; simplemente no soporta completed.

---

## 25. `getEvidence(id)`

Exact get + schema validation.

---

# Parte VI — Knowledge

## 26. `promoteKnowledge(input)`

```yaml
statement: required
source_refs: optional
```

Crea Knowledge reusable.

No intenta decidir automáticamente si un hecho merece promotion; esa es una decisión
semántica del agente/host.

---

## 27. `searchKnowledge(query)`

Discovery opcional.

Puede apoyarse en `memory.search` cuando el backend lo soporte.

No tiene semántica de exact recovery.

Search ranking puede ayudar a descubrir Knowledge porque el caller está explícitamente
buscando contexto, no una identidad canónica conocida.

Si `memory.search` no existe:

```text
memory_unsupported
```

No crear side index silencioso.

---

# Parte VII — Ports y transport

## 28. Memory Port dependency

Application API solo conoce:

```text
put
get
list
search? optional
```

No conoce Engram.

---

## 29. Library exposure

La implementación Node exporta factory/services para composición interna.

Library es referencia canónica para tests y transports.

---

## 30. MCP transport

Primer transport objetivo.

Cada tool:

```text
validate transport schema
-> call one Application use case
-> map result/error structurally
```

No replica lógica de dominio.

La lista de tools refleja commands/queries realmente implementados.

No existe tool genérica:

```text
sdd_put_record
```

---

## 31. CLI

Puede envolver Application API para debug/admin.

Structured output y exit codes estables.

No contiene segunda implementación de reglas.

---

## 32. HTTP/REST

No forma parte de Block B mínimo.

Si se agrega después, debe ser transport real y no cambia Application API.

---

# Parte VIII — Testing contract

## 33. Baseline F6B

Los 22 casos del spike son baseline, no implementación.

Conservar al menos:

```text
ephemeral zero writes
frontier required
reserved fields rejected
exact recovery
refine preserves identity
closed mutation rejected
outcome/evidence required
blockers reject completed
closure removes continuity
receipt direct closed
complete=false preserved
memory unavailable propagates
```

Agregar:

```text
strict risk/rollback/open_questions schemas
validate before ID
collision retry
contract patch preserves omitted fields
contract null removes explicit field
unknown acceptance coverage reject
structured evidence required
fail evidence cannot close
evidence ref subject validation
spawn relation
dependency validation
Decision immutability
Evidence immutability
Knowledge search unsupported behavior
persisted-record corruption mapping
```

---

## 34. Gate

Block B no se considera completo mientras una capability documentada solo exista como
instrucción al LLM.

Debe existir código + test para todo command/query prometido al Runtime Projection/MCP.

No se agregan commands fuera de este documento durante implementación sin falsificar primero
una garantía congelada.
