# SDD V2 — Fresh Independent Audit

## 1. Status

**Verdict: GO for dogfood.**

Audit date: 2026-08-22.

Baseline originally audited:

```text
97c0450cc692f42af15d9569b24c5e6431dcce26
```

Current audited head:

```text
e59667ce7445270aa8d6920256bfab1d4daecc19
```

The current head is exactly three focused commits ahead of the original audit baseline:

```text
06b747b  docs(api): define semantic and transport error boundaries
200a685  fix(api): sanitize Memory diagnostics at Application boundary
e59667c  test(mcp): cover public error boundary end to end
```

No unrelated product change was introduced between the original audit and this delta re-audit.

---

## 2. Original independent-audit result

The fresh independent audit returned **NO-GO** because of one MAJOR finding:

### F-01 — Public error boundary leaked backend diagnostics

The frozen semantic contract required backend/transport diagnostics to remain internal, but the implementation could promote Memory/Engram/Docker details through:

```text
Transport
-> Engram normalization
-> MemoryPortError.details
-> Application SddError.details
-> MCP public error
```

Examples included:

```text
exit_code
stderr
HTTP status/path
session_id
physical project/topic identifiers
SQLite id
topic_key
backend message
```

A separate MINOR finding remained:

### F-02 — init is not failure-atomic for arbitrary filesystem I/O failures

Conflict preflight is fail-closed, but a later filesystem write failure can leave a partial installation.

F-02 is recoverable/idempotent and does not invalidate semantic state guarantees, so it is not a dogfood blocker.

---

## 3. F-01 remediation

### F01-A — Contract boundary

Closed by:

```text
06b747b
```

The contract now distinguishes:

```text
Application semantic errors
!=
transport fallback
```

Application retains exactly the semantic error taxonomy defined by `docs/semantic-api.md`.

MCP `internal_error` is explicitly a transport-only defensive fallback for unexpected non-SDD exceptions.

Backend diagnostics may remain available through internal `cause`, but cannot be promoted automatically to public `message` or `details`.

### F01-B — Application boundary

Closed by:

```text
200a685
```

`translateMemoryError()` now:

- maps Memory failures to canonical SDD codes/messages;
- does not trust backend `message`;
- does not copy backend `details`;
- does not publish `memory_code`;
- preserves the original error only as internal `cause`;
- wraps even a backend-thrown `SddError` instead of allowing it to bypass the Memory boundary.

Application-owned semantic details remain public when they are part of the SDD contract.

### F01-C — MCP conformance

Closed by:

```text
e59667c
```

The regression test exercises the real layering:

```text
Docker transport
-> Engram Repository
-> Memory Port error
-> Application
-> MCP handler
-> structuredContent + content
```

It verifies that Docker diagnostics such as `exit_code`, `stderr` and host paths do not cross the public MCP boundary.

A second scenario injects an Engram HTTP failure and verifies that HTTP/backend diagnostics do not cross the same boundary.

The user confirmed after applying F01-C:

```text
npm run test:mcp   PASS
npm test           PASS
```

---

## 4. Delta falsification

The remediation was reviewed specifically for alternate leakage paths.

### Memory operations

The Application layer contains only the expected direct Memory access points:

```text
shared.mjs
  get / put

change-service.mjs
  list

knowledge-service.mjs
  search
```

All failure paths normalize through `translateMemoryError()` before crossing the Application boundary.

Decision and Evidence services use the shared Application helpers rather than calling Memory directly.

### Persisted-record corruption

Invalid persisted records are translated to canonical `memory_error` with SDD-owned `kind/id` context.

Backend payload/physical diagnostics are not promoted as public error details.

### MCP projection

For `SddError`, MCP emits only:

```text
code
message
details?   # already semantic/Application-owned
```

It never serializes `cause`.

For unexpected non-`SddError` exceptions, MCP emits canonical:

```text
internal_error
Unexpected SDD tool failure
```

without copying the original exception.

### Result

No alternate backend-to-public diagnostic path was found.

**F-01 is RESOLVED.**

---

## 5. Quality gate after remediation

| Area | Gate | Delta audit | Result |
|---|---:|---:|---|
| Code readability | 8.0 | 8.4 | PASS |
| Local simplicity | 8.0 | 8.4 | PASS |
| Architecture fidelity | 8.5 | 8.9 | PASS |
| State correctness | 9.0 | 9.3 | PASS |
| Durability / continuity | 8.5 | 9.0 | PASS |
| Multi-agent/worktree declared model | 8.0 | 8.4 | PASS |
| Product maturity | 7.5 | 7.6 | PASS |

No category is below 7.

The Product maturity score remains intentionally close to the threshold because:

- the package is still private and versioned `0.0.0-development`;
- the repository does not currently provide CI/status-check evidence for HEAD;
- current host/backend coverage is intentionally narrow (Codex + Engram).

Those are acceptable limitations for dogfood. They are not evidence for GA/release maturity.

---

## 6. Residual risks

### F-02 — MINOR

`init` is not fully failure-atomic for arbitrary filesystem I/O failures after preflight.

Disposition:

```text
defer during dogfood
measure whether it produces real installation friction
fix before broader release if evidence justifies it
```

### Declared concurrency limitation

Same-Change simultaneous multiwriter mutation remains unsupported by design.

This is not a defect while runtime and product continue to declare the limitation explicitly.

### Bounded listing

Large projects can produce conservative `complete=false`.

The system must continue treating that as non-exhaustive rather than inventing completeness.

### Product maturity

Dogfood should measure actual overhead, recovery quality and semantic usefulness before expanding host/backend support or release machinery.

---

## 7. Final decision

The original NO-GO condition was:

```text
do not dogfood until F-01 is closed
```

F-01 is now contractually defined, implemented at the correct boundary, covered in Application tests, covered across the real adapter/Application/MCP path, and confirmed by the user's local test run.

There are no remaining BLOCKER or MAJOR findings from the independent audit.

```text
FRESH INDEPENDENT AUDIT   DONE
VERDICT                   GO
DOGFOOD                   NEXT
```

No new architecture iteration is justified before dogfood.

The next work should collect empirical evidence from real SDD usage rather than add preventive machinery.
