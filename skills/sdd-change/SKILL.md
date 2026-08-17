---
name: sdd-change
metadata:
  managed_by: sdd-v2
  runtime_version: "0.2.0-alpha.1"
description: Manage a durable SDD Change when material behavior must be traced, unfinished work must survive, scope changes materially, or a Change needs to close.
---

# SDD Change Protocol

Use this skill only when durable Change semantics are required. Do not create a Change for cosmetic/mechanical work whose intent is cheap to reconstruct and leaves no pending work.

## Canonical control state

Use the SDD control CLI for identity/lifecycle instead of inventing IDs or discovering open Changes through fuzzy memory search:

```text
sdd-v2 status --json
sdd-v2 change open <slug> --intent "..." [--title "..."]
sdd-v2 change register <canonical-id> --slug <slug> --intent "..." [--memory-ref <ref>]
sdd-v2 change bind <id> <memory-ref>
sdd-v2 change close <id> --reason completed --evidence "..." [--evidence-ref <ref>]
```

The CLI allocates `CHG-YYYYMMDD-NN`. Never use a slug as the ID.

## Minimum Change contract

Always preserve:
- stable ID;
- intent;
- `open | closed` lifecycle.

Add only when they materially reduce ambiguity/risk/rework:
- acceptance/invariants;
- explicit scope exclusions;
- frontier for unfinished work;
- relations (`split_from`, `spawned_from`, `depends_on`, `supersedes`);
- unresolved material decisions.

Do not manufacture empty sections.

## Durability

- **ephemeral**: no Change required.
- **receipt**: material work finished now; create/close one minimal Change. Do not create a retroactive WorkUnit.
- **continuity**: work must survive; leave the Change open and persist a concrete frontier before ending context/handoff.

These labels describe persistence obligation; they are not planning phases and need not be narrated unless useful.

## Memory

Current/open Change lookup starts from local control state. Engram remains the durable semantic/history backend for richer Change content, Decisions, Evidence and Knowledge. If a canonical Change observation is written, bind its returned observation/reference to the local Change index.

Never claim a memory write succeeded without tool confirmation.
