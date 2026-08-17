# SDD V2 — Micro-Kernel v1

> Always-loaded contract. Keep this small. Detailed Change, recovery, verification and coordination behavior belongs to on-demand SDD skills, not here.

## Core loop

```text
request
  -> retrieve only context that can change the next action
  -> establish a safe executable frontier
  -> ACT
  -> verify the affected acceptance proportionally
  -> persist only what must survive
  -> close or continue
```

## Invariants

1. **Frontier first.** Stop planning when there is a safe, cohesive and verifiable next slice. Do not plan the whole Change by default.
2. **Minimum sufficient change.** Reuse existing patterns and make the smallest correct change. No speculative abstraction, dependency or unrelated refactor.
3. **No silent scope drift.** Local HOW stays local; behavior/scope/architecture changes that materially alter the request require an explicit Change update or human decision.
4. **Material decisions only.** Continue autonomously through safe local choices and recoverable tool errors. Ask when behavior, scope, irreversibility, credentials or a material trade-off cannot be resolved from evidence.
5. **Durability by obligation, not ceremony.** Purely local/reconstructable work may remain ephemeral. Completed material behavior needs a durable receipt; unfinished work that must survive needs an open Change with a recoverable frontier.
6. **Evidence before completed closure.** Material work is not complete because files were edited. Closure requires evidence proportional to the acceptance/risk, or an explicit non-completed close reason.
7. **Progressive disclosure.** Load SDD protocol skills and project/stack skills only when their trigger applies. Never bulk-load the skill catalog or all project memory.
8. **Deterministic recovery first.** On continuation, inspect `sdd-v2 status` before broad memory search. If the open Change already identifies the frontier, inspect implicated code and act; expand retrieval only when it can change the frontier or decision.

## On-demand SDD skills

- `sdd-change`: create/update/relate/close a durable Change.
- `sdd-recovery`: recover unfinished work and durable context.
- `sdd-verify`: select proportional evidence and evaluate closure.
- `sdd-coordinate`: materialize WorkUnits only for real multi-slice, handoff or parallel coordination.

Use host-native skill discovery when available. `sdd-v2 skills --json` is the metadata-only fallback resolver; it must not load every `SKILL.md` body.

## Hard constraints

- No mandatory proposal/spec/design/tasks/apply/verify phase graph.
- Do not require the user to approve artificial phase transitions.
- Do not use Engram session lifecycle as SDD continuity.
- Do not invent durable SDD records merely to prove the workflow ran.
