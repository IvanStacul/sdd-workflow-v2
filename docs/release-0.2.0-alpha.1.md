# Release — SDD V2 0.2.0-alpha.1

## Purpose

First implementation after the critical V2 rebaseline. This release deliberately changes architecture instead of adding Alpha.6 rules to the existing kernel.

## Conventional commit

```text
feat!: rebaseline SDD V2 around deterministic control state and on-demand protocol skills
```

Suggested body:

```text
- replace the growing kernel/memory runtime with a small always-loaded micro-kernel
- add deterministic Change control state and lifecycle CLI
- require evidence for completed Change closure
- move change, recovery, verification and coordination semantics to on-demand Agent Skills
- add metadata-only skill discovery fallback
- add supported Alpha.5 -> control schema 1 bootstrap without rewriting memory
- retire managed runtime/memory.md and remove Evolution from the hot kernel
- add behavioral tests for lifecycle, migration, closure and skill disclosure

BREAKING CHANGE: the installed runtime layout changes; runtime/memory.md is retired and SDD protocol behavior moves to .agents/skills/sdd-* plus .sdd/state.json. Run sdd-v2 update before continuing an Alpha.5 project.
```

## Migration caveat

The update cannot infer active Alpha.5 Changes from Engram without inspecting memory. It therefore creates an empty deterministic control index and preserves all Engram data.

For an existing open canonical Change:

1. recover it once from Engram;
2. preserve its existing ID;
3. register it:

```text
sdd-v2 change register CHG-YYYYMMDD-NN \
  --slug <slug> \
  --intent "<intent>" \
  --memory-ref <engram-ref>
```

Do not create a replacement Change for the same legacy work.

## Known gaps intentionally not solved

- Engram is still exposed directly to the host; a complete SDD Memory Adapter/MCP is not implemented yet.
- WorkUnit lifecycle remains protocol-level and experimental.
- Project Knowledge promotion is not automated.
- Evolution Signal pipeline is not implemented in the hot path.
- Only Codex has a product adapter.
- SDD skills are currently projected per-project under `.agents/skills`; global/native installation remains a distribution experiment for future adapters.

These gaps should be prioritized only after comparative dogfood demonstrates their impact.
