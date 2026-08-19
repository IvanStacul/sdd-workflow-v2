# SDD V2 — Product Architecture

## 1. Estado

**Estado:** arquitectura candidata congelada para completar la primera Alpha reconstruida.

Este documento es la autoridad **cross-layer** de SDD V2. Los contratos especializados
(`memory-contract.md`, `change-model.md`, `semantic-api.md`) detallan sus respectivas capas
y no pueden contradecir esta arquitectura.

La reconstrucción no comienza de cero.

Se conservan los resultados válidos obtenidos hasta ahora:

- ownership y una sola autoridad semántica;
- persistencia adaptativa `ephemeral | receipt | continuity`;
- Change con identidad `CHG-<ULID>`;
- lifecycle `open | closed`;
- continuity/frontier pequeña;
- recovery exacto;
- Memory Contract `put/get/list`;
- Engram 1.20.0 validado como backend conformante para el modelo inicial;
- concurrencia declarada: Changes independientes + handoff secuencial;
- F6B: invariantes mecánicas de Change/receipt/closure falsadas en memoria.

Lo que **no** se congela como producto es la implementación experimental actual de
`experiments/semantic-api/`.

Regla a partir de este documento:

> Una vez cerrada una decisión aquí, la implementación posterior corrige bugs contra el
> contrato. No se abre otro horizonte arquitectónico durante implementación salvo que una
> prueba falsifique explícitamente una garantía congelada.

---

## 2. Objetivo del producto

SDD V2 conserva las garantías intelectuales útiles del Spec-Driven Development:

- intención clara;
- scope explícito cuando aporta;
- acceptance observable;
- constraints;
- risks y edge cases materiales;
- decisiones durables;
- evidencia verificable;
- continuidad entre sesiones/agentes;
- scope evolution explícita;
- conocimiento reusable;
- cierre justificable;

sin imponer por defecto:

- proposal;
- spec;
- design;
- tasks;
- verify document;
- archive document;
- phase graph;
- WorkUnit persistente;
- session summary;
- roadmap materializado;
- una skill por concepto.

La unidad de diseño es una **garantía**, no un artefacto.

Ejemplo:

```text
garantía: scope control
≠
mecanismo obligatorio: proposal.md
```

```text
garantía: evidence-backed completion
≠
mecanismo obligatorio: verify.md
```

---

## 3. Problema que SDD posee

Los harnesses modernos ya poseen:

- repo navigation;
- edición;
- shell;
- test runners;
- tool invocation;
- subagents;
- permisos;
- skill discovery;
- contexto conversacional de sesión.

SDD no reconstruye esas capacidades.

SDD posee únicamente la semántica durable que debe ser portable entre hosts:

1. cuándo una intención merece estado durable;
2. qué significa un Change;
3. cómo se preservan scope/acceptance/constraints materiales;
4. cómo se conserva una frontier para handoff;
5. qué decisiones necesitan sobrevivir;
6. qué evidencia soporta una afirmación de cumplimiento;
7. cómo evoluciona scope sin drift silencioso;
8. qué conocimiento se vuelve reusable;
9. cómo se recupera estado conocido;
10. cuándo un Change puede cerrarse.

---

## 4. Garantías de V1: keep / change / remove

| Garantía / mecanismo | Decisión V2 | Motivo |
|---|---|---|
| Intent explícito | **KEEP** | Es el núcleo del Change. |
| Scope | **KEEP adaptive** | Solo cuando reduce drift/ambigüedad. |
| Acceptance | **KEEP adaptive** | Condiciones observables, no checklist automática. |
| Constraints | **KEEP adaptive** | Deben sobrevivir si cambian solución/recovery. |
| Risks | **KEEP adaptive** | Se conserva la garantía, no la sección obligatoria. |
| Edge cases | **KEEP adaptive** | Igual que risks. |
| Open questions | **KEEP only if blocking/material** | No lista ceremonial. |
| Decisions | **KEEP semantic record** | Solo decisiones materiales y costosas de redescubrir. |
| Evidence | **KEEP + strengthen** | Completion no puede depender de texto arbitrario. |
| Continuity | **KEEP, smaller** | Change + actionable frontier; sin SessionSummary obligatorio. |
| Scope evolution | **KEEP** | Spawn/dependency ahora; split/supersede con operación segura posterior. |
| Knowledge reusable | **KEEP** | Separado de skills y repo truth. |
| Proposal/spec/design/tasks files | **REMOVE mandatory** | Pueden existir por necesidad del proyecto, no por SDD. |
| Phase graph | **REMOVE** | El host ejecuta; SDD no orquesta fases artificiales. |
| WorkUnit obligatorio | **REMOVE** | Solo volvería por evidencia real. |
| Router direct/compact/full | **REMOVE as core** | Persistencia y profundidad son adaptativas sin route enum obligatoria. |
| Session lifecycle | **REMOVE as SDD primitive** | El host/session no es autoridad durable. |
| Local state authority | **REMOVE** | Memory Contract es la única puerta durable. |
| Roadmap como state | **REMOVE** | Proyección derivada de Changes/relations. |
| Migration Alpha.1 | **DEFER** | No hay baseline estable que merezca deuda de migración. |

---

## 5. Persistencia adaptativa

No existe una llamada SDD obligatoria por request.

### Ephemeral

```text
request
-> host actúa
-> verify proporcional
-> fin
```

SDD durable writes:

```text
0
```

### Receipt

Trabajo material completado en la misma ejecución:

```text
request
-> ACT
-> verify
-> createReceipt
```

Un receipt es un Change cerrado directamente. No inventa lifecycle previo.

### Continuity

Trabajo/intención que debe sobrevivir:

```text
openChange
-> ACT
-> persistir frontier cuando sea necesario
-> handoff/restart
-> getChange
-> inspección dirigida
-> ACT
-> close
```

No se actualiza el Change después de cada tool call.

---

## 6. Arquitectura definitiva de capas

```text
                         User
                          |
                          v
                 Host Agent / Harness
            Codex / OpenCode / VS Code / ...
                          |
                tiny host bootstrap
                          |
                          v
                 Runtime Projection
              (small, implemented rules)
                          |
                          v
               SDD Application API
              (semantic, transport-free)
                 /       |       \
                /        |        \
          Changes    Decisions   Evidence/Knowledge
                \        |        /
                 \       |       /
                    Domain Model
                          |
                          v
                     Memory Port
                          |
                +---------+---------+
                |                   |
          Engram Repository     Other Repository
                |
           Engram 1.20+
```

Side channels owned by host:

```text
repo search
shell/tests
browser
subagents
project skills
context providers
```

### Terminología

**SDD Application API** es la frontera programática de casos de uso.

No significa REST.

Puede exponerse mediante:

```text
library
MCP
CLI structured
HTTP/REST (solo si aparece un consumidor real)
```

Los transports no contienen reglas de dominio.

---

## 7. Domain Model

La primera Alpha tiene cuatro tipos de record lógico:

```text
Change
Decision
Evidence
Knowledge
```

`WorkUnit` no pertenece al core inicial.

### 7.1 Change

Representa una intención durable y su estado vigente.

Mínimo:

```yaml
id: CHG-<ULID>
title: ...
intent: ...
lifecycle: open | closed
```

Contenido adaptativo:

```yaml
contract:
  scope:
    in: [...]
    out: [...]
  acceptance:
    - id: A1
      condition: ...
  constraints: [...]
  risks: [...]
  edge_cases: [...]
  open_questions: [...]
  rollback: ...

continuity:
  completed: [...]
  next: ...
  blockers: [...]

relations:
  spawned_from: CHG-...
  depends_on: [...]
  split_from: CHG-...
  supersedes: CHG-...

close:
  reason: completed | cancelled | superseded | split
  outcome: ...
  evidence_refs: [...]
  evidence_summary: ...
```

No se materializan campos vacíos.

### 7.2 Decision

Decision separada cuando la elección:

- afecta arquitectura/contrato público/seguridad;
- tiene trade-offs materiales;
- sería costoso redescubrirla;
- otro actor necesita conocerla;
- su supersession importa.

Forma lógica:

```yaml
id: DEC-<ULID>
subject_id: CHG-... | optional
statement: ...
rationale: ...
supersedes: DEC-... | optional
```

Una Decision no es un log de todas las elecciones locales.

### 7.3 Evidence

Evidence es una observación que soporta una afirmación.

La primera Alpha usa un modelo estructurado pequeño:

```yaml
id: EVD-<ULID>          # solo si es record independiente
subject_id: CHG-...

method: test | build | lint | runtime | inspection | diff | external | other
result: pass | fail | observed
summary: ...

covers:
  - A1

source:
  command: optional
  reference: optional
```

Reglas:

- `summary` solo no basta para completion material si no existe `method + result`;
- `covers` solo referencia acceptance IDs existentes;
- evidence embebida puede usar la misma estructura sin `id`;
- un record separado se crea cuando necesita identidad, auditoría, reuse o metadata propia;
- el host produce la observación real; SDD valida su estructura y relación con acceptance.

### 7.4 Knowledge

Knowledge es un hecho reusable del proyecto, no una instrucción procedural.

Forma lógica mínima:

```yaml
id: KNW-<ULID>
statement: ...
scope: project
source_refs: optional
```

Ejemplos:

```text
"El build de Tailwind en Windows falla con EPERM cuando X."
"Este proyecto usa tag_ticket como nombre de pivot."
```

No promover stdout incidental o workarounds descartados.

---

## 8. Change Contract adaptativo

La riqueza del modelo no implica una plantilla obligatoria.

### Intent

Siempre obligatorio.

Debe describir el cambio observable, no una secuencia de archivos.

### Scope

Aparece cuando evita drift.

### Acceptance

Aparece cuando `intent` no basta para saber objetivamente si se cumplió.

Cada acceptance tiene ID local:

```text
A1
A2
...
```

### Constraints

Solo restricciones materiales.

### Risks / edge cases

Se agregan cuando cambian:

- la solución;
- verification;
- rollback;
- decisión humana;
- próxima frontier.

### Open questions

Solo questions que bloquean o pueden cambiar materialmente la implementación.

### Rollback

Solo si el riesgo de despliegue/cambio justifica describirlo.

---

## 9. Scope evolution

SDD debe evitar scope drift silencioso sin crear un workflow graph pesado.

### Refinement

Misma intención:

```text
clarificar wording
reducir scope
precisar acceptance
agregar constraint
registrar edge case coherente
```

Actualiza el mismo Change.

### Spawn

Nueva intención descubierta durante el Change original.

Primera Alpha sí soporta:

```text
spawnChange(origin, new intent)
```

Semántica segura:

```text
crear child con spawned_from=origin
```

No requiere cerrar/mutar el origin.

### Dependency

Primera Alpha sí soporta:

```text
addDependency(change, target)
```

Solo guarda:

```text
depends_on
```

No duplica `blocks`.

### Split

El modelo reconoce split, pero la primera Alpha no ofrece operación automática hasta definir
failure recovery multi-record.

### Supersede

Igual: el modelo reconoce la relación, pero no se promete operación compuesta hasta poder
manejar creación + cierre parcial de forma explícita.

El Runtime Projection no instruye `split/supersede` como capability automática mientras no
exista esa operación.

---

## 10. SDD Application API

La API usa **commands y queries semánticas**, no JSON Patch.

### Queries

```text
getChange(id)
listOpenChanges(options?)
getDecision(id)
getEvidence(id)
searchKnowledge(query)        optional discovery capability
```

### Change commands

```text
openChange(input)
createReceipt(input)
refineChange(id, refinement)
setFrontier(id, frontier)
spawnChange(originId, input)
addDependency(id, targetId)
closeChange(id, closeInput)
```

`closeChange` inicial soporta:

```text
completed
cancelled
```

`superseded/split` existen en Domain Model pero no se exponen como operación compuesta todavía.

### Related-record commands

```text
recordDecision(input)
recordEvidence(input)
promoteKnowledge(input)
```

No existe:

```text
putRecord(arbitraryJson)
patchRecord(path, value)
setLifecycle(...)
setProject(...)
setKind(...)
```

### Por qué comandos explícitos

La API debe impedir que el agente tenga que recordar:

- campos reservados;
- lifecycle transitions;
- relación evidence/acceptance;
- immutability de Decision/Evidence;
- project binding;
- record envelope;
- error mapping.

---

## 11. Reglas de ingeniería de la Application API

### 11.1 Transport-agnostic

No conoce:

```text
HTTP
REST
MCP JSON-RPC
CLI argv
docker exec
Engram observation id
```

### 11.2 Project-bound

Una instancia queda ligada a `project_id`.

Las mutations no reciben project arbitrario.

### 11.3 Command/query separation

Queries no mutan.

Commands expresan intención de dominio.

### 11.4 Validate before side effects

Secuencia:

```text
validate input
-> validate semantic preconditions
-> allocate id si hace falta
-> persist
```

Inputs inválidos no consumen identidad ni producen writes.

### 11.5 No receiver coupling accidental

Los casos de uso no dependen de `this` dinámico.

La composición se hace por closures/services explícitos.

### 11.6 Strict schemas

Todo campo aceptado tiene schema.

No se acepta un key porque aparezca en un `allowedKeys` si después no se valida su estructura.

### 11.7 Exact acceptance coverage

Si acceptance = `[A1, A2]`:

```text
covers [A1]       -> reject incomplete
covers [A1,A2]    -> valid
covers [A1,A2,A9] -> reject unknown
```

### 11.8 Identity collision handling

Para record nuevo:

```text
generate collision-resistant id
-> exact get candidate
-> not_found => put
-> exists => regenerate
```

No se presenta como atomic reservation.

### 11.9 Immutability

Decision/Evidence independientes:

```text
same id + same logical content
-> idempotent retry

same id + different logical content
-> invalid/conflict
```

### 11.10 Error taxonomy

Public application errors:

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

Backend details quedan como diagnostic cause.

---

## 12. Memory Port

Core ya validado:

```text
put(record)
get(ref)
list(selector)

search(text, filters) optional
```

Envelope:

```yaml
schema_version: 1
project_id: ...
kind: change | decision | evidence | knowledge
id: ...
subject_id: optional
payload: ...
```

La Application API controla semántica.

Memory Port controla durability/exactness.

---

## 13. Engram Repository

F5 ya demostró que Engram 1.20.0 puede cumplir el modelo inicial mediante superficie pública.

La implementación productiva debe encapsular:

```text
transport
physical identity codec
serialization
get/list exactness
write reconciliation
error normalization
```

No se promueve directamente el spike experimental.

### Garantías ya probadas

```text
put/get
sequential update
fresh-instance recovery
exact identity
bounded list
project isolation
lost POST reconciliation
lost PATCH reconciliation
unavailable
cleanup
```

### No prometido

```text
same-Change concurrent writers
CAS
cross-machine multiwriter
unbounded pagination
```

---

## 14. Concurrencia

Primera Alpha soporta:

```text
Agent A -> Change A
Agent B -> Change B
```

y:

```text
Agent A -> persist frontier -> termina
Agent B -> exact get -> continúa
```

No soporta:

```text
Agent A \
         > mutan Change X al mismo tiempo
Agent B /
```

Por tanto:

- no CAS core;
- no locks inventados;
- no LWW presentado como safe merge.

Si el host paraleliza, debe hacerlo sobre Changes independientes o mantener un writer canónico.

---

## 15. Exposure / transports

La Application API no obliga a un transport.

### Library

Es la forma de composición interna/canónica.

Útil para:

- tests;
- host adapters Node;
- CLI;
- MCP server.

### MCP

Es el **primer transport candidato para agentes** porque:

- Codex/OpenCode/harnesses modernos ya consumen tools;
- permite schemas estructurados;
- evita que el agente construya records físicos;
- puede proyectar solo operaciones SDD.

Tools candidatas:

```text
sdd_change_open
sdd_change_get
sdd_change_list
sdd_change_refine
sdd_change_frontier
sdd_change_spawn
sdd_change_dependency
sdd_change_close
sdd_decision_record
sdd_evidence_record
sdd_knowledge_promote
```

Los nombres finales se fijan durante implementación.

### CLI

Fallback/admin/debug:

```text
structured input/output
non-interactive by default
stable exit codes
```

No es la autoridad del dominio.

### HTTP/REST

**No pertenece al mínimo actual.**

Solo se agrega si aparece un consumidor que necesite un proceso/servicio HTTP.

Si se agrega, debe ser un transport real con:

- resources;
- HTTP methods;
- status codes;
- idempotency;
- pagination;
- error representation;
- versioning;
- OpenAPI;
- auth boundary.

No se llama REST a un wrapper accidental de funciones.

---

## 16. Host Adapter

Responsabilidad:

```text
bootstrap
project binding
configurar transport SDD
proyectar capabilities reales
conectar skills nativas si aportan
```

No contiene:

```text
Change validation
Evidence semantics
Engram physical mapping
```

Primer host target:

```text
Codex
```

OpenCode debe poder añadirse sin cambiar Domain/Application.

---

## 17. Runtime Projection

Runtime Projection es instrucciones, no implementación.

Solo menciona capabilities que existen en código.

Debe ser pequeña y expresar:

1. ephemeral no requiere SDD;
2. material completed => receipt si aporta trazabilidad;
3. pending/handoff => continuity;
4. scope/acceptance/risks se agregan solo cuando cambian la acción;
5. known Change recovery => exact get -> directed inspection -> ACT;
6. completion material => evidence estructurada;
7. scope nuevo => spawn, no drift silencioso;
8. decisiones materiales => Decision cuando necesitan sobrevivir;
9. knowledge recurrente => promotion;
10. same-Change concurrent writers no soportado.

No contiene un HOW procedural completo.

---

## 18. Skills

Default:

```text
0 skills SDD obligatorias
```

Una skill aparece únicamente si:

- la instrucción condicional es sustancial;
- always-loaded sería costoso;
- necesita scripts/resources;
- tiene trigger claro;
- puede evolucionar independientemente.

No se recrean cuatro skills de Alpha.1 por simetría.

---

## 19. Project binding

Proyecto consumidor necesita un binding mínimo.

Conceptualmente:

```yaml
project_id: stable-id

memory:
  adapter: engram
  version: 1.20.0

transport:
  preferred: mcp
```

No contiene:

```text
current Change
state history
roadmap authority
duplicate Change records
```

Formato físico se decide en implementación.

---

## 20. Versioning

Separar:

```text
package_version
record_schema_version
project_config_schema
```

No implementar migraciones hasta que exista una Alpha que supere el gate.

Los records actuales siguen:

```text
schema_version: 1
```

Cambiar schema requiere:

```text
explicit compatibility decision
tests
migration/read strategy
```

No cambio silencioso.

---

## 21. Arquitectura de código productivo

El spike monolítico no se promueve tal cual.

Estructura candidata:

```text
src/
├── domain/
│   ├── change.mjs
│   ├── decision.mjs
│   ├── evidence.mjs
│   ├── knowledge.mjs
│   ├── ids.mjs
│   └── errors.mjs
│
├── application/
│   ├── change-service.mjs
│   ├── decision-service.mjs
│   ├── evidence-service.mjs
│   └── knowledge-service.mjs
│
├── ports/
│   └── memory.mjs
│
├── adapters/
│   └── engram/
│       ├── transport.mjs
│       ├── codec.mjs
│       └── repository.mjs
│
├── transports/
│   └── mcp/
│       └── server.mjs
│
└── hosts/
    └── codex/
        └── bootstrap.mjs

tests/
├── domain/
├── application/
├── memory-contract/
├── engram-integration/
├── transport-contract/
└── conformance/
```

Esto es una guía de responsabilidades, no una obligación de un archivo por bullet.

Regla:

> separar por responsabilidad arquitectónica, no por deseo de multiplicar archivos.

---

## 22. Reutilización de los spikes

### Engram spike

No promover código directamente.

Reusar:

- mapping probado;
- endpoint audit;
- edge cases;
- tests/conformance scenarios.

### Semantic API spike

No promover `semantic-api.mjs` directamente.

Reusar:

- invariantes 22/22;
- casos negativos;
- receipt direct closed;
- closure/blocker behavior;
- completeness propagation;
- memory error normalization.

Los defects encontrados después del PASS se consideran inputs de ingeniería para la implementación limpia:

- schemas incompletos;
- `this` coupling;
- helpers de test mezclados;
- ID antes de validation;
- unknown acceptance coverage;
- contract replacement demasiado permisivo;
- collision preflight faltante.

No se parchea el spike para convertirlo gradualmente en producto.

---

## 23. Testing strategy

### Domain tests

Sin Memory:

- schemas;
- lifecycle;
- contract;
- evidence;
- relations;
- IDs;
- close rules.

### Application tests

Memory fake contract-compatible:

- commands/queries;
- project binding;
- collision retry;
- exact coverage;
- immutable related records;
- error translation.

### Memory contract tests

Una misma suite contra cada repository.

### Engram integration

Backend real:

- F5 scenarios;
- restart/new process;
- project isolation;
- hard failures.

### MCP transport contract

Verifica:

- schemas;
- command mapping;
- structured errors;
- no backend leakage.

### Conformance/evals

Escenarios de workflow:

```text
ephemeral
receipt
continuity
recovery
scope spawn
decision
evidence-backed close
knowledge promotion
independent Changes
```

---

## 24. Gate antes de dogfood

### Structural

Debe cumplirse:

```text
one durable authority
exact recovery
real Engram repository
no side-state authority
structured evidence for material completion
scope evolution operation realmente existente
Decision/Evidence/Knowledge no requieren arbitrary JSON
declared concurrency
runtime only promises implemented capabilities
no unjustified skills
```

### Quality

Objetivos mínimos:

| Área | Gate |
|---|---:|
| Code readability | 8/10 |
| Local simplicity | 8/10 |
| Architecture fidelity | 8.5/10 |
| State correctness | 9/10 |
| Durability/continuity | 8.5/10 |
| Multi-agent/worktree declared model | 8/10 |
| Product maturity | 7.5/10 |

No se compensa un área <7 con promedio.

---

## 25. Trabajo restante — cerrado

No se crean más frontiers conceptuales.

Quedan exactamente tres bloques.

### Block A — Contract alignment

Actualizar contra esta arquitectura:

```text
docs/change-model.md
docs/semantic-api.md
README.md
```

`memory-contract.md` solo se toca si la alineación descubre una contradicción real con
`put/get/list`; no se reabre por preferencia.

Resultado:

```text
design freeze
```

### Block B — Product implementation

Implementar de cero limpio usando evidencia de spikes:

```text
Domain
Application API
Memory Port
Engram Repository
MCP transport
Codex host/bootstrap
project binding
runtime projection
tests
```

No copiar el spike como núcleo.

### Block C — Product gate

Ejecutar:

```text
unit/domain tests
application tests
memory contract suite
real Engram integration
MCP transport contract
conformance scenarios
static/code architecture review
```

Después:

```text
external fresh-chat audit
-> go/no-go
-> dogfood
```

Si el fresh-chat audit rechaza el producto, corrige findings concretos contra esta arquitectura.
No vuelve a iniciar otra reconstrucción salvo falsificación de una garantía central.

---

## 26. Estado de milestones

```text
Architecture ownership              DONE
Memory Contract                     DONE
Engram backend fit                  DONE
Change Model                        ALIGN IN BLOCK A
Semantic behavior spike             DONE / evidence only

Architecture freeze                 THIS DOCUMENT
Contract alignment                  NEXT
Product implementation              PENDING
Pre-dogfood gate                    PENDING
Fresh independent audit             PENDING
DOGFOOD                             PENDING
```

---

## 27. Regla final

SDD V2 no busca ser el workflow con menos líneas ni el que preserva más artefactos.

Busca:

> **la mínima maquinaria que preserve de forma ejecutable las garantías de ingeniería que
> realmente evitan pérdida de intención, scope drift, decisiones olvidadas, continuidad
> rota y completion sin evidencia.**

Minimalidad se aplica a mecanismos.

No a garantías.
