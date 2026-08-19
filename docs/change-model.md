# SDD V2 — Domain Model

## 1. Propósito

Este documento define el modelo semántico durable de la primera Alpha:

```text
Change
Decision
Evidence
Knowledge
```

No define transport, Engram, MCP, CLI ni filesystem.

Autoridad cross-layer:

```text
docs/rebaseline-architecture.md
```

Persistencia física:

```text
docs/memory-contract.md
```

Casos de uso:

```text
docs/semantic-api.md
```

---

## 2. Principios

### D1 — Garantía antes que artefacto

Scope, acceptance, risk, evidence y decision existen porque reducen riesgo o pérdida de
contexto; no porque una plantilla los enumera.

### D2 — Densidad adaptativa

No se persisten campos vacíos.

### D3 — Identidad estable

Todos los records independientes usan IDs collision-resistant sin allocator central:

```text
CHG-<ULID>
DEC-<ULID>
EVD-<ULID>
KNW-<ULID>
```

### D4 — Backend independence

Ningún payload contiene:

```text
Engram observation id
topic_key
revision_count
MCP tool name
HTTP URL
SQLite row id
Codex session id
```

### D5 — Repo truth permanece en repo

SDD conserva semántica y conocimiento necesario para continuidad; no duplica código,
schema o documentación que puede inspeccionarse de forma dirigida.

---

# Parte I — Change

## 3. Qué es un Change

Un Change representa una **intención durable**.

Existe cuando:

```text
receipt
o
continuity
```

Un trabajo ephemeral puede terminar sin Change.

Change no es:

- sesión;
- conversación;
- task list;
- branch;
- WorkUnit;
- proposal;
- changelog.

---

## 4. Identidad

Formato:

```text
CHG-<ULID>
```

Propiedades:

- estable;
- host-independent;
- backend-independent;
- sin contador central;
- seguro para creación de Changes independientes.

La Application API genera el ID.

Antes de crear:

```text
generate
-> exact get candidate
-> if exists: regenerate
-> if not_found: persist
```

No se presenta como atomic reservation ni como protección para same-Change multiwriter.

Title puede cambiar sin cambiar identidad.

---

## 5. Lifecycle

Canónico:

```text
open
closed
```

No son lifecycle states:

```text
planning
implementing
blocked
verifying
review
ready
archived
```

### Open

Todavía existe trabajo/decisión pendiente bajo esa intención.

### Closed

No queda frontier ejecutable bajo esa identidad.

Todo closed tiene `close.reason`:

```text
completed
cancelled
superseded
split
```

La primera Application API productiva automatiza únicamente:

```text
completed
cancelled
```

`superseded/split` permanecen semánticamente válidos, pero no se ejecutan mediante
operación multi-record automática todavía.

---

## 6. Forma lógica

Mínimo:

```yaml
id: CHG-01...
title: ...
intent: ...
lifecycle: open
```

Forma rica posible:

```yaml
id: CHG-01...
title: Estado del ticket desde detalle
intent: >
  Permitir alternar open/closed desde detalle sin introducir
  estados adicionales.
lifecycle: open

contract:
  scope:
    in:
      - edición del estado desde detalle
    out:
      - nuevos estados
  acceptance:
    - id: A1
      condition: solo open y closed son aceptados
    - id: A2
      condition: el estado persiste y se vuelve a mostrar
  constraints:
    - preservar contrato público actual
  risks:
    - clientes existentes podrían enviar valores legacy
  edge_cases:
    - update idempotente al mismo estado
  open_questions:
    - confirmar si el endpoint actual ya valida autorización
  rollback:
    strategy: revert
    note: retirar control UI y conservar endpoint anterior

continuity:
  completed:
    - endpoint actual localizado
  next: agregar control en detalle usando el endpoint existente
  blockers: []

relations:
  spawned_from: CHG-...
  depends_on:
    - CHG-...
```

No es una plantilla obligatoria.

---

## 7. Intent

Siempre requerido.

Debe expresar el cambio observable y distinguir éxito.

Malo:

```text
"tickets"
"arreglar estados"
```

Demasiado procedural:

```text
"editar controller, luego route, luego Blade"
```

Preferido:

```text
"Permitir alternar open/closed desde detalle sin introducir estados nuevos."
```

HOW local pertenece al executor/repo salvo constraint material.

---

## 8. Contract adaptativo

### 8.1 Scope

```yaml
scope:
  in: [...]
  out: [...]
```

`out` contiene no-objetivos que realmente previenen drift.

### 8.2 Acceptance

```yaml
acceptance:
  - id: A1
    condition: pending es rechazado
```

Reglas:

- ID único dentro del Change;
- condition no vacía;
- observable;
- no tautológica.

### 8.3 Constraints

Array de restricciones materiales.

### 8.4 Risks

Array de riesgos que cambian solución/verification/rollback.

### 8.5 Edge cases

Array de casos límite materiales.

### 8.6 Open questions

Array de preguntas todavía no resueltas que bloquean o pueden cambiar el diseño.

Si dejan de ser materiales, se remueven del snapshot vigente.

### 8.7 Rollback

Objeto opcional:

```yaml
rollback:
  strategy: revert | disable | migrate_back | manual | other
  note: ...
```

`note` requerido.

No se persiste rollback por cambios triviales.

---

## 9. Contract refinement

Refinement modifica la misma intención.

Semántica del patch:

```text
campo omitido -> preservar
valor válido   -> reemplazar esa sección
null           -> remover sección opcional
array []       -> normalizar a sección ausente
```

Refinement puede:

- cambiar title;
- precisar intent sin cambiar objetivo material;
- reducir/modificar scope;
- reemplazar acceptance deliberadamente;
- agregar/remover constraints, risks, edge cases u open questions;
- agregar/remover rollback.

No puede cambiar:

```text
id
project_id
kind
lifecycle
relations
close
continuity
```

Cambiar objetivo material requiere otro Change.

---

## 10. Continuity

Solo en Change `open` cuando el trabajo debe sobrevivir.

```yaml
continuity:
  completed:
    - hechos confirmados que evitan repetir trabajo
  next: acción concreta y segura
  blockers:
    - bloqueo real
```

### `next`

Obligatorio para continuity.

Debe permitir:

```text
get Change
-> inspección dirigida
-> ACT
```

No es roadmap ni plan completo.

### `completed`

Resumen compacto de hechos confirmados.

No changelog.

### `blockers`

Hechos que impiden ejecutar/terminar con seguridad.

`blocked` es derivado; no lifecycle.

---

## 11. Handoff

Antes de entregar un Change abierto:

```text
intent vigente
+ contract material
+ continuity.next
+ blockers relevantes
```

deben estar confirmados durablemente.

No SessionSummary obligatorio.

---

## 12. Scope evolution

### Refinement

Misma intención; actualiza el Change.

### Spawn

Nueva intención fuera del scope original:

```text
child.relations.spawned_from = origin
```

El origin no necesita mutarse.

### Dependency

```text
change.relations.depends_on = [target]
```

No se persiste `blocks`.

### Split / supersede

Reconocidos por el modelo:

```text
split_from
supersedes
```

pero no automatizados por la primera Application API por requerir coordinación
multi-record con partial-failure semantics.

---

## 13. Closure

### completed

Precondiciones:

1. outcome responde al intent;
2. no queda frontier bajo ese Change;
3. no hay blockers activos;
4. acceptance explícita está cubierta;
5. coverage no contiene acceptance IDs inexistentes;
6. existe evidence estructurada suficiente;
7. ningún Evidence usado como soporte tiene `result=fail`;
8. el Change cerrado puede persistirse.

Efecto:

```text
lifecycle = closed
close.reason = completed
continuity = removed
```

No queda frontier stale.

### cancelled

No requiere evidence de cumplimiento.

```text
lifecycle = closed
close.reason = cancelled
continuity = removed
```

Puede persistir rationale.

### superseded / split

Semántica válida de modelo; operación productiva automática diferida.

---

## 14. Receipt

Receipt no es entidad separada.

Es Change `closed/completed` creado directamente al final.

```yaml
id: CHG-...
title: ...
intent: ...
lifecycle: closed

close:
  reason: completed
  outcome: ...
  evidence:
    - method: test
      result: pass
      summary: ...
```

No inventa continuity, planning history ni WorkUnit.

---

# Parte II — Evidence

## 15. Evidence

Evidence soporta una afirmación observable.

Forma embebida:

```yaml
method: test
result: pass
summary: >
  Feature tests cubren open/closed y persistencia.
covers: [A1, A2]
source:
  command: php artisan test --filter TicketStateTest
```

### 15.1 Method

Enum:

```text
test
build
lint
runtime
inspection
diff
external
other
```

### 15.2 Result

```text
pass
fail
observed
```

`pass` soporta checks binarios.

`observed` soporta una observación verificable que no es naturalmente pass/fail.

`fail` puede persistirse como evidencia diagnóstica, pero nunca justifica completion.

### 15.3 Summary

Siempre requerido.

Describe qué fue observado, no solo:

```text
done
works
verified
```

### 15.4 Coverage

`covers` referencia IDs de acceptance del Change sujeto.

Reglas:

```text
missing required id -> closure reject
unknown id          -> closure reject
duplicate id        -> normalize to one id
```

### 15.5 Source

Opcional:

```yaml
source:
  command: ...
  reference: ...
```

---

## 16. Evidence record independiente

Se crea cuando:

- necesita identidad/auditoría;
- varios criterios la referencian;
- tiene metadata útil separada;
- debe sobrevivir más allá del cierre embebido.

Envelope:

```yaml
kind: evidence
id: EVD-<ULID>
subject_id: CHG-...
payload:
  method: ...
  result: ...
  summary: ...
  covers: [...]
  source: ...
```

Evidence independiente es inmutable.

---

# Parte III — Decision

## 17. Decision

Record independiente:

```yaml
kind: decision
id: DEC-<ULID>
subject_id: CHG-... | optional
payload:
  statement: ...
  rationale: ...
  supersedes: DEC-... | optional
```

`statement` y `rationale` son obligatorios.

Decision separada se justifica cuando:

- afecta arquitectura/contrato/seguridad;
- tiene trade-offs;
- su historia importa;
- otro actor debe recuperarla;
- redescubrirla sería costoso/riesgoso.

No registrar decisiones rutinarias locales.

Decision es inmutable; una nueva Decision puede superseder otra.

---

# Parte IV — Knowledge

## 18. Knowledge

```yaml
kind: knowledge
id: KNW-<ULID>
payload:
  statement: ...
  source_refs: optional
```

Knowledge contiene un hecho reusable.

Ejemplos:

```text
"El proyecto usa tag_ticket como pivot."
"En este entorno Playwright falla con EPERM bajo condición X."
```

No promover automáticamente:

- stdout;
- error único;
- workaround descartado;
- decisión específica sin reuse;
- contenido que el repo expresa claramente y puede inspeccionarse barato.

---

## 19. Relations y referencias

Referencias semánticas iniciales:

```text
Change -> spawned_from -> Change
Change -> depends_on   -> Change
Decision -> supersedes -> Decision
Evidence -> subject_id -> Change
Decision -> subject_id -> Change optional
```

No guardar inversos derivados.

No `related_to` genérico en core.

---

## 20. Concurrencia

Soportado:

```text
Changes independientes
handoff secuencial del mismo Change
```

No soportado:

```text
same-Change concurrent writers
```

Domain Model no contiene locks/version tokens que simulen otra garantía.

---

## 21. Invariantes falsables

```text
D1  ephemeral no crea record obligatorio
D2  IDs no requieren allocator
D3  title cambia sin cambiar identity
D4  Change durable siempre tiene intent
D5  open continuity siempre tiene actionable next
D6  closed nunca contiene continuity
D7  completed exige structured evidence
D8  explicit acceptance exige exact coverage
D9  fail evidence no soporta completed
D10 new intent no entra mediante refine
D11 spawn crea nueva identity
D12 dependency no duplica blocks
D13 Decision independiente es inmutable
D14 Evidence independiente es inmutable
D15 Knowledge no duplica repo truth por defecto
D16 payload no contiene conceptos físicos del backend
D17 same-Change concurrent mutation no se presenta como safe
```

---

## 22. Fuera de la primera Alpha

```text
WorkUnit
Progress record
SessionSummary
event stream
same-Change merge
CAS
automatic split transaction
automatic supersede transaction
persisted blocks inverse
generic related_to
roadmap state
```

Pueden volver solo con evidencia.

---

## 23. Gate

Este modelo está cerrado para Block B.

Una implementación que necesite ampliar este schema durante Block B debe primero demostrar que
una garantía congelada no puede implementarse sin esa ampliación.
