# SDD V2 — Product Architecture

## 1. Estado

**Estado:** arquitectura congelada para completar la primera Alpha reconstruida.

Este documento es la autoridad **cross-layer** de SDD V2. Los contratos especializados:

```text
docs/change-model.md
docs/memory-contract.md
docs/semantic-api.md
```

detallan sus respectivas capas y no pueden contradecir esta arquitectura.

La reconstrucción no comienza de cero. Se conservan los resultados válidos ya obtenidos:

- una sola autoridad semántica durable;
- persistencia adaptativa `ephemeral | receipt | continuity`;
- Change con identidad `CHG-<ULID>`;
- lifecycle `open | closed`;
- continuity/frontier pequeña;
- recovery exacto;
- Memory Contract `put/get/list`;
- Engram 1.20.0 validado contra el modelo inicial;
- Changes independientes + handoff secuencial;
- spike F6B con invariantes de receipt/continuity/closure falsadas en memoria.

Lo que **no** se congela como producto es la implementación de
`experiments/semantic-api/`.

Regla:

> Una vez congelada una garantía, la implementación corrige bugs contra el contrato.
> No se abre otro horizonte arquitectónico durante Block B salvo que una prueba falsifique
> explícitamente una garantía congelada.

---

## 2. Objetivo

SDD V2 conserva las garantías intelectuales útiles de Spec-Driven Development:

- intención clara;
- scope explícito cuando aporta;
- acceptance observable;
- constraints;
- risks y edge cases materiales;
- open questions que realmente bloquean;
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

```text
scope control
≠
proposal.md obligatorio
```

```text
evidence-backed completion
≠
verify.md obligatorio
```

Minimalidad se aplica a mecanismos, no a garantías.

---

## 3. Responsabilidad propia de SDD

Los harnesses modernos ya poseen:

- repo navigation;
- edición;
- shell;
- test runners;
- browser/tools;
- subagents;
- permisos;
- skill discovery;
- contexto conversacional de sesión.

SDD no reconstruye esas capacidades.

SDD posee únicamente la semántica durable portable entre hosts:

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

## 4. V1 → V2: keep / adapt / remove

| Garantía / mecanismo | Decisión V2 | Motivo |
|---|---|---|
| Intent explícito | **KEEP** | Núcleo de Change. |
| Scope | **KEEP adaptive** | Solo cuando reduce drift. |
| Acceptance | **KEEP adaptive** | Condiciones observables. |
| Constraints | **KEEP adaptive** | Si cambian solución/recovery. |
| Risks | **KEEP adaptive** | Garantía sí; sección obligatoria no. |
| Edge cases | **KEEP adaptive** | Igual que risks. |
| Open questions | **KEEP material** | Solo si bloquean/cambian solución. |
| Decisions | **KEEP semantic record** | Decisiones materiales y costosas de redescubrir. |
| Evidence | **KEEP + strengthen** | Completion no depende de texto ceremonial. |
| Continuity | **KEEP smaller** | Change + actionable frontier. |
| Scope evolution | **KEEP** | Refinement/spawn/dependency en Alpha inicial. |
| Knowledge | **KEEP** | Reusable, separado de repo truth/skills. |
| proposal/spec/design/tasks obligatorios | **REMOVE** | El proyecto puede usarlos; SDD no los exige. |
| Phase graph | **REMOVE** | El host ejecuta. |
| WorkUnit obligatorio | **REMOVE** | Volvería solo con evidencia. |
| Router `direct|compact|full` | **REMOVE as core** | Profundidad adaptativa sin enum obligatoria. |
| Session lifecycle | **REMOVE** | No es autoridad durable SDD. |
| `.sdd/state.json` canónico | **REMOVE** | Evita doble autoridad. |
| Roadmap/timeline como state | **REMOVE** | Son proyecciones. |
| Migration Alpha.1 | **DEFER** | No crear deuda antes de baseline estable. |

---

## 5. Persistencia adaptativa

No existe una llamada SDD obligatoria por request.

### Ephemeral

```text
request
-> ACT
-> verify proporcional
-> fin
```

Durable writes SDD:

```text
0
```

### Receipt

Trabajo material completado en la ejecución actual:

```text
request
-> ACT
-> verify
-> createReceipt
```

Receipt es un Change cerrado directamente; no inventa lifecycle previo.

### Continuity

Trabajo/intención que debe sobrevivir:

```text
openChange
-> ACT
-> setFrontier cuando haga falta persistir handoff
-> restart/new agent
-> getChange
-> inspección dirigida
-> ACT
-> closeChange
```

No se actualiza el Change después de cada tool call.

---

## 6. Arquitectura de capas

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
                  /      |       \
                 /       |        \
             Change   Decision   Evidence/Knowledge
                 \       |        /
                  \      |       /
                    Domain Model
                          |
                          v
                     Memory Port
                          |
                +---------+---------+
                |                   |
          Engram Repository     Other Repository
```

Side channels del host:

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
HTTP/REST si aparece un consumidor real
```

Transport y dominio son responsabilidades distintas.

---

## 7. Domain Model

Primera Alpha:

```text
Change
Decision
Evidence
Knowledge
```

No hay WorkUnit en core.

Change conserva intent, lifecycle, contract adaptativo, continuity, relations y closure.
Decision conserva elecciones materiales.
Evidence estructura observaciones que soportan completion.
Knowledge conserva hechos reutilizables.

Los schemas exactos viven en `docs/change-model.md`.

---

## 8. Scope evolution

Primera Alpha implementa:

```text
refineChange
spawnChange
addDependency
```

`spawnChange` crea un child con `spawned_from` sin mutar origin.

`addDependency` persiste solo `depends_on`; nunca el inverso `blocks`.

`split` y `supersede` permanecen en el modelo, pero no se exponen como operación compuesta
hasta definir partial-failure semantics multi-record.

---

## 9. SDD Application API

Commands y queries semánticas; no JSON Patch.

Queries:

```text
getChange
listOpenChanges
getDecision
getEvidence
searchKnowledge (optional)
```

Commands:

```text
openChange
createReceipt
refineChange
setFrontier
spawnChange
addDependency
closeChange
recordDecision
recordEvidence
promoteKnowledge
```

No existe:

```text
putRecord(arbitraryJson)
patchRecord(path, value)
setLifecycle
setProject
setKind
```

El contrato detallado vive en `docs/semantic-api.md`.

---

## 10. Reglas de ingeniería

### Transport-free

Application API no conoce HTTP, MCP JSON-RPC, CLI argv ni Engram physical IDs.

### Project-bound

Una instancia queda ligada a `project_id`.

### Validate before side effects

```text
validate
-> semantic preconditions
-> allocate id
-> collision preflight
-> persist
```

Input inválido produce cero IDs consumidos y cero writes.

### Strict schemas

Todo campo aceptado tiene schema.

### Contract refinement explícito

Omitted = preserve; value = replace esa sección; null = remove; array vacío = normalize absent.

No se reemplaza contract completo implícitamente.

### Exact acceptance coverage

```text
missing acceptance -> reject
unknown acceptance -> reject
```

### ID collision

```text
generate
-> exact get
-> not_found => create
-> exists => regenerate
```

No es reserva atómica.

### Immutability

Decision/Evidence independientes no se actualizan silenciosamente.

### Error taxonomy

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

---

## 11. Evidence

Completion durable usa evidence estructurada:

```yaml
method: test | build | lint | runtime | inspection | diff | external | other
result: pass | fail | observed
summary: ...
covers: [A1]
source: optional
```

`fail` nunca soporta completion.

Coverage debe corresponder exactamente a acceptance existente.

Evidence independiente se usa cuando necesita identidad/auditoría/reuse.

---

## 12. Memory Port

Contrato ya validado:

```text
put
get
list
search optional
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

Application API controla semántica. Memory Port controla durability/exactness/isolation.

---

## 13. Engram Repository

F5 ya probó mediante superficie pública:

```text
put/get
sequential update
fresh-instance recovery
exact identity
bounded list
project isolation
lost POST/PATCH reconciliation
unavailable
cleanup
```

Product implementation encapsula transport, physical codec, serialization, exactness,
reconciliation y error mapping.

No se copia el spike como producto.

---

## 14. Concurrencia

Soportado:

```text
independent Changes
sequential handoff same Change
```

No soportado:

```text
same-Change concurrent writers
```

No CAS/locks/LWW falsos.

---

## 15. Exposure

### Library

Composición interna canónica.

### MCP

Primer transport objetivo para agentes.

### CLI

Fallback/admin/debug con structured I/O.

### HTTP/REST

Fuera del mínimo actual.

Solo entra con consumidor real y entonces se diseña como REST de verdad: resources, methods,
status codes, idempotency, pagination, error representation, versioning, OpenAPI y auth.

---

## 16. Host Adapter

Primer target:

```text
Codex
```

Responsabilidad: bootstrap, project binding, transport configuration y capability projection.

No contiene Domain rules ni Engram mapping.

---

## 17. Runtime Projection

Solo instrucciones pequeñas sobre capabilities implementadas:

1. ephemeral no requiere SDD;
2. material completed puede dejar receipt;
3. pending/handoff usa continuity;
4. scope/acceptance/risks solo cuando cambian la acción;
5. known recovery = exact get -> directed inspection -> ACT;
6. completion durable = structured evidence;
7. nuevo scope = spawn;
8. Decision material puede persistirse;
9. Knowledge recurrente puede promoverse;
10. same-Change concurrent writers no soportado.

---

## 18. Skills

Default:

```text
0 skills SDD obligatorias
```

Una skill solo entra con trigger claro y beneficio real de progressive disclosure.

---

## 19. Project binding

Conceptual:

```yaml
project_id: stable-id
memory:
  adapter: engram
  version: 1.20.0
transport:
  preferred: mcp
```

No contiene current Change ni segunda autoridad.

---

## 20. Arquitectura de código productivo

```text
src/
├── domain/
├── application/
├── ports/
├── adapters/engram/
├── transports/mcp/
└── hosts/codex/

tests/
├── domain/
├── application/
├── memory-contract/
├── engram-integration/
├── transport-contract/
└── conformance/
```

Separar por responsabilidad arquitectónica, no por deseo de multiplicar archivos.

---

## 21. Reutilización de spikes

Engram spike: reusar mapping, endpoint audit, edge cases y conformance scenarios.

Semantic API spike: reusar invariantes 22/22 y casos negativos.

No promover archivos experimentales directamente.

Findings posteriores al PASS ya absorbidos en los contratos:

- schema holes;
- dynamic `this`;
- test helpers mezclados;
- ID antes de validation;
- unknown coverage;
- contract replacement permisivo;
- collision preflight faltante.

---

## 22. Testing strategy

Domain:

```text
schemas
lifecycle
contract
evidence
relations
IDs
close rules
```

Application:

```text
commands/queries
project binding
collision retry
coverage
immutability
error translation
```

Memory Contract: misma suite contra repositories.

Engram: F5 + restart/new process + hard failures.

MCP: schemas, mapping, structured errors, cero backend leakage.

Conformance:

```text
ephemeral
receipt
continuity
recovery
spawn
dependency
decision
evidence-backed close
knowledge promotion
independent Changes
```

---

## 23. Gate pre-dogfood

Structural:

```text
one durable authority
exact recovery
real Engram repository
no side-state authority
structured completion evidence
scope evolution implementada
Decision/Evidence/Knowledge sin arbitrary JSON
declared concurrency
runtime promete solo implemented capabilities
no unjustified skills
```

Quality:

| Área | Gate |
|---|---:|
| Code readability | 8/10 |
| Local simplicity | 8/10 |
| Architecture fidelity | 8.5/10 |
| State correctness | 9/10 |
| Durability/continuity | 8.5/10 |
| Multi-agent/worktree | 8/10 |
| Product maturity | 7.5/10 |

Ningún área <7.

---

## 24. Trabajo restante

### Block A — Contract alignment

**DONE con esta entrega.**

### Block B — Product implementation

**NEXT.**

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

### Block C — Product gate

Después de Block B:

```text
test suites
real Engram
MCP contract
conformance
static/code architecture review
```

Luego:

```text
fresh-chat independent audit
-> GO / NO-GO
-> DOGFOOD
```

No se crean más frontiers conceptuales salvo falsificación de una garantía central.

---

## 25. Estado

```text
Architecture ownership              DONE
Memory Contract                     DONE
Engram backend fit                  DONE
Domain Model                        DONE
Application API contract            DONE
Architecture / contract freeze      DONE

Product implementation              NEXT
Pre-dogfood gate                    PENDING
Fresh independent audit             PENDING
DOGFOOD                             PENDING
```

---

## 26. Regla final

> SDD V2 implementa la mínima maquinaria que preserve de forma ejecutable las garantías
> que evitan pérdida de intención, scope drift, decisiones olvidadas, continuidad rota
> y completion sin evidencia.

Minimalidad se aplica a mecanismos.

No a garantías.
