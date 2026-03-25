# Architecture Decision Records

## ADR-001: Monorepo over Microservices

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
We need a repository structure for a multi-component operational intelligence platform. The system has five distinct capabilities (program tracking, ops intelligence, AI analysis, decision records, API gateway) that share types and data models.

### Options Considered

#### Microservices (separate repos)
- **Pros:** Independent deployment, clear ownership boundaries, language flexibility
- **Cons:** Coordination overhead at this stage, shared type drift, harder to refactor across boundaries

#### Monorepo (pnpm workspaces)
- **Pros:** Single source of truth for types, atomic refactors, simple CI, fast iteration
- **Cons:** Build times grow with scale, harder to enforce isolation

### Decision
Monorepo with pnpm workspaces.

### Rationale
Operational velocity trumps deployment isolation at this stage. The system is pre-production and changes cross package boundaries frequently. A monorepo lets us move fast with shared types and atomic commits.

### Trade-offs
Accept coupling risk in exchange for iteration speed. Will revisit when team size > 5 or deployment cadence diverges between packages.

---

## ADR-002: PostgreSQL + pgvector over Dedicated Vector DB

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
The AI layer requires vector storage for RAG embeddings. The rest of the system requires relational storage for programs, decisions, and metrics.

### Options Considered

#### PostgreSQL + pgvector
- **Pros:** Single operational dependency, mature ecosystem, good enough for < 1M chunks, familiar ops model
- **Cons:** Not specialized for vector workloads, limited ANN algorithm options

#### PostgreSQL + Pinecone
- **Pros:** Purpose-built vector DB, managed scaling, fast similarity search
- **Cons:** Two databases to operate, additional cost ($70/mo+), data sync complexity, vendor lock-in

### Decision
PostgreSQL + pgvector.

### Rationale
Operational simplicity outweighs specialized performance at current scale. One database to backup, monitor, and maintain. pgvector's ivfflat index handles our expected volume (< 100K chunks initially).

### Trade-offs
Accept slower vector queries at scale in exchange for single-dependency operations. Migration path to dedicated vector DB is clean — embeddings table is self-contained.

---

## ADR-003: In-Process Cache with DB Fallback

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
AI analysis calls are expensive ($0.01–0.05 per call) and slow (2–10s). Identical inputs should return cached results.

### Options Considered

#### Redis cache
- **Pros:** Shared across instances, persistent across restarts, TTL built-in
- **Cons:** Additional infrastructure dependency, network latency on cache reads

#### In-memory cache with DB fallback (ai_analyses table)
- **Pros:** Zero additional dependencies, fastest possible cache reads, DB provides persistence
- **Cons:** Cache is per-process (not shared across instances)

### Decision
In-memory AnalysisCache with SHA-256 keyed entries, 24h TTL. ai_analyses table in PostgreSQL for persistence across restarts.

### Rationale
Redis adds operational complexity before it's needed. Single-process deployment means no cache sharing required yet. The DB table provides restart durability. The AnalysisCache interface is pluggable — swap to Redis when horizontal scaling demands it.

### Trade-offs
Accept per-process cache isolation. When we scale to multiple API instances, cache misses will increase until Redis is added.

---

## ADR-004: BLUF Brief Format

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
The AI layer generates executive briefs for leadership. We need a structured output format that conveys urgency and decision-required actions clearly.

### Options Considered

#### McKinsey Pyramid (situation-complication-resolution)
- **Pros:** Familiar to consultants and MBA-trained executives, good for persuasion
- **Cons:** Buries the action item, optimized for slide decks not operational tempo

#### BLUF (Bottom Line Up Front)
- **Pros:** Decision-required item is the first thing read, optimized for high-tempo operations, verb-led opening forces clarity
- **Cons:** Less familiar outside military/government contexts

### Decision
BLUF format. Brief always starts with a verb: "Approve...", "Decide...", "Unblock...", "Note..."

### Rationale
Defense technology leadership operates at high tempo. The person reading this brief needs the action item in the first sentence, not the third paragraph. BLUF is DoD communication doctrine — the audience will recognize and respect it.

### Trade-offs
May require onboarding for team members unfamiliar with the format. The verb-led constraint makes the system prompt more rigid but produces more actionable output.

---

## ADR-005: Phase Gate Hard Enforcement

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
Programs move through a 5-phase lifecycle. We need to decide whether phase transitions should be enforced (hard gates) or advisory (soft warnings).

### Options Considered

#### Soft warnings
- **Pros:** Flexible, won't block progress, easier to adopt
- **Cons:** Warnings get ignored, audit trail integrity degrades, "we'll fix it later" culture

#### Hard gates
- **Pros:** Enforces data quality, creates reliable audit trail, prevents garbage-in/garbage-out
- **Cons:** Can block progress if gate criteria are too strict, requires upfront discipline

### Decision
Hard gates. Phase transitions fail with validation errors if criteria aren't met.

### Rationale
Soft warnings were rejected because they create an unreliable audit trail. If a program can advance to "executing" without a target date or budget, every downstream analysis (AI risk scores, portfolio health, schedule pressure) is built on incomplete data. The cost of blocking a premature transition is low — the cost of acting on bad data is high.

### Trade-offs
Teams must complete gate criteria before advancing. This front-loads work but ensures every program in "executing" has a target date, budget, and milestones — which makes portfolio-level analysis trustworthy.

---

## ADR-006: OPA in CI vs. Runtime

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
We need policy enforcement for data quality (program gate criteria in fixtures) and AI output validation (anti-fabrication checks). This can happen at CI time or at runtime.

### Options Considered

#### Runtime enforcement (middleware)
- **Pros:** Catches violations in real-time, can block bad data at the API boundary
- **Cons:** Adds latency to every request, harder to test, policy changes require deployment

#### CI enforcement (conftest)
- **Pros:** Shift-left — catch violations before merge, policy changes are PRs, fast feedback loop
- **Cons:** Only catches what's in the test fixtures/seed data, doesn't enforce at runtime

### Decision
OPA in CI via conftest. Policies run on every PR against seed data and test fixtures.

### Rationale
Shift-left on policy enforcement. The program-tracker already enforces gate criteria at runtime — OPA in CI catches regressions in seed data and test fixtures that would otherwise silently degrade test reliability. Runtime enforcement is the program-tracker's job; CI enforcement is the policy engine's job.

### Trade-offs
Runtime violations in production data aren't caught by OPA — they're caught by the program-tracker's gate validation. OPA covers the test/fixture layer.

---

## ADR-007: nock for Test Isolation

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
The AI layer calls the Anthropic API. Tests must be fast, deterministic, and runnable without an API key.

### Options Considered

#### Real API calls with VCR-style recording
- **Pros:** Tests against real responses, high fidelity
- **Cons:** Requires API key in CI, recorded cassettes drift from actual API, slow

#### nock HTTP interceptors
- **Pros:** Zero network calls, deterministic, fast, no secrets in CI
- **Cons:** Mock responses may diverge from real API format over time

### Decision
nock for all Claude API calls. Zero real network calls as a hard constraint, not a preference.

### Rationale
CI must run without secrets. Test determinism is non-negotiable — flaky tests from network issues waste more engineering time than maintaining mock responses. The structured output schema is defined in our prompts, so we control the response format.

### Trade-offs
Mock responses may diverge from actual API behavior. Mitigated by: (1) structured JSON output with explicit schemas, (2) periodic manual verification against real API, (3) nock interceptors validate request format.

---

## ADR-008: UUID[] for Milestone Blockers

**Status:** Accepted
**Decided by:** ops-lead
**Date:** 2026-03-25

### Situation
Milestones can block other milestones within a program. We need to model this dependency relationship.

### Options Considered

#### Junction table (milestone_dependencies)
- **Pros:** Normalized, standard relational pattern, easy to query both directions
- **Cons:** Extra table, extra joins, more complex queries for a rarely-updated relationship

#### UUID[] array column (blocked_by)
- **Pros:** Single column, read-friendly, no joins for the common case (check if blocked)
- **Cons:** Denormalized, harder to query "what does this milestone block?", no FK enforcement

### Decision
UUID[] array on the milestones table for `blocked_by`.

### Rationale
The blocker relationship is read-heavy and rarely updated. The common query is "is this milestone blocked?" — an array contains check is O(n) on a small array. The reverse query ("what does this block?") is uncommon and handled in application code. A junction table adds complexity for a relationship that rarely exceeds 3–5 entries per milestone.

### Trade-offs
No referential integrity on blocker IDs at the database level. Application code validates blocker existence. Accept this for the simplicity of the common-case query.
