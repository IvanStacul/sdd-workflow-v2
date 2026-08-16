# SDD Workflow V2 — Alpha

Action-first Spec-Driven Development experiment evolving toward a usable workflow with proportional ceremony, lazy WorkUnits, persistent memory, and evidence-driven self-improvement.

## Current Alpha

Implemented:
- minimal runtime kernel;
- Change / WorkUnit / Memory / Router / Evolution contracts;
- Engram 1.20.0 local persistent memory via Docker;
- first real installer: Codex adapter;
- idempotent project bootstrap.

## Run tests

```bash
npm test
```

## Initialize a project

From this repository:

```bash
node cli/sdd.mjs init D:/path/to/project --adapter codex
```

Or link the Alpha CLI locally:

```bash
npm link
sdd-v2 init D:/path/to/project --adapter codex
```

The project receives `.sdd/`, an SDD-managed section in `AGENTS.md`, and a project-scoped `.codex/config.toml` entry that launches Engram through the `sdd-engram` Docker container.

After init, start a fresh Codex session from the target repository so project instructions and MCP config are reloaded.

## Repository boundaries

- `runtime/`: product installed into projects.
- `cli/`, `adapters/`: Alpha product tooling.
- `infra/`: shared external infrastructure.
- `docs/`: design/reference.
- `tests/`: product tests.
- `experiments/`: disposable research, never installed.
