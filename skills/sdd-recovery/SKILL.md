---
name: sdd-recovery
metadata:
  managed_by: sdd-v2
  runtime_version: "0.2.0-alpha.1"
description: Recover unfinished SDD work across sessions or agents using deterministic Change state first, then only the durable memory and repository context that can change the next action.
---

# SDD Recovery Protocol

## Fast path

1. Run `sdd-v2 status --json`.
2. Select the relevant open Change from deterministic control state. If the control state was newly bootstrapped from Alpha.5 and no Change is indexed, perform one narrow legacy Engram lookup, then register the canonical existing ID with `sdd-v2 change register <id> --slug ... --intent ... --memory-ref <ref>`; never allocate a replacement ID for the same legacy Change.
3. Select the relevant open Change from deterministic control state. If ambiguous, use request semantics/title/slug; ask only if multiple candidates remain materially plausible.
4. If the Change has a bound memory reference, fetch that record directly. Otherwise use an exact/narrow Change lookup and bind the discovered reference.
5. Recover only the frontier, constraints/decisions that affect it, and high-signal Project Knowledge.
6. Inspect implicated repository code.
7. If the frontier is safe: **STOP RETRIEVAL -> ACT**.

Do not reconstruct the prior conversation or load timelines/session summaries by default.

## Expand retrieval only when

- frontier is missing/contradictory;
- scope or acceptance is ambiguous;
- a material decision is unresolved;
- project knowledge can plausibly prevent rework;
- current code contradicts durable state.

Engram session lifecycle and session summaries are optional backend conveniences, not continuity prerequisites.
