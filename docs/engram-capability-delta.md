# SDD V2 — Engram Capability Delta

## 1. Status

**Frontier 5A — capability design**

Target:

```text
Engram v1.20.0
```

Goal:

> Determine the smallest generic Engram capability delta required for Engram to satisfy the reconstructed SDD Memory Contract as a canonical backend, without adding an SDD-specific schema, a parallel file store, or FTS-based workflow state.

This frontier changes **no runtime code**.

It refines the conclusion of `engram-canonical-store-feasibility.md` after inspecting the real Engram store implementation in more detail.

---

## 2. Important correction to Frontier 4

Frontier 4 classified exact logical-key lookup as unavailable through the public surface.

That conclusion was too strong.

Engram v1.20.0 `Store.Search()` contains a direct branch:

```text
if query contains "/":
    SELECT observations
    WHERE topic_key = ?
      AND optional type/project/scope filters
    ORDER BY updated_at DESC
```

Those direct rows receive a strong fixed rank before the FTS path.

Therefore:

```text
exact topic_key lookup
```

**already exists inside the real store implementation**.

What is missing is not the storage capability itself, but a stable explicit contract/surface for callers that need exact semantics.

Revised assessment:

```text
exact get by topic_key:
  storage capability     = YES
  explicit public API    = PARTIAL / indirect
  SDD-safe adapter path  = not yet implemented
```

This matters because the required Engram delta is smaller than Frontier 4 initially estimated.

The remaining hard gaps are still real:

```text
- conditional create / identity conflict
- optimistic concurrency / CAS
- complete structured query without FTS
- append retry/idempotency semantics
```

The last item can likely be derived from conditional create rather than requiring a fifth independent primitive.

---

## 3. Existing Engram primitives we should reuse

Engram already has several useful pieces.

### 3.1 `topic_key`

Current semantics:

```text
project + scope + topic_key
```

identify an evolving topic for upsert.

`AddObservation()`:

```text
topic exists
  -> UPDATE existing observation
  -> revision_count++

topic absent
  -> INSERT observation
```

This is not sufficient for SDD create semantics by itself, but it is a good physical key.

### 3.2 `revision_count`

Every canonical topic update increments:

```text
revision_count
```

It is already returned as observation metadata.

It is not currently a concurrency guard, but it can become the version token for conditional update without adding another column.

### 3.3 SQLite transactions + write retry

Writes run through Engram's transaction helper and retry SQLite busy/locked errors.

This provides a reasonable foundation for atomic conditional writes.

The prototype still has to prove concurrency behavior; it must not assume it.

### 3.4 Exact observation ID

Engram supports:

```text
GET observation by backend ID
mem_get_observation
```

The SDD adapter can retain backend IDs as transport metadata, but SDD identity does not depend on them.

### 3.5 `type`, `project`, `scope`, timestamps

These columns already support deterministic filtering at SQL level.

The current public "recent" endpoint does not expose the complete query contract SDD needs, but the physical data is already there.

---

## 4. Physical mapping strategy

Do not add SDD columns to Engram.

The adapter owns translation.

### 4.1 Canonical SDD record

Conceptual SDD record:

```yaml
id: REC-...
kind: change
project_id: my-project
key: change/CHG-20260818-03
payload: ...
```

Possible Engram mapping:

```text
project   -> project_id
scope     -> project
type      -> adapter-defined stable type for SDD kind
topic_key -> deterministic physical record key
content   -> serialized normalized SDD record
```

Example physical topic key:

```text
sdd/record/<stable-record-id>
```

The topic key is backend representation.

It is not exposed as Change identity.

### 4.2 Stable record ID

For canonical records whose SDD `key` is known, the adapter can derive a stable `record.id` deterministically from:

```text
project_id + kind + key
```

For example using a namespaced UUID/hash.

Consequences:

```text
get(project, kind, key)
  -> derive stable record id
  -> derive exact topic_key
  -> exact lookup
```

No local mapping table is needed.

For historical records such as Decision/Evidence:

```text
record.id
```

is generated before persistence and retained in refs.

### 4.3 `kind`

SDD `kind` may map to stable Engram observation types.

Engram's store does not require SDD to expose those values as domain semantics.

The adapter can choose a reserved physical convention such as:

```text
sdd_change
sdd_decision
sdd_evidence
sdd_knowledge
```

or another safe mapping after verifying Engram type expectations.

This is an adapter detail.

### 4.4 `subject`

Engram has no generic `subject` column.

Do not add one yet.

The current Memory Contract explicitly allows an adapter to retrieve a deterministic complete set and filter some selectors after decoding.

Therefore:

```text
query(project, kind, subject)
```

may initially execute:

```text
backend query(project, mapped-type, paginated)
-> decode records
-> exact filter subject
```

This is acceptable only if the backend query is complete, deterministic and bounded/paginated.

If that proves too expensive in dogfood, adding a generic metadata field/index can be reconsidered later.

---

## 5. Minimal missing capabilities

After source inspection, the candidate delta is **four capabilities**, not five.

---

## 5.1 Capability A — explicit exact topic lookup

### Desired store operation

Conceptually:

```go
GetObservationByTopicKey(project, scope, topicKey)
```

Result:

```text
observation
not_found
ambiguous
```

### Why add it if `Search()` already does exact lookup?

Because SDD should not depend on:

```text
"call the search API with a string containing / and know that an internal exact branch runs first"
```

That is an implementation trick, not a stable contract.

The store already contains almost all SQL needed.

Implementation can extract/refactor the existing exact branch.

### Ambiguous result

Because current schema does not enforce unique `topic_key`, exact lookup must detect multiple active matches.

Do not silently choose "latest" for canonical operations.

For generic memory search, latest-topic behavior may remain unchanged.

For exact record semantics:

```text
>1 active exact rows
  -> ambiguous/conflict
```

This makes legacy anomalies visible rather than hiding them.

---

## 5.2 Capability B — create topic only if absent

### Desired operation

Conceptually:

```go
CreateObservationIfTopicAbsent(params)
```

Precondition:

```text
topic_key != empty
```

Result:

```text
created(observation)
conflict(existing reference)
unavailable/error
```

### Semantics

This operation must **not** inherit normal `mem_save` upsert behavior.

For the exact tuple:

```text
project + scope + topic_key
```

if an active record already exists:

```text
return conflict
```

Do not update it.

### Candidate SQL strategy

A store-layer prototype can attempt an atomic conditional insert using the current transaction/retry machinery.

Example concept:

```sql
INSERT INTO observations (...)
SELECT ...
WHERE NOT EXISTS (
    SELECT 1
    FROM observations
    WHERE topic_key = ?
      AND ifnull(project, '') = ifnull(?, '')
      AND scope = ?
      AND deleted_at IS NULL
);
```

Then:

```text
RowsAffected = 1 -> created
RowsAffected = 0 -> conflict
```

The concurrency test is authoritative.

Do not declare this safe solely from reasoning about SQLite writer serialization.

### No unique-index migration in the first prototype

A global unique index on existing `topic_key` is deliberately not the first choice because:

- historical data may already contain duplicates;
- topic_key currently serves generic evolving-memory semantics;
- forcing uniqueness changes existing Engram behavior;
- migration/deduplication would enlarge the frontier.

If the conditional-insert stress test can produce duplicate creates, stop and reconsider the storage constraint.

At that point a schema-level identity primitive may be necessary.

---

## 5.3 Capability C — conditional update by revision

### Desired operation

Conceptually:

```go
UpdateObservationIfRevision(
    id or exact topic,
    expectedRevision,
    update
)
```

Atomic SQL shape:

```sql
UPDATE observations
SET
    ...,
    revision_count = revision_count + 1,
    updated_at = datetime('now')
WHERE id = ?
  AND revision_count = ?
  AND deleted_at IS NULL;
```

Result:

```text
updated(new observation/new revision)
conflict(current revision/ref)
not_found
```

### Required behavior

If two callers read revision `4`:

```text
A update expected=4 -> revision 5
B update expected=4 -> conflict
```

No last-write-wins success.

### Identity fields

For SDD canonical records, the adapter should not normally mutate the physical identity key during a CAS update.

`topic_key` should be treated as stable for a persisted SDD record.

Generic Engram may still allow topic-key edits through its existing administrative update path.

---

## 5.4 Capability D — structured paginated observation query

### Desired store query

A generic query shape such as:

```text
project       exact
scope         exact
type          exact
topic_key     exact optional
created_from
created_to
updated_from
updated_to
limit
offset/cursor
stable sort
```

Potential later addition:

```text
topic_key_prefix
```

only if demonstrated useful.

### Requirements

The query must be:

```text
deterministic
complete under pagination
not FTS-ranked
project-isolated
bounded
```

SDD then decodes records and can filter selectors that Engram does not index, such as:

```text
subject
payload lifecycle
```

### Public surface

The existing:

```text
GET /observations
```

could be generalized rather than adding an SDD endpoint.

For MCP, a generic read-only tool such as:

```text
mem_query
```

is cleaner than abusing `mem_search` for structured state.

Exact naming remains an Engram API design concern.

---

## 6. Append idempotency does not require a fifth primitive

The Memory Contract requires:

```text
append(record.id = X)
retry same X
-> no duplicate logical record
```

We can implement this through the same physical identity mechanism.

For every historical SDD record:

```text
record.id generated BEFORE write
topic_key = sdd/record/<record.id>
write = create-if-absent
```

Retry after ambiguous network outcome:

```text
create-if-absent
  -> conflict

exact get same topic
  -> decode

same id + same semantic content
  -> idempotent success

same id + incompatible content
  -> conflict
```

Therefore:

```text
append idempotency
=
stable caller record id
+ exact lookup
+ create-if-absent
```

No client-supplied Engram `sync_id` is required for the first design.

This avoids widening Engram's sync identity contract unnecessarily.

---

## 7. Ambiguous write recovery

This is an important consequence of exact topic identity.

Scenario:

```text
SDD sends create
Engram commits
connection/result is lost
```

SDD does not know whether creation occurred.

Recovery:

```text
exact get(topic_key)
```

Results:

### record exists and matches requested stable record id/content

```text
treat write as confirmed/idempotent success
```

### record does not exist

```text
retry create
```

### record exists but semantic identity/content conflicts

```text
conflict
```

No side file or process-local "maybe wrote it" flag is needed.

---

## 8. What does NOT need to change yet

Do not add:

```text
SDD tables
Change columns
subject column
lifecycle column
acceptance column
WorkUnit tables
SDD-specific HTTP routes
SDD-specific MCP tools
new file store
new local index
event sourcing
cloud-specific schema
```

Do not modify SDD CLI/runtime/skills during the Engram primitive spike.

---

## 9. Store-layer viability assessment

### Reuse level

The candidate implementation can reuse:

```text
observations table
topic_key
revision_count
project/scope/type
transactions
SQLite write retry
sync mutation generation
existing exact topic SQL logic
```

That is a strong positive signal.

### Estimated conceptual delta

Store layer:

```text
1 exact getter
1 conditional create
1 conditional update
1 structured query
small sentinel error set
tests
```

No new SDD domain object exists inside Engram.

### Main uncertainty

The main unresolved correctness question is:

> Does conditional create remain one-winner/one-conflict under real concurrent writers using Engram's current SQLite transaction/retry behavior?

That must be measured.

If not, stop.

Do not compensate in the SDD adapter.

---

## 10. Transport strategy

SDD's normal runtime should not require `engram serve`.

Therefore HTTP-only implementation is insufficient for the final integration.

The clean order is:

```text
Engram store primitives
        ↓
prove semantics with store tests
        ↓
MCP generic surface
        ↓
prove same semantics through MCP
        ↓
SDD Engram Adapter
```

HTTP parity can be added independently if useful, but it is not the first requirement for the SDD hot path.

This keeps transport separate from storage correctness.

---

## 11. Candidate MCP delta after store proof

Do not implement during the first store frontier.

Possible generic surface:

### Exact read

Either extend:

```text
mem_get_observation
```

to accept an exact `topic_key + project + scope`

or add a generic exact-topic read tool.

### Conditional create

Extend `mem_save` with an explicit mode/precondition such as:

```text
write_mode = create_if_absent
```

Normal behavior remains backward-compatible upsert.

### CAS update

Extend `mem_update` with:

```text
expected_revision
```

When provided:

```text
revision mismatch -> conflict
```

Without it, existing manual/admin update behavior can remain unchanged.

### Structured query

Add:

```text
mem_query
```

read-only, paginated, no FTS.

This is preferable to making `mem_search` carry two incompatible meanings.

Exact naming should follow Engram maintainers' conventions if upstreamed.

---

## 12. Capability versioning

SDD cannot merely require:

```text
Engram installed
```

It will require a capability level.

Conceptually:

```text
engram:
  exact_topic_get: true
  conditional_create: true
  conditional_update: true
  structured_query: true
```

The final detection mechanism can be:

- Engram version floor;
- explicit capabilities endpoint/tool;
- adapter startup probe.

Prefer explicit capability detection if Engram gains such mechanism.

Do not parse human CLI output to infer correctness.

---

## 13. Engram sync/cloud boundary

Engram is local-first and can optionally replicate through sync.

The first canonical-store proof targets:

```text
one authoritative local Engram store
multiple local processes/agents/worktrees
```

Do not claim cross-machine canonical concurrency yet.

Before enabling canonical SDD records across Engram cloud replication, separately test:

- record identity preservation;
- concurrent remote mutation behavior;
- revision conflict semantics after sync;
- duplicate/conflict handling;
- causal order expectations.

This is outside the current quality gate for local multi-agent/worktree correctness.

The adapter must advertise/assume only capabilities actually proven.

---

## 14. Required store tests

The next code frontier is not "implement four methods and see if tests pass."

Tests are defined first.

### E1 — exact topic lookup

```text
create topic T
get exact T
-> same observation
```

No FTS path required.

### E2 — not found

```text
get exact unknown T
-> not_found
```

### E3 — ambiguous legacy topic

Given two active rows with same exact topic tuple:

```text
exact get
-> ambiguous
```

Never silently latest.

### E4 — conditional create sequential

```text
create-if-absent T -> success
create-if-absent T -> conflict
```

### E5 — conditional create concurrent

Two independent goroutines/connections attempt same topic repeatedly.

For each iteration:

```text
success count = 1
conflict count = 1
active exact rows = 1
```

Run enough iterations to make race behavior meaningful.

### E6 — CAS sequential

```text
read rev 1
update expected 1 -> rev 2
update expected 1 -> conflict
```

### E7 — CAS concurrent

Two writers with same starting revision:

```text
exactly one update wins
other receives conflict
```

### E8 — structured query completeness

Create records across:

```text
projects
types
scopes
timestamps
```

Paginate and prove the concatenated result is complete and duplicate-free.

### E9 — no FTS dependency

Break/disable the FTS path in the test context if practical.

Exact get/query/conditional writes must still pass.

### E10 — existing Engram semantics regression

Existing:

```text
mem_save/topic_key upsert
normal UpdateObservation
search
recent observations
```

must retain current behavior.

The new canonical primitives are additive.

---

## 15. Files for the next implementation frontier

Do not touch the SDD repo implementation yet.

The next experimental code should be against Engram v1.20.0 source/fork.

Maximum active files:

```text
internal/store/store.go
internal/store/store_test.go
```

If existing store tests are too large to isolate the cases cleanly, a dedicated new test file may replace `store_test.go`:

```text
internal/store/canonical_write_test.go
```

but still keep the frontier to two files.

No MCP changes in the same frontier.

No HTTP changes.

No SDD adapter.

No docs sweep.

---

## 16. Acceptance gate for Engram store prototype

Proceed to MCP surface only if all are true:

```text
[ ] exact topic get does not use FTS
[ ] duplicate exact topics are surfaced as ambiguity
[ ] create-if-absent is atomic under concurrency tests
[ ] CAS prevents lost update under concurrency tests
[ ] structured query is complete under pagination
[ ] no schema migration was required OR any required migration is explicitly justified
[ ] existing Engram upsert/update behavior remains compatible
```

If conditional create cannot be proven without a storage uniqueness primitive:

```text
STOP
```

Then compare:

```text
A. add a generic schema-level record identity to Engram
B. choose another canonical backend
```

Do not move the race into SDD.

---

## 17. Revised capability matrix

| Capability | v1.20.0 today | Delta |
|---|---:|---|
| durable local persistence | PASS | none |
| backend ID exact get | PASS | none |
| exact topic lookup | **PARTIAL** | expose/refactor explicit exact getter |
| create-if-absent | FAIL | new conditional store operation |
| revision token | PASS metadata | enforce as CAS precondition |
| lost-update prevention | FAIL | conditional update |
| structured project/type query | PARTIAL | paginated exact query |
| append idempotency | FAIL directly | derive from stable record id + create-only |
| FTS semantic search | PASS | keep optional |
| project isolation | PASS | retain |
| local multi-process target | unproven | concurrency test |
| cloud/multi-machine canonical semantics | unproven | defer |

---

## 18. Decision

### Viability

**Path A remains viable.**

After source inspection, Engram does not appear to need an SDD-specific subsystem or a second database to become a plausible canonical backend.

The smallest credible direction is:

```text
Engram existing observation model
    +
explicit exact topic access
    +
conditional create
    +
conditional revision update
    +
structured paginated query
```

This is materially smaller than building an SDD canonical store from scratch.

### Important constraint

"Viable" is not "approved."

The concurrency tests are the hard gate.

Until those pass:

```text
Engram remains candidate canonical backend
not proven canonical backend
```

---

## 19. Next frontier

**Frontier 5B — Engram store primitive prototype**

Only:

```text
internal/store/store.go
internal/store/<focused test file>.go
```

Objective:

> Prove or falsify exact-get, create-if-absent, CAS and structured query semantics directly at the Engram store layer.

No SDD product code yet.

No MCP surface yet.

No runtime/CLI/skills.

If this passes, Frontier 5C exposes the proven primitives generically through MCP.

If it fails, the failure determines whether Engram needs a schema-level identity addition or should be rejected as SDD's canonical backend.
