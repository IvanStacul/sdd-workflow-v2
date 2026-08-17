---
name: sdd-verify
metadata:
  managed_by: sdd-v2
  runtime_version: "0.2.0-alpha.1"
description: Verify material SDD work against actual acceptance with proportional evidence and decide whether a Change can close; use before completed closure or for risky changes.
---

# SDD Verification Protocol

Verification is a closure property, not a mandatory phase.

## Evidence selection

Choose the cheapest evidence that can actually falsify the affected acceptance:
- mechanical text/config: readback/diff/parse;
- local static code: lint/typecheck;
- local behavior: targeted test;
- cross-component behavior: integration/runtime check;
- high-risk/shared contract: broader suite/CI/security check as justified.

Do not run a large suite merely by ceremony when narrower evidence proves the contract. Do not accept a passing internal test that fails to exercise the observable acceptance.

## Closure rule

A Change closing as `completed` must provide observed evidence summary/reference to:

```text
sdd-v2 change close <id> --reason completed --evidence "<observed result>" [--evidence-ref <ref>]
```

The CLI rejects completed closure without evidence. `cancelled`, `superseded`, or `split` may close without completion evidence but must use the corresponding reason.

If evidence is blocked by the environment, keep the Change open unless the user explicitly accepts the unresolved verification risk.
