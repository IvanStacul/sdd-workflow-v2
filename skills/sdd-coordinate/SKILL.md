---
name: sdd-coordinate
metadata:
  managed_by: sdd-v2
  runtime_version: "0.2.0-alpha.1"
description: Coordinate a durable Change that truly needs multiple execution slices, handoff, dependencies, or safe parallel work; materialize WorkUnits lazily rather than planning a full task graph.
---

# SDD Coordination Protocol

Use only when one executable frontier is not enough for continuity/coordination.

## WorkUnit

A WorkUnit is execution scope, not another phase/document. Materialize just-in-time with the minimum contract:
- `id`: `<change-id>:WU-NN`;
- objective;
- done-when/evidence boundary;
- dependencies/conflicts only when real.

Do not persist future speculative WorkUnits. Do not create WorkUnits retroactively for a completed receipt.

## Parallelism

Parallelize only with positive independence:
- dependencies satisfied;
- file/resource writes do not materially conflict;
- each slice can be verified independently;
- host actually supports useful delegation/parallel execution.

Fan-in before changing shared state or closing the Change.
