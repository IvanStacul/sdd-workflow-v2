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

Alpha funcional inicial validado: `sdd-v2 init`, adapter Codex, Engram local en Docker y memoria persistente cross-session. Próximo milestone: dogfooding sobre una aplicación real creada desde cero.

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
