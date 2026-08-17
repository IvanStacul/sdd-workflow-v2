# SDD V2 — Rebaseline Layout v1

## Objetivo

Separar producto SDD, binding por proyecto, memoria y capacidades nativas del harness sin volver al workflow copiado completo de V1.

## Repo SDD

```text
sdd-workflow-v2/
├── cli/          control plane CLI
├── lib/          control state + resolvers
├── adapters/     wiring por host
├── runtime/      micro-kernel distribuible
├── skills/       protocols SDD reutilizables/on-demand
├── docs/         design intent/rationale
├── infra/        servicios auxiliares, hoy Engram Docker
├── tests/        behavior + projection tests
└── experiments/  spikes no canónicos
```

## Proyecto consumidor

```text
my-app/
├── .sdd/
│   ├── config.json
│   ├── manifest.json
│   ├── state.json
│   └── runtime/kernel.md
├── .agents/skills/sdd-*/SKILL.md
├── AGENTS.md
└── .codex/config.toml
```

### Ownership

| Path | Owner | Update behavior |
|---|---|---|
| `.sdd/config.json` | project/user | preservar; migrar explícitamente si schema cambia |
| `.sdd/state.json` | SDD control plane, persistent | nunca reemplazar por update; migrar schema |
| `.sdd/manifest.json` | SDD | reemplazable |
| `.sdd/runtime/kernel.md` | SDD | reemplazable |
| `.agents/skills/sdd-*` | SDD | reemplazables por versión instalada |
| `AGENTS.md#sdd-v2` | SDD section | upsert section only |
| `.codex/config.toml#sdd-v2` | SDD section | upsert section only |

## Control state vs memory

`.sdd/state.json` no reemplaza Engram ni contiene transcript/historia extensa. Su objetivo es hacer deterministas las operaciones de control que no deberían depender de FTS o de la inteligencia del modelo:

- Change IDs;
- open/closed lifecycle;
- canonical `topic_key`;
- optional bound memory reference;
- closure reason/evidence summary/ref.

Engram conserva contexto durable rico e histórico: Change content adicional, Decisions, Evidence records, Project Knowledge y otros records que demuestren valor.

## Skills

SDD usa `.agents/skills` como binding portable inicial para los hosts que comparten Agent Skills. El producto fuente mantiene las skills en `skills/`.

Esto es una decisión de distribución del Alpha rebaselined, no una obligación conceptual de copiar skills por repo para siempre. Adapters futuros pueden proyectarlas a scope global/native cuando el host permita versionado y aislamiento suficientes.

## No incluido todavía

- OpenCode adapter productivo;
- Memory Contract completamente encapsulado detrás de un MCP/SDK SDD propio;
- migración/normalización automática de todos los records legacy de Engram;
- scheduler propio;
- WorkUnit lifecycle CLI;
- EvolutionSignal pipeline;
- exporters finales.

Esas piezas deben entrar por evidencia, no por completitud arquitectónica.
