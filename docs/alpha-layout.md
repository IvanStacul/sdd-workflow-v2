# SDD V2 — Alpha Layout

## Development repository

```text
sdd-workflow-v2/
├── cli/                 # real Alpha CLI
├── adapters/            # host/editor adapters
├── runtime/             # files installed into projects
├── infra/               # shared optional infrastructure (Engram Docker)
├── docs/                # design/reference, not hot-path runtime
├── tests/               # product tests
└── experiments/         # disposable research; never installed
```

## Installed project

For the first Alpha (`codex` adapter):

```text
my-app/
├── .sdd/
│   ├── config.json      # project-owned SDD settings + stable project_id
│   ├── manifest.json    # SDD-managed runtime/schema versions
│   └── runtime/
│       └── kernel.md    # compact execution contract
├── .codex/
│   └── config.toml      # managed SDD block registering Engram MCP via Docker
├── AGENTS.md            # managed SDD section; existing user content preserved
└── <project files>
```

## Ownership

SDD-managed:
- `.sdd/runtime/**`
- `.sdd/manifest.json`
- only the delimited `sdd-v2` sections in `AGENTS.md` and `.codex/config.toml`

Project/user-owned:
- `.sdd/config.json`
- all content outside SDD markers
- product code/docs

## Init behavior

`init` is idempotent. It creates the Alpha runtime, preserves existing project config, and avoids overwriting a user-owned `[mcp_servers.engram]` block.

The first adapter uses Codex project config rather than global user config, so SDD installation remains repository-scoped.
