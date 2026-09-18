# Decisions

<!-- Maintenance:
     - The `andthen-architecture` skill in `--mode trade-off` auto-registers
       ADRs (appends to Current ADRs; moves prior rows to Superseded on
       supersession). Idempotent on ADR ID.
     - "Still Current" captures load-bearing choices that don't warrant a full
       ADR. Promote via `--mode trade-off` if the choice becomes contested.
     - Status enum (Current ADRs): Proposed | Accepted | Deprecated.
       Superseded decisions move to the dedicated table; Rejected decisions
       stay only in the ADR file itself (not indexed). -->

## Current ADRs

| ID | Title | Status | Scope |
|----|-------|--------|-------|
| ... | ... | ... | ... |

## Superseded

<!-- Move prior rows here when a new ADR supersedes them. Never delete –
     the lineage is load-bearing context for agents reading the codebase. -->

| Prior Decision | Superseded By | Notes |
|----------------|---------------|-------|
| ... | ... | ... |

## Still Current

<!-- Load-bearing decisions that don't warrant a full ADR. One bullet each.
     Format: **<Topic>**: <decision + brief rationale>. -->

- **Architecture decisions live in `docs/adr.md`**: a single combined ADR document (not split per-decision into `docs/adrs/`) covering the system sketch and 3 decisions (rules as data, review pipeline order, append-only control log). Treat it as the ADR source until/unless split.

## Pending

<!-- Decisions under discussion, awaiting acceptance. Typically populated by
     the `andthen-architecture` skill in `--mode trade-off` when a
     recommendation hasn't yet been accepted as an ADR. -->

- ...
