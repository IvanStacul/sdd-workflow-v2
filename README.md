# SDD Workflow V2 — Rebaseline Alpha

SDD V2 es un **control plane pequeño para desarrollo asistido por agentes**, no una cadena obligatoria de fases ni un reemplazo de Codex/OpenCode/u otros harnesses.

Versión actual: **`0.2.0-alpha.1`**.

## Qué cambió en el rebaseline

El dogfood de Alpha.1–Alpha.5 validó Engram + recovery cross-session, pero también mostró que demasiada semántica de SDD dependía de que el LLM interpretara correctamente `kernel.md`, `memory.md` y `AGENTS.md`.

`0.2.0-alpha.1` mueve las garantías más importantes a mecanismos explícitos:

- micro-kernel always-loaded, sin `direct | compact | full` como taxonomía obligatoria;
- `.sdd/state.json` como **control index determinista** para identidad/lifecycle de Changes;
- CLI real para `status`, `change open/bind/close/list`;
- cierre `completed` rechazado si no existe evidencia observada;
- SDD protocols como Agent Skills on-demand: `sdd-change`, `sdd-recovery`, `sdd-verify`, `sdd-coordinate`;
- fallback `sdd-v2 skills --json` que descubre solo metadata, no carga bodies;
- `runtime/memory.md` deja de distribuirse: Change/recovery/verification ya no crecen dentro del kernel;
- Engram continúa como backend durable para semántica/historia, Decisions, Evidence y Knowledge;
- update desde Alpha.5 crea control schema `1` sin migrar/rewrite masivo de memory schema `1`.

## Principio operativo

```text
request
  -> minimum relevant context
  -> executable frontier
  -> ACT
  -> proportional evidence
  -> persist only what must survive
  -> close or continue
```

No existe una cadena obligatoria `proposal -> spec -> design -> tasks -> apply -> verify`.

## Layout instalado

```text
my-app/
├── .sdd/
│   ├── config.json          # project-owned
│   ├── manifest.json        # managed version/schema metadata
│   ├── state.json           # persistent machine control state
│   └── runtime/
│       └── kernel.md        # tiny always-loaded contract
├── .agents/
│   └── skills/
│       ├── sdd-change/
│       ├── sdd-recovery/
│       ├── sdd-verify/
│       └── sdd-coordinate/
├── .codex/config.toml       # Codex adapter + Engram MCP
└── AGENTS.md                # tiny SDD bootstrap section + project content
```

## CLI

```bash
sdd-v2 init . --project-id my-project
sdd-v2 update . --dry-run
sdd-v2 update .

sdd-v2 status . --json
sdd-v2 skills . --json

sdd-v2 change open ticket-tags --intent "Agregar tags a tickets"
sdd-v2 change bind CHG-20260817-01 <engram-observation-ref>
sdd-v2 change close CHG-20260817-01 --reason completed --evidence "15 tests / 76 assertions PASS"
```

`change close --reason completed` falla cerrado cuando no recibe `--evidence` o `--evidence-ref`.

## Engram

Engram 1.20.0 + Docker MCP fue validado durante el dogfood real. SDD conserva `.sdd/config.json.project_id` como identidad del proyecto y el adapter Codex configura:

```text
docker exec -i -e ENGRAM_PROJECT=<project-id> sdd-engram engram mcp --tools=agent
```

Engram session lifecycle/session summaries no son requisitos de continuidad SDD.

## Skills

SDD distingue:

- **SDD protocol skills**: controlan Change/recovery/verification/coordination;
- **project/stack skills**: Laravel, React, testing, UI, etc.;
- **Project Knowledge**: hechos reusables aprendidos del repo/entorno;
- **repo context**: estado real del código.

El host debe usar progressive disclosure. No se carga el catálogo completo para cada request.

## Update desde Alpha.5

`0.2.0-alpha.1` mantiene config schema `1` y memory schema `1`. Agrega control schema `1` con migración soportada:

```text
Alpha.5
  .sdd/runtime/kernel.md
  .sdd/runtime/memory.md
       |
       v
0.2.0-alpha.1
  .sdd/runtime/kernel.md
  .sdd/state.json
  .agents/skills/sdd-*
```

`runtime/memory.md` legacy se elimina porque pertenecía al runtime managed. `.sdd/config.json` se preserva completa, incluyendo claves legacy desconocidas.

## Validación

```bash
npm test
```

La suite actual valida comportamiento de control state, lifecycle, closure gate, migration e skill discovery además de proyección runtime.

## Próximo dogfood

No agregar más reglas por defecto. El siguiente paso es comparar Alpha.5 vs rebaseline sobre los mismos casos: cosmetic, receipt material, continuity recovery, múltiples Changes abiertos, verification mutation y knowledge reuse. Ver `docs/rebaseline-architecture.md` y `docs/dogfooding.md`.
