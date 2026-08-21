# SDD V2 — Product Architecture

## 1. Estado

**Estado:** arquitectura congelada; implementación de producto completada; Block C pre-dogfood
es el siguiente y único gate interno.

Este documento es la autoridad **cross-layer** de SDD V2. Los contratos especializados:

```text
docs/change-model.md
docs/memory-contract.md
docs/semantic-api.md
```

detallan sus capas y no pueden contradecir esta arquitectura.

Resultados acumulados:

- una sola autoridad semántica durable;
- persistencia adaptativa `ephemeral | receipt | continuity`;
- Change `CHG-<ULID>` con lifecycle `open | closed`;
- continuity/frontier pequeña y actionable;
- recovery exacto;
- Memory Contract `put/get/list`, con `search` opcional;
- Engram 1.20.0 validado y adaptado mediante superficie pública;
- Application API tipada y transport-free;
- Decision/Evidence/Knowledge productivos;
- scope evolution mediante refinement/spawn/dependency;
- MCP transport productivo;
- Codex bootstrap productivo;
- binding mínimo y host-independent;
- Runtime Projection derivada de una sola fuente;
- suite automatizada de Domain/Application/Memory/Engram/MCP/host;
- integración real con Engram confirmada por el usuario.

Los spikes ya no constituyen producto ni autoridad.

Regla:

> Block C puede descubrir defects de implementación o falsificar garantías. No puede abrir un
> nuevo horizonte conceptual por preferencia. Un cambio arquitectónico exige evidencia de que
> una garantía congelada no puede sostenerse.

---

## 2. Objetivo

SDD V2 conserva las garantías útiles de Spec-Driven Development:

- intención clara;
- scope explícito cuando aporta;
- acceptance observable;
- constraints;
- risks y edge cases materiales;
- open questions realmente bloqueantes;
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
!=
proposal.md obligatorio
```

```text
evidence-backed completion
!=
verify.md obligatorio
```

Minimalidad se aplica a mecanismos, no a garantías.

---

## 3. Responsabilidad propia de SDD

Los harnesses poseen:

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

SDD posee la semántica durable portable entre hosts:

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

## 4. V1 -> V2: keep / adapt / remove

| Garantía / mecanismo | Decisión V2 | Motivo |
|---|---|---|
| Intent explícito | **KEEP** | Núcleo del Change. |
| Scope | **KEEP adaptive** | Solo cuando reduce drift. |
| Acceptance | **KEEP adaptive** | Condiciones observables. |
| Constraints | **KEEP adaptive** | Cuando cambian solución/recovery. |
| Risks | **KEEP adaptive** | Garantía sí; sección obligatoria no. |
| Edge cases | **KEEP adaptive** | Igual que risks. |
| Open questions | **KEEP material** | Solo si bloquean/cambian solución. |
| Decisions | **KEEP semantic record** | Decisiones materiales y costosas de redescubrir. |
| Evidence | **KEEP + strengthen** | Completion no depende de texto ceremonial. |
| Continuity | **KEEP smaller** | Change + actionable frontier. |
| Scope evolution | **KEEP** | Refinement/spawn/dependency implementados. |
| Knowledge | **KEEP** | Reusable, separado de repo truth/skills. |
| proposal/spec/design/tasks obligatorios | **REMOVE** | El proyecto puede usarlos; SDD no los exige. |
| Phase graph | **REMOVE** | El host ejecuta. |
| WorkUnit obligatorio | **REMOVE** | Solo volvería con evidencia. |
| Router `direct|compact|full` | **REMOVE as core** | Profundidad adaptativa sin enum obligatoria. |
| Session lifecycle SDD | **REMOVE** | No es autoridad durable. |
| `.sdd/state.json` canónico | **REMOVE** | Evita doble autoridad. |
| Roadmap/timeline como state | **REMOVE** | Son proyecciones. |
| Migration Alpha.1 | **DEFER** | No hay compatibilidad que preservar con baseline invalidada. |

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

Trabajo material completado en la ejecución actual cuando la trazabilidad durable aporta:

```text
request
-> ACT
-> verify real
-> createReceipt
```

Receipt es un Change `closed/completed` creado directamente.

### Continuity

Trabajo/intención que debe sobrevivir:

```text
openChange
-> ACT
-> setFrontier cuando haga falta
-> restart/new agent
-> getChange exacto
-> inspección dirigida
-> ACT
-> closeChange
```

No se persiste después de cada tool call.

---

## 6. Arquitectura implementada

```text
                         User
                          |
                          v
                 Host Agent / Harness
                          |
                 host bootstrap
                          |
                          v
                 Runtime Projection
                          |
                          v
                   MCP Transport
                          |
                          v
               SDD Application API
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
          Engram Repository     Future Repository
                |
                v
             Engram
```

Side channels siguen en el host:

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

Implementado:

```text
library
MCP
CLI bootstrap/admin
```

No implementado porque no existe necesidad demostrada:

```text
HTTP/REST
```

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

### Change

Representa intención durable.

Mínimo:

```yaml
id: CHG-<ULID>
title: ...
intent: ...
lifecycle: open | closed
```

Adaptativo:

```yaml
contract:
  scope:
  acceptance:
  constraints:
  risks:
  edge_cases:
  open_questions:
  rollback:

continuity:
  completed:
  next:
  blockers:

relations:
  spawned_from:
  depends_on:

close:
  reason:
  outcome:
  evidence:
  evidence_refs:
```

No se materializan campos vacíos.

### Decision

Elección durable material, con rationale y supersession explícita cuando importa.

### Evidence

Observación estructurada; puede quedar embebida en closure/receipt o existir como record
independiente.

### Knowledge

Hecho reusable del proyecto; no duplica rutinariamente repo truth.

Schemas exactos:

```text
docs/change-model.md
```

---

## 8. Scope evolution

Implementado:

```text
refineChange
spawnChange
addDependency
```

### Refinement

Misma intención material.

### Spawn

Nueva intención:

```text
child.spawned_from = origin
```

No muta origin.

### Dependency

Persiste:

```text
depends_on
```

No persiste el inverso `blocks`.

### Split / supersede

Reconocidos por Domain Model pero no automatizados hasta disponer de partial-failure semantics
multi-record.

---

## 9. Application API

Queries:

```text
getChange
listOpenChanges
getDecision
getEvidence
searchKnowledge
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
patchRecord(...)
setLifecycle(...)
setProject(...)
setKind(...)
```

Contrato exacto:

```text
docs/semantic-api.md
```

---

## 10. Reglas de ingeniería

### Transport-free

Application no conoce HTTP, MCP JSON-RPC, CLI argv ni Engram physical IDs.

### Project-bound

La instancia Application queda ligada a `project_id`.

### Validate before side effects

```text
validate
-> semantic preconditions
-> allocate ID
-> collision preflight
-> persist
```

Input inválido:

```text
0 IDs consumidos
0 writes
```

### Strict schemas

Unknown field se rechaza.

### Contract refinement explícito

```text
omitted -> preserve
value   -> replace esa sección validada
null    -> remove
[]      -> normalize absent
```

### Exact acceptance coverage

```text
missing required ID -> reject
unknown ID          -> reject
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

Decision/Evidence independientes no aceptan arbitrary update.

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

Forma mínima:

```yaml
method: test | build | lint | runtime | inspection | diff | external | other
result: pass | fail | observed
summary: ...
covers: [A1]
source:
  command: optional
  reference: optional
```

Reglas:

- `method`, `result`, `summary` estructuran la observación;
- coverage solo usa acceptance IDs existentes;
- acceptance explícita debe quedar cubierta;
- `fail` puede persistirse como diagnóstico pero no soporta completion;
- `observed` puede soportar evidencia observacional;
- el host produce la observación real;
- SDD no inventa ejecución de tests/browser/shell.

---

## 12. Memory Port

Implementado:

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

Application controla semántica.

Memory Port controla durability/exactness/isolation.

---

## 13. Engram Repository

Implementación productiva:

```text
src/adapters/engram/
├── codec.mjs
├── errors.mjs
├── repository.mjs
├── session.mjs
└── transport.mjs
```

Usa superficie HTTP pública de Engram 1.20.0 mediante transport encapsulado.

Garantías implementadas/probadas:

```text
put/get
sequential update
fresh-instance recovery
exact logical identity
bounded list + complete flag
project isolation
lost POST reconciliation
lost PATCH reconciliation
unavailable normalization
private-tag transform neutralization
size limit fail-before-write
physical/logical identity validation
```

No se modifica Engram.

No se lee SQLite privado.

No se usa una memoria paralela.

La session física determinista de Engram es plumbing backend, no continuity SDD.

---

## 14. Concurrencia

Soportado:

```text
Agent A -> Change A
Agent B -> Change B
```

y:

```text
Agent A -> setFrontier -> termina
Agent B -> getChange exacto -> continúa
```

No soportado:

```text
Agent A \
         > mutan Change X simultáneamente
Agent B /
```

No CAS/locks/LWW falsos.

---

## 15. Exposure

### Library

Implementada como composición interna/canónica.

### MCP

Implementado:

```text
src/transports/mcp/
```

Expone operaciones Application tipadas mediante MCP v1 SDK y schemas Zod.

No expone raw Memory Port ni primitives de Engram.

### CLI

Implementado:

```text
sdd-v2 init
sdd-v2 mcp
sdd-v2 help
```

No es segunda implementación del dominio.

### HTTP/REST

No implementado.

Solo entra con consumidor real y entonces deberá diseñarse con semantics HTTP reales.

---

## 16. Host Adapter — Codex

Implementado:

```text
src/hosts/codex/bootstrap.mjs
```

Responsabilidades:

```text
managed block en AGENTS.md
managed MCP config en .codex/config.toml
conflict preflight
preservación de contenido user-owned
```

No contiene:

```text
Domain validation
Engram mapping
Change lifecycle rules
```

El descubrimiento real por Codex pertenece al Block C, porque existencia del archivo/config no
demuestra que el harness haya cargado y usado las tools.

---

## 17. Runtime Projection

Fuente única:

```text
src/runtime/projection.mjs
```

Se proyecta a:

```text
AGENTS.md managed block
MCP server instructions
```

Reglas ejecutables incluyen:

1. ephemeral no requiere SDD;
2. receipt es selectivo;
3. pending/handoff usa continuity;
4. contracts son adaptativos;
5. recovery conocido usa exact get + inspección dirigida;
6. completion durable usa Evidence real;
7. nuevo intent se spawnea;
8. Decision es selectiva;
9. Knowledge es reusable/selectivo;
10. same-Change concurrent writers no soportado;
11. backend details nunca son estado canónico SDD.

No hay dos runtimes que puedan divergir.

---

## 18. Skills

Primera Alpha:

```text
0 skills SDD obligatorias
```

Una skill solo entra si:

- tiene trigger claro;
- contenido condicional sustancial;
- progressive disclosure aporta;
- scripts/resources justifican encapsulación.

No se recrean skills históricas por simetría.

---

## 19. Project binding

Forma implementada:

```json
{
  "schema_version": 1,
  "project_id": "stable-project-id",
  "memory": {
    "adapter": "engram"
  }
}
```

El binding contiene identidad/selección durable, no detalles del harness ni de la máquina.

No contiene:

```text
current Change
roadmap
history
runtime copy
host=codex
container name
token
```

Environment wiring:

```text
SDD_ENGRAM_CONTAINER
ENGRAM_HTTP_TOKEN
```

Host wiring permanece en `.codex/config.toml`, no en el binding semántico.

---

## 20. Bootstrap/distribución

CLI productiva:

```text
sdd-v2 init <target> --project-id <stable-id>
```

Instala en consumidor:

```text
.sdd/config.json
AGENTS.md managed block
.codex/config.toml managed block
```

No instala:

```text
.sdd/state.json
.sdd/runtime/**
SDD skills
duplicated source code
```

`init` preflights ownership/config conflicts antes de mutar estado semántico del proyecto.

La distribución aún conserva package version de desarrollo hasta superar Block C y auditoría
independiente.

---

## 21. Arquitectura de código productivo

```text
bin/
└── sdd-v2.mjs

src/
├── domain/
├── application/
├── ports/
├── adapters/
│   └── engram/
├── transports/
│   └── mcp/
├── project/
├── runtime/
├── hosts/
│   └── codex/
└── cli/

tests/
├── domain/
├── application/
├── memory-contract/
├── engram-integration/
├── mcp-contract/
├── project/
├── hosts/
├── fixtures/
└── helpers/
```

Separar por responsabilidad, no por cantidad artificial de archivos.

---

## 22. Resolución de experiments

### Engram spike

Ya cumplió su función: endpoint audit, mapping y escenarios fueron absorbidos por repository/tests
productivos.

No pertenece al active tree.

### Semantic API spike

F6B aportó:

- baseline de invariantes;
- receipt semantics;
- frontier behavior;
- closure negative cases;
- completeness propagation;
- error normalization.

Esas garantías ya están absorbidas por:

```text
src/domain/**
src/application/**
tests/domain/**
tests/application/**
tests/memory-contract/**
```

Por P12 Active-tree hygiene:

```text
DELETE experiments/semantic-api/
```

Git conserva su historia.

`experiments/README.md` permanece como política para futuros experimentos activos.

---

## 23. Testing status

Implementado y ejercitado durante Block B:

```text
Domain unit tests
Application tests
Memory behavior/contract tests
Engram codec tests
Engram repository tests
Engram transport tests
real Engram integration
project binding tests
runtime composition/projection tests
Codex bootstrap tests
MCP tool mapping/schema tests
MCP STDIO client/server contract
CLI/init tests
```

El usuario confirmó en su entorno:

```text
npm test                  PASS
npm run test:mcp          PASS
npm run test:engram       PASS
```

Esto demuestra Block B implementado y testable.

No demuestra todavía:

```text
real Codex tool discovery
real Codex invocation
cross-session host recovery
full end-to-end conformance from harness
quality score gate
```

Esos son Block C.

---

## 24. Gate pre-dogfood — Block C

Block C no agrega features salvo que una prueba falsifique una garantía.

### C1 — Structural/static audit

Verificar:

```text
one durable authority
Domain sin Engram/MCP/Codex leakage
Application sin backend coupling
MCP sin reglas de dominio duplicadas
Codex host solo wiring
binding sin current state
runtime promises == implemented capabilities
no dead experiment/product path
no unjustified skills
```

### C2 — Real Codex transport discovery

Sobre un proyecto de conformance, no dogfood:

```text
sdd-v2 init
restart/new Codex context
Codex carga managed AGENTS block
Codex descubre server sdd
Codex ve exactamente las tools SDD esperadas
una query y una mutation atraviesan MCP real
no aparecen mem_save/topic_key/Engram primitives como API SDD
```

### C3 — End-to-end conformance

Ejercer desde host real:

```text
ephemeral -> zero SDD write
receipt -> direct closed Change
continuity -> open Change + frontier
fresh context -> exact recovery
evidence-backed completed close
spawn new material intent
dependency relation
material Decision
Evidence record
Knowledge promotion/search
multiple independent Changes
sequential same-Change handoff
```

No probar como requisito un modelo no soportado de same-Change concurrent writers.

### C4 — Failure/conformance boundaries

Verificar:

```text
Engram unavailable -> memory_unavailable
complete=false no se vuelve exhaustive
invalid MCP input no escribe
host config conflict fails closed
no phantom success
```

### C5 — Quality gate

| Área | Gate |
|---|---:|
| Code readability | 8/10 |
| Local simplicity | 8/10 |
| Architecture fidelity | 8.5/10 |
| State correctness | 9/10 |
| Durability/continuity | 8.5/10 |
| Multi-agent/worktree declared model | 8/10 |
| Product maturity | 7.5/10 |

Ningún área <7.

La evaluación debe citar findings concretos; no se usa un promedio para ocultar un área roja.

### C6 — Exit

Solo si C1-C5 pasan:

```text
Block C DONE
-> fresh-chat independent audit
```

La auditoría independiente decide:

```text
GO
NO-GO con findings concretos
```

Dogfood empieza únicamente con GO.

---

## 25. Trabajo restante

### Block A — Contract alignment

```text
DONE
```

### Block B — Product implementation

```text
DONE
```

Implementado:

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

```text
NEXT
```

No se crean más frontiers conceptuales salvo falsificación de una garantía central.

Después:

```text
fresh-chat independent audit
-> GO / NO-GO
-> DOGFOOD
```

---

## 26. Estado de milestones

```text
Architecture ownership              DONE
Memory Contract                     DONE
Engram backend fit                  DONE
Domain Model                        DONE
Application API contract            DONE
Architecture / contract freeze      DONE
Product implementation              DONE

Pre-dogfood product gate            NEXT
Fresh independent audit             PENDING
DOGFOOD                             PENDING
```

---

## 27. Regla final

> SDD V2 implementa la mínima maquinaria que preserve de forma ejecutable las garantías que
> evitan pérdida de intención, scope drift, decisiones olvidadas, continuidad rota y completion
> sin evidencia.

Minimalidad se aplica a mecanismos.

No a garantías.
