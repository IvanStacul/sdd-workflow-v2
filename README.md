# SDD Workflow V2 — Product Reconstruction

SDD V2 está completando una reconstrucción de producto antes de volver al dogfood.

La V2 busca preservar las garantías útiles de Spec-Driven Development —intención, scope,
acceptance, risks, decisions, evidence y continuidad— sin volver a una cadena obligatoria
de proposal/spec/design/tasks ni duplicar capacidades de Codex, OpenCode y otros harnesses.

## Estado

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

No hay actualmente una Alpha instalable considerada válida.

`0.2.0-alpha.1` fue invalidada como baseline. Git conserva su historia y
`docs/dogfood-evidence.md` conserva la evidencia empírica relevante.

## Arquitectura

```text
Host Agent / Harness
        |
        v
Runtime Projection
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
Backend Repository
        |
        +--> Engram
        +--> otro backend
```

**Application API no significa REST.**

Es la frontera programática transport-free de SDD. Puede exponerse por library, MCP, CLI y,
solo si aparece una necesidad real, HTTP/REST.

## Principio operativo

```text
ephemeral
  -> ACT -> verify -> fin

receipt
  -> ACT -> verify -> Change closed/completed

continuity
  -> Change open + actionable frontier
  -> handoff/restart
  -> exact recovery
  -> ACT
  -> evidence-backed close
```

No existe una llamada SDD obligatoria por request.

## Garantías conservadas

De la riqueza histórica de V1/V2 se conservan de forma adaptativa:

```text
intent
scope
acceptance
constraints
risks
edge cases
material open questions
rollback cuando aporta
Decision
structured Evidence
continuity/frontier
scope evolution
Knowledge reusable
```

Lo que se elimina es la obligación de materializar artefactos por ceremonia.

## Fuentes activas

```text
docs/rebaseline-architecture.md  arquitectura cross-layer congelada
docs/change-model.md             Domain Model de Change/Decision/Evidence/Knowledge
docs/memory-contract.md          frontera durable validada
docs/semantic-api.md             Application API y casos de uso
docs/dogfood-evidence.md         evidencia histórica normalizada
```

Jerarquía:

```text
rebaseline-architecture
-> contratos especializados
-> implementación
-> runtime projection
```

La implementación no puede prometer más que los contratos.

## Engram

`infra/engram/` conserva la infraestructura validada para Engram 1.20.0.

F5 demostró mediante superficie pública:

```text
put/get
sequential update
fresh-instance recovery
exact identity
bounded list
project isolation
lost POST/PATCH reconciliation
backend unavailable
clean cleanup
```

No se modifica Engram, no se lee su SQLite privado y no existe `.sdd/state.json` como segunda
autoridad.

El transporte físico usado por el spike no es automáticamente la distribución final.

## Modelo de concurrencia

Soportado:

```text
multiple agents/worktrees sobre Changes independientes
handoff secuencial del mismo Change
```

No soportado:

```text
same-Change concurrent writers
```

No CAS/locks por anticipado.

## Evidence

Completion durable no se justifica con:

```text
"done"
"tests pass"
```

sin estructura.

Modelo mínimo:

```yaml
method: test | build | lint | runtime | inspection | diff | external | other
result: pass | fail | observed
summary: ...
covers: [A1]
source: optional
```

La observación la produce el host; SDD valida estructura y relación con acceptance.

## Scope evolution

Primera implementación productiva debe soportar:

```text
refineChange
spawnChange
addDependency
```

Split/supersede siguen en el Domain Model pero no se automatizan hasta tener semantics seguras
de partial failure multi-record.

## Exposure

Primer transport objetivo para agentes:

```text
MCP
```

porque los harnesses target ya consumen tools estructuradas.

Library es la composición interna.

CLI puede ser fallback/admin.

REST no forma parte del mínimo y solo se agregará ante un consumidor real.

## Código productivo esperado

Block B separa responsabilidades:

```text
domain
application
ports
Engram adapter
MCP transport
Codex host/bootstrap
runtime projection
tests
```

El spike monolítico `experiments/semantic-api/` **no se copia como producto**.

Se reutilizan sus invariantes y casos negativos; luego se elimina cuando la implementación
productiva los superseda.

## Active-tree hygiene

Git es el archivo histórico.

Cuando una implementación/experimento queda supersedido:

```text
extraer evidencia útil
-> actualizar decisión
-> borrar artefacto muerto
```

No carpetas `legacy/old/deprecated`.

## Próximo bloque

**Block B — Product implementation.**

Debe implementar el diseño congelado sin abrir nuevas frontiers conceptuales:

```text
Domain
Application API
Memory Port
Engram Repository
MCP transport
Codex binding
Runtime Projection
tests
```

Después viene un único Block C de gate integral y, recién entonces, una auditoría independiente
en chat nuevo antes de dogfood.
