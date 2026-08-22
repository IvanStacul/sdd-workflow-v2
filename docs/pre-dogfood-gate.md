# SDD V2 — Pre-dogfood Product Gate

## Status

```text
Block C — Pre-dogfood Product Gate    PASS
Fresh independent audit              NEXT
DOGFOOD                              PENDING
```

This document records the evidence used to close Block C for the reconstructed Alpha
candidate. It is not a new architecture or workflow authority.

Evaluated code baseline:

```text
8d8b490360558b7b146367a329de5052b2bad44e
fix(api): enforce bounded open Change listing
```

## Gate contract

The gate is evaluated against `docs/rebaseline-architecture.md` and the frozen product
architecture:

```text
C1 structural/static architecture audit
C2 real Codex + MCP discovery/invocation
C3 end-to-end conformance
C4 failure boundaries
C5 qualitative product gate
```

Only after this gate passes may the product proceed to a fresh independent audit.

---

## C1 — Structural/static architecture audit

**Result: PASS**

Verified:

- one durable authority;
- Domain contains no Engram/MCP/Codex semantics;
- Application remains transport/backend agnostic;
- MCP delegates semantic operations to Application instead of reimplementing domain rules;
- Codex host is bootstrap/wiring only;
- project binding contains no current workflow state;
- Runtime Projection promises only implemented capabilities;
- no active obsolete semantic-api experiment;
- zero mandatory SDD skills.

Active product layering remains:

```text
Host / Harness
-> Runtime Projection
-> MCP Transport
-> Application API
-> Domain Model
-> Memory Port
-> Engram Repository
-> Engram
```

Non-blocking structural observation:

- `src/transports/mcp/tools.mjs` is comparatively large because it owns the 15 public tool
  schemas and registrations. The semantic rules remain below the transport, so no refactor
  was justified solely for file size.

---

## C2 — Real Codex transport discovery/invocation

**Result: PASS**

Environment exercised:

```text
OS: Windows
Codex CLI: 0.149.0
Project: disposable sdd-v2-conformance
Backend: real Engram 1.20.0 container
```

Observed from real Codex:

- project-scoped `[mcp_servers.sdd]` was discovered;
- server `sdd` was enabled;
- exactly 15 public SDD tools were visible;
- no Engram primitives (`mem_save`, `topic_key`, observation/session primitives) appeared as
  the SDD API;
- Codex selected `sdd_change_list` autonomously and executed a real MCP query.

### Finding discovered during C2

Codex initially attempted:

```text
sdd_change_list({limit: 100})
```

The public MCP/Application contract allowed the value while the Engram repository supported
a maximum bounded list of 20, surfacing an incorrect `memory_error`.

The product was corrected so the first-Alpha public bound is explicitly:

```text
limit: 1..20
```

The fix is commit:

```text
8d8b490 fix(api): enforce bounded open Change listing
```

Retest:

```text
limit=100
-> MCP -32602 validation rejection

limit=20
-> success
```

This is considered a successfully closed gate finding, not an open defect.

A local Codex CLI PATH issue was also encountered during setup. The installed executable
worked directly and the issue was classified as an environment prerequisite, not an SDD
product defect.

---

## C3 — End-to-end conformance

**Result: PASS**

### Continuity and recovery

Created open Change:

```text
CHG-01M0KQC211F0QM4VR4XQQQEHM6
```

with acceptance and actionable frontier.

A genuinely new Codex session recovered it using only exact ID:

```text
sdd_change_get
```

No list/search reconstruction was required.

### Independent Evidence and evidence-backed closure

Recorded:

```text
EVD-01M0KQHHDQQ0DYK23DSQREV0A4
```

for acceptance `A1`.

The Change was closed `completed` using the Evidence by reference. Exact readback confirmed:

```text
lifecycle = closed
close.reason = completed
evidence_refs = [EVD-01M0KQHHDQQ0DYK23DSQREV0A4]
continuity = absent
```

### Direct receipt

Created direct completed receipt:

```text
CHG-01M0KQRQN317889EANCKHQXSR6
```

It was born `closed/completed` with embedded structured Evidence and no retroactive
continuity ceremony.

### Scope evolution / spawn

Origin:

```text
CHG-01M0KQTS73NMS9P447E68ME0KW
```

Child:

```text
CHG-01M0KQW6G1EXDMVB5XAA5FE43V
```

Codex autonomously chose `sdd_change_spawn` when a new material intent was explicitly outside
the origin scope.

Readback confirmed:

- origin remained open and unchanged;
- child remained open;
- child contains `spawned_from = origin`;
- origin contains no inverse relation added by spawn.

### Dependency

The child was made dependent on the origin.

Readback confirmed:

```text
child.depends_on = [origin]
```

and the target contained no persisted `blocks` inverse.

### Decision

Recorded and exactly recovered:

```text
DEC-01M0KR426BSVFVQ2TY74XDZBTS
```

The Decision preserved material scope-evolution rationale independently of the Change.

### Knowledge

Promoted:

```text
KNW-01M0KR7A3QFEFH9VDJCWFMJ1B3
```

with Decision/Change source refs.

Knowledge discovery without known record IDs succeeded after a compact semantic query.

Non-blocking observation:

- a first, longer semantically correct search returned zero items;
- a shorter equivalent query found the Knowledge.

`searchKnowledge` is explicitly approximate discovery, so this does not falsify an exactness
guarantee. It remains a product-maturity observation for dogfood.

### Independent Changes

Using GPT-5.6 Luna, Codex independently created:

```text
CHG-01M0KRB1RD0NP535DXJXZASZR0  PDF
CHG-01M0KRB2PB7KZFKQXB4V4G2NKW  CSV
```

Both were open, independent and relation-free.

`listOpenChanges(limit=20)` returned four open Changes with:

```text
complete = true
```

demonstrating coexistence/enumeration of independent Changes.

### Ephemeral

Using GPT-5.6 Luna, Codex:

1. created `ephemeral-check.txt`;
2. verified exact content;
3. deleted it;
4. invoked zero SDD write tools.

This confirms that trivial work can complete with zero durable SDD writes.

### Model coverage

Most C2/C3 scenarios were exercised with GPT-5.6 Sol high.

The final conformance scenarios (independent Changes and ephemeral behavior) and all C4
failure-boundary scenarios were exercised with GPT-5.6 Luna to reduce the risk of validating
only with the strongest model used during the session.

---

## C4 — Failure boundaries

**Result: PASS**

### Engram unavailable

With the Engram container stopped:

```text
sdd_change_get
-> ok=false
-> error.code=memory_unavailable
```

No cached/phantom success was returned.

After restarting Engram, exact readback recovered the same existing Change and frontier
unchanged.

### Non-exhaustive enumeration

With:

```text
sdd_change_list({limit: 1})
```

the product returned:

```text
items.length = 1
complete = false
```

and the agent correctly refused to interpret the item as the complete open-Change set.

### Invalid mutation → zero write

Attempted an invalid frontier:

```text
frontier.next = ""
```

MCP rejected it with `-32602` before mutation.

Exact readback showed the previous frontier remained unchanged.

### Host configuration conflict → fail closed

A disposable project contained a user-owned:

```toml
[mcp_servers.sdd]
command = "user-owned-sdd"
args = ["serve"]
```

`init` failed with:

```text
Existing user-owned [mcp_servers.sdd] conflicts with the managed SDD MCP block
```

Post-condition:

```text
.sdd/config.json   absent
AGENTS.md          unchanged
.codex/config.toml unchanged
```

No partial bootstrap was left behind.

---

## C5 — Quality gate

**Result: PASS**

| Area | Gate | Assessment | Result |
|---|---:|---:|---|
| Code readability | 8.0 | 8.4 | PASS |
| Local simplicity | 8.0 | 8.1 | PASS |
| Architecture fidelity | 8.5 | 9.4 | PASS |
| State correctness | 9.0 | 9.5 | PASS |
| Durability / continuity | 8.5 | 9.3 | PASS |
| Multi-agent / worktree declared model | 8.0 | 8.5 | PASS |
| Product maturity | 7.5 | 7.8 | PASS |

No category is below 7.

### Rationale

**Code readability — 8.4**

- semantic names and explicit services;
- strict input/domain validators;
- error taxonomy is explicit;
- responsibilities are discoverable from directory structure.

Deductions:

- `domain/change.mjs`, `transports/mcp/tools.mjs`, and the Engram repository are sizeable;
- some schema/validation information is repeated at the transport boundary.

**Local simplicity — 8.1**

Strengths:

- only two runtime dependencies;
- tiny project binding;
- one runtime projection;
- zero mandatory SDD skills;
- no REST/service layer, roadmap engine, WorkUnit state, session state, or local durable mirror.

Deductions:

- Docker-exec HTTP transport and Engram reconciliation add unavoidable adapter complexity;
- MCP tool registration is centralized in one relatively large file.

No refactor is required before dogfood because these files remain cohesive and the current
complexity maps to real responsibilities.

**Architecture fidelity — 9.4**

Real code and real harness behavior match the frozen layer boundaries. The C1 audit and C2
tool-surface test found no backend/domain or host/domain leakage.

**State correctness — 9.5**

Supported by:

- strict schemas;
- validate-before-side-effects behavior;
- exact acceptance coverage;
- relation validation;
- immutable Decision/Evidence semantics;
- bounded enumeration with declared completeness;
- read-after-write confirmation/reconciliation;
- negative MCP mutation test;
- host bootstrap fail-closed test.

**Durability / continuity — 9.3**

Supported by:

- real Engram;
- exact cross-session recovery;
- restart recovery;
- explicit `memory_unavailable`;
- evidence-backed completed closure;
- direct receipt behavior;
- no side-state authority.

**Multi-agent / worktree declared model — 8.5**

The supported model was exercised:

```text
independent Changes in parallel-compatible state
sequential same-Change handoff
```

Same-Change concurrent writers remain explicitly unsupported. The score does not assume CAS,
locks, or merge semantics the product does not claim.

**Product maturity — 7.8**

The product has crossed from architectural prototype to a real conformance-tested Alpha
candidate, but remains intentionally early.

Current maturity deductions:

- only Codex is validated as host;
- only Engram is implemented as repository;
- Docker-backed transport remains environment-specific;
- conformance evidence is currently manual rather than an automated evaluator suite;
- Knowledge search showed query-form sensitivity;
- same-Change concurrent writers are outside the current support model;
- package remains `0.0.0-development` and private.

None of these contradict the first-Alpha contract.

---

## Block C verdict

```text
C1 Structural/static audit            PASS
C2 Real Codex + MCP                    PASS
C3 End-to-end conformance              PASS
C4 Failure boundaries                  PASS
C5 Quality gate                        PASS

BLOCK C                                PASS
```

No additional product refactor is justified before the independent audit.

Open observations to carry forward, not pre-dogfood blockers:

1. Knowledge search sensitivity to query formulation.
2. MCP tool registration and Engram repository are the largest cohesive local modules.
3. Docker/Codex are the only production host/backend path proven so far.
4. Current conformance execution is manually evidenced rather than packaged as an eval suite.

## Next gate

The next action is intentionally **not another implementation iteration**:

```text
fresh-chat independent audit
-> GO / NO-GO
-> DOGFOOD only on GO
```

The independent auditor should treat this document as evidence, but must independently inspect
the active source/contracts and reject any claim not supported by code or the recorded
conformance observations.
