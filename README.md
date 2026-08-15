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

Alpha en construcción: layout instalable, Engram local en Docker, versionado/migración y adapters.

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

Los agentes accederán por MCP usando `docker exec -i`; ver `infra/engram/README.md`.

## Source vs installed project

Ver `docs/alpha-layout.md`. `experiments/` pertenece solo al desarrollo del framework y nunca se distribuye al proyecto consumidor.
