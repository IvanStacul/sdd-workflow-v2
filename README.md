# SDD Workflow V2

SDD V2 es una reconstrucción de Spec-Driven Development orientada a agentes y harnesses
modernos.

Su objetivo es preservar las garantías que realmente evitan pérdida de intención, scope drift,
decisiones olvidadas, continuidad rota y completion sin evidencia, sin volver a una cadena
obligatoria de proposal/spec/design/tasks ni duplicar capacidades del host.

## Estado

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

La implementación actual es una **candidata de Alpha reconstruida**, todavía no declarada apta
para dogfood hasta superar Block C.

`0.2.0-alpha.1` permanece invalidada como baseline. Git conserva su historia y
`docs/dogfood-evidence.md` conserva la evidencia empírica útil.

## Arquitectura

```text
Host Agent / Harness
        |
        v
Runtime Projection
        |
        v
SDD MCP Transport
        |
        v
SDD Application API
        |
        v
Domain Model
 Change / Decision / Evidence / Knowledge
        |
        v
Memory Port
        |
        v
Engram Repository
        |
        v
Engram 1.20.0
```

Las responsabilidades permanecen separadas:

```text
host           -> navegación, edición, shell, tests, browser, subagents
runtime        -> reglas SDD pequeñas que cambian la acción del agente
MCP            -> transport estructurado
application    -> casos de uso semánticos
domain         -> significado e invariantes
memory port    -> contrato durable
repository     -> traducción al backend
Engram         -> almacenamiento externo
```

**Application API no significa REST.**

Library y MCP están implementados. CLI existe para bootstrap/admin. HTTP/REST queda fuera del
mínimo mientras no exista un consumidor real que lo necesite.

## Principio operativo

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

Trabajo material terminado en la ejecución actual, cuando la trazabilidad durable aporta:

```text
request
-> ACT
-> verify real
-> createReceipt
```

Receipt es un Change que nace `closed/completed`.

### Continuity

Trabajo/intención que debe sobrevivir:

```text
openChange
-> ACT
-> persistir frontier cuando corresponda
-> handoff/restart
-> exact get
-> inspección dirigida
-> ACT
-> evidence-backed close
```

No se actualiza SDD después de cada tool call.

## Garantías conservadas

El modelo puede representar adaptativamente:

```text
intent
scope
acceptance
constraints
risks
edge cases
material open questions
rollback
Decision
structured Evidence
continuity/frontier
scope evolution
Knowledge reusable
```

Tener una garantía no implica materializar una sección o archivo obligatorio.

```text
scope control
!=
proposal.md obligatorio

evidence-backed completion
!=
verify.md obligatorio
```

## Domain Model

Records lógicos de la primera Alpha:

```text
Change
Decision
Evidence
Knowledge
```

No pertenecen al core inicial:

```text
WorkUnit
Progress record
SessionSummary
roadmap state
event stream
```

### Change

Identidad:

```text
CHG-<ULID>
```

Lifecycle:

```text
open
closed
```

Continuity abierta conserva solo lo necesario para reanudar:

```text
completed
next
blockers
```

### Scope evolution

Implementado:

```text
refineChange
spawnChange
addDependency
```

`split` y `supersede` siguen siendo conceptos del modelo pero no se automatizan mientras no
existan semantics explícitas de partial failure multi-record.

### Evidence

Completion durable usa Evidence estructurada:

```yaml
method: test | build | lint | runtime | inspection | diff | external | other
result: pass | fail | observed
summary: ...
covers: [A1]
source: optional
```

Reglas importantes:

```text
missing acceptance coverage -> reject
unknown acceptance coverage -> reject
result=fail                  -> no soporta completion
```

La observación real proviene del host; SDD valida estructura y relación con acceptance.

## Application API

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

No existe una primitive pública de dominio equivalente a:

```text
putRecord(arbitraryJson)
patchRecord(...)
setLifecycle(...)
```

## Memory

Contrato:

```text
put(record)
get(ref)
list(selector)
search(text, filters) optional
```

Única autoridad durable:

```text
Application API
-> Memory Port
-> Repository
```

No existe `.sdd/state.json` como segunda autoridad.

## Engram

`src/adapters/engram/` es ahora implementación productiva del Memory Port sobre la superficie
HTTP pública de Engram 1.20.0.

El repository encapsula:

```text
transport
physical identity codec
serialization
deterministic exact recovery
bounded list
write reconciliation
project isolation
error normalization
physical session plumbing
```

No lee SQLite privado ni modifica/forkea Engram.

Las transformaciones físicas del backend no entran al Domain Model.

## Concurrencia

Soportado:

```text
multiple agents/worktrees sobre Changes independientes
sequential handoff del mismo Change
```

No soportado:

```text
same-Change concurrent writers
```

No se agregan CAS, locks o LWW para simular una garantía que el producto no declara.

## MCP

Primer transport para agentes implementado en:

```text
src/transports/mcp/
```

Expone tools SDD tipadas para los casos de uso implementados y no expone primitives físicas
de Engram.

Ejemplos:

```text
sdd_change_open
sdd_change_get
sdd_change_frontier
sdd_change_spawn
sdd_change_close
sdd_decision_record
sdd_evidence_record
sdd_knowledge_promote
```

Los contratos MCP se verifican también con cliente STDIO del SDK.

## Codex host/bootstrap

Implementado en:

```text
src/hosts/codex/
src/project/
src/runtime/
src/cli/
bin/
```

Un proyecto consumidor inicializado recibe únicamente el binding y wiring necesarios:

```text
.sdd/config.json
AGENTS.md                 managed SDD block
.codex/config.toml        managed SDD MCP block
```

No recibe:

```text
.sdd/state.json
.sdd/runtime/
.agents/skills/ SDD
duplicate memory
roadmap authority
```

Binding durable:

```json
{
  "schema_version": 1,
  "project_id": "stable-project-id",
  "memory": {
    "adapter": "engram"
  }
}
```

El host y detalles de máquina no forman parte de la identidad del proyecto.

Variables de entorno relevantes:

```text
SDD_ENGRAM_CONTAINER
ENGRAM_HTTP_TOKEN
```

## Runtime Projection

Existe una sola fuente programática:

```text
src/runtime/projection.mjs
```

De ella se derivan:

```text
AGENTS.md managed block
MCP server instructions
```

El runtime no promete capacidades que no existan en código.

## Skills

Primera Alpha:

```text
0 skills SDD obligatorias
```

Una skill solo se agrega con trigger y beneficio de progressive disclosure demostrables.

## Tests ya ejercitados

Durante Block B se implementaron suites para:

```text
Domain
Application API
Memory Port behavior
Engram codec
Engram repository
Engram transport
real Engram integration
project binding
runtime composition
Codex bootstrap
MCP tools
real MCP STDIO client/server contract
CLI/init
```

El usuario confirmó en su entorno que pasan:

```text
npm test
npm run test:mcp
npm run test:engram
```

Esto cierra implementación, pero **no sustituye Block C**, que verifica el producto completo
desde el harness real y aplica el gate cualitativo/estructural pre-dogfood.

## Fuentes activas

```text
docs/rebaseline-architecture.md  arquitectura cross-layer
docs/change-model.md             Domain Model
docs/memory-contract.md          contrato durable
docs/semantic-api.md             Application API
docs/dogfood-evidence.md         evidencia histórica útil

src/**                           implementación productiva
tests/**                         falsificación automatizada
infra/engram/**                  infraestructura Engram local
experiments/README.md            política para experimentos futuros
```

`experiments/semantic-api/` queda eliminado al cerrar Block B porque su evidencia ya fue
absorbida por contratos y tests productivos.

## Active-tree hygiene

Git es el archivo histórico.

Cuando un experimento queda supersedido:

```text
extraer evidencia útil
-> incorporar garantía/test/decisión
-> eliminar experimento
```

No se crean carpetas `legacy`, `old` o `deprecated`.

## Próximo bloque

**Block C — Pre-dogfood Product Gate.**

No introduce otra arquitectura.

Debe atacar el producto implementado desde cuatro ángulos:

```text
1. structural/static architecture audit
2. real Codex + MCP discovery/invocation
3. end-to-end conformance scenarios
4. quality gate
```

Después:

```text
fresh-chat independent audit
-> GO / NO-GO
-> DOGFOOD
```
