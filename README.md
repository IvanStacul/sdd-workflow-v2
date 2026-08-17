# SDD Workflow V2 — Alpha

V2 busca preservar trazabilidad, continuidad y calidad de Spec-Driven Development con menos ceremony y menor tiempo hasta acción.

## Estado

Core conceptual disponible:

- Change Model
- WorkUnit Model
- Router Contract
- Execution Contract
- Memory Contract
- Evolution Contract
- Runtime Kernel

Alpha funcional inicial validado: `sdd-v2 init`, adapter Codex, Engram local en Docker y memoria persistente cross-session. Alpha.2 agregó `sdd-v2 update`; Alpha.3 separó planning route de durability; Alpha.4 proyectó el Memory Contract al runtime; Alpha.5 optimiza recovery/handoff sin reducir Engram por cuota de llamadas.

## Principio operativo

```text
request -> lightest safe route -> minimum context -> executable frontier
        -> ACT -> proportional verify -> useful persistence -> next/close
```

No existe una cadena obligatoria proposal/spec/design/tasks/apply/verify.

## Engram sin instalación local

```bash
cd infra/engram
cp .env.example .env
docker compose up -d --build
```

Los agentes acceden por MCP usando `docker exec -i`; ver `infra/engram/README.md`.

## Alpha validado

Validado en Windows + Docker Desktop + Codex con Engram 1.20.0:

- container healthy;
- SQLite persistente tras restart/down-up;
- `sdd-v2 init` instala `.sdd/` + adapter Codex;
- Codex carga el kernel;
- MCP conecta a Engram dentro de Docker;
- `mem_save` persiste en el project-id correcto;
- `mem_search` recupera la memoria;
- una sesión nueva recupera memoria de la sesión anterior.


## Source vs installed project

Ver `docs/alpha-layout.md`. `experiments/` pertenece solo al desarrollo del framework y nunca se distribuye al proyecto consumidor.

## Update compatible

```bash
sdd-v2 update . --dry-run
sdd-v2 update .
```

El update reemplaza únicamente runtime/bloques administrados y preserva `.sdd/config.json`. Si detecta un cambio de schema que todavía requiere migrador, se detiene sin mutar.

## Dogfooding

La validación principal continúa sobre una app real desde cero. Ver `docs/dogfooding.md`.


## Route y durability (Alpha.3)

SDD V2 separa dos decisiones que antes estaban acopladas:

- **planning route** `direct | compact | full`: cuánta ceremonia/contrato hace falta antes de actuar;
- **durability** `ephemeral | receipt | continuity`: qué contexto debe sobrevivir después del slice/sesión.

Esto permite que una feature clara se ejecute `direct` pero deje un receipt mínimo, mientras un cambio cosmético puede ser `direct + ephemeral`. Trabajo explícitamente pendiente para otra sesión siempre requiere `continuity`.

## Alpha.4 — runtime projection

SDD V2 no carga los documentos extensos de `docs/` durante trabajo normal. Los invariantes ejecutables se proyectan a:

- `.sdd/runtime/kernel.md`: contrato mínimo always-loaded;
- `.sdd/runtime/memory.md`: contrato condicional para recovery y memoria durable.

Esto mantiene bajo el costo de contexto sin depender de que el modelo infiera reglas que solo existen en documentación de diseño.

## Alpha.5 — recovery/handoff refinement

El dogfood Alpha.4 validó un Change `continuity` canónico y recuperación cross-session, pero mostró dos costos evitables:

- una continuación podía seguir reconstruyendo/replanificando después de recuperar una `Frontier` ya ejecutable;
- `session_summary` provocaba retries de lifecycle aun cuando el Change ya preservaba toda la continuidad necesaria.

Alpha.5 mantiene Engram value-driven, agrega un recovery fast-path y convierte session lifecycle/summaries en complementos estrictamente opcionales. También refuerza la promoción de fricción de entorno/tooling repetida a `SDD Knowledge`.
