# SDD V2 — Alpha Layout v0

## Objetivo

Definir la mínima frontera entre el repo que desarrolla SDD, la infraestructura opcional y lo que se instala dentro de un proyecto consumidor.

## Repo de desarrollo SDD

```text
sdd-workflow-v2/
├── docs/          contratos y decisiones de diseño; no se cargan en ejecución normal
├── runtime/       piezas canónicas distribuibles
├── infra/         servicios auxiliares opcionales (Engram Docker)
└── experiments/   pruebas descartables; nunca se instalan en proyectos
```

## Proyecto consumidor — Alpha

```text
my-app/
├── .sdd/
│   ├── manifest.json       # managed; versión + schemas
│   ├── config.json         # user-owned; memoria/autonomía/evolution
│   └── runtime/
│       └── kernel.md        # managed
├── .codex/
│   └── config.toml          # adapter Codex Alpha
├── AGENTS.md                # bloque SDD V2 administrado + contenido del proyecto
└── código del proyecto
└── código del proyecto
```

### `manifest.json`

Se genera desde `runtime/manifest.template.json`.

Responsabilidades:

- identificar versión de runtime instalada;
- identificar schemas esperados;
- declarar paths enteramente managed por SDD;
- permitir que update/migration hagan preflight barato.

No es un contrato con hashes encadenados ni un log de ejecución.

### `config.json`

Se genera desde `runtime/config.template.json` y es editable por el usuario/proyecto.

En Alpha controla únicamente decisiones que ya existen conceptualmente:

- memory provider/transport;
- approval mode;
- capture/surfacing de evolution signals.

No agregar switches hasta que cambien comportamiento real.

### `.sdd/runtime/`

Managed. Puede reemplazarse durante `sdd update` si el cambio es compatible o después de una migración exitosa.

Por ahora contiene solo `kernel.md`.

## Fuera del proyecto consumidor

Engram corre como servicio local compartido:

```text
Docker Desktop / Docker Engine
└── sdd-engram
    └── volume sdd-engram-data
```

Cada proyecto recibe un `project-id` estable y los adapters lo pasan al MCP de Engram. La memoria no se copia dentro de `.sdd/`.

## Update/Migration

```text
read .sdd/manifest.json
  -> compare runtime/config/memory versions
  -> classify compatibility
  -> preview managed changes
  -> migrate only if required
  -> replace managed runtime
  -> verify
  -> update manifest
```

`config.json` no se sobreescribe completo durante update. Cualquier migración de config debe preservar valores del usuario.

## Incluido en Alpha actual

- CLI `sdd-v2`;
- `sdd-v2 init`;
- adapter Codex;
- instalación idempotente de `.sdd/`, `AGENTS.md` y `.codex/config.toml`;
- Engram Docker MCP como backend de memoria.

## No incluido todavía

- `sdd update` ejecutable;
- migradores concretos;
- adapters adicionales;
- scheduler/parallel executor propio;
- exporter final.

Estas piezas se agregan solo cuando el dogfooding o una necesidad real las justifique.
