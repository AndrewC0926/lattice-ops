# lattice-ops

Every company hits the moment when growth outpaces operations. Decisions that used to take a hallway conversation now require three meetings and a Slack thread nobody reads. Priorities blur because six teams are blocked on the same facility upgrade and nobody can see the dependency chain. The current answer is a spreadsheet someone emailed last Tuesday — and half the data is already stale. This is the operational intelligence platform I'd build for that inflection point as TPM, Core Operations at Anduril. The name borrows from Lattice OS because the same mesh-network thinking that connects sensors on a battlefield applies to connecting decisions inside a scaling organization.

**Status: Complete — 8 phases, 72 tests, zero network calls in tests, zero `any`**

## How Each Package Maps to the Role

| JD Requirement | Package | What It Proves |
|----------------|---------|----------------|
| *"Drive zero-to-one program delivery for cross-functional operational initiatives"* | `program-tracker` | 5-phase lifecycle with hard go/no-go gates, milestone dependency chains, RAG auto-escalation at 90% budget burn |
| *"Build scrappy-to-scalable data pipelines and analytics"* | `ops-intelligence` | CSV-paste ingest on day one, ServiceNow connector on day thirty, anomaly detection and site health scoring at every tier |
| *"Support leadership decision-making with data-driven analysis"* | `ai-layer` | BLUF executive briefs, risk assessments with mitigation actions, portfolio gap analysis — Claude-powered with deterministic caching |
| *"Establish structured decision frameworks across programs"* | `decision-engine` | MAGTF-style Architecture Decision Records with options analysis, cost estimation, business case generation, and supersede chains |
| *"Own cross-functional coordination across engineering, facilities, and manufacturing"* | `api` | Single REST surface wiring programs, AI analysis, site health, and decisions into one dashboard a VP can read |

## What I'd Do in Week One at Anduril

- **Audit the current state of play.** Walk every site's facilities team — Costa Mesa, Columbus, Huntington Beach, Reston — find out what's tracked in ServiceNow vs. what lives in someone's head, and map the gap between what leadership sees and what's actually happening on the ground.
- **Identify the one decision that's blocked.** There's always a program waiting on a go/no-go that nobody owns. Find it, frame it with two real options and a cost estimate, get the right three people in a room, and drive it to resolution before Friday.
- **Ship a scrappy win.** Stand up a single dashboard view — even if it's pulling from CSV exports — that gives the VP of Facilities one number they don't have today. Trust comes from delivering signal, not from promising a platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / TypeScript (strict) |
| Monorepo | pnpm workspaces |
| Testing | Vitest + nock + supertest |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis (optional, in-memory default) |
| Policy | OPA / Conftest |
| AI | Anthropic Claude API |
| HTTP | Express |

## Local Setup

```bash
# Prerequisites: Docker, Node.js 20+, pnpm 9+

# Start infrastructure
docker-compose up -d

# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run database migrations
pnpm db:migrate

# Run all tests (72 tests, zero network calls)
pnpm test

# Start the API server
pnpm --filter @lattice-ops/api start
```

## Monorepo Structure

```
lattice-ops/
├── packages/
│   ├── shared/                # TypeScript types shared across all packages
│   ├── program-tracker/       # Zero-to-one lifecycle engine (19 tests)
│   ├── ops-intelligence/      # Metrics pipeline + site analytics (16 tests)
│   ├── ai-layer/              # LLM risk, briefs, gap analysis (16 tests)
│   ├── decision-engine/       # ADR + options analysis tooling (9 tests)
│   └── api/                   # Express REST API + dashboard (12 tests)
├── db/
│   └── schema.sql             # PostgreSQL + pgvector schema
├── compliance/
│   └── policies/              # OPA Rego — operational security gates
├── docs/
│   ├── DECISIONS.md           # 8 Architecture Decision Records
│   ├── OPORD-TEMPLATE.md      # Program brief format
│   └── PIPELINE-ARCH.md       # Data flow: scrappy to scalable
├── .github/workflows/
│   └── ci.yml                 # Test + OPA gate on every PR
├── docker-compose.yml
├── RUNBOOK.md
└── README.md
```

## API Endpoints

```
GET  /health                                    Liveness check

# Programs
GET  /api/programs                              List (filter: phase, priority, rag)
POST /api/programs                              Register new program
GET  /api/programs/:id                          Get program detail
POST /api/programs/:id/advance                  Advance phase gate
POST /api/programs/:id/milestones               Add milestone
POST /api/programs/:id/milestones/:mid/complete Complete milestone
PATCH /api/programs/:id/rag                     Update RAG status
POST /api/programs/:id/spend                    Record spend

# AI
POST /api/ai/risk/:programId                    Risk assessment
POST /api/ai/brief/:programId                   Executive brief (BLUF)
POST /api/ai/gaps                               Portfolio gap analysis

# Dashboard
GET  /api/dashboard/posture                     Portfolio health snapshot
GET  /api/dashboard/sites                       All site scorecards
GET  /api/dashboard/drift                       Anomaly events
GET  /api/dashboard/scorecard                   Board-level summary

# Decisions
GET  /api/decisions                             List all decisions
POST /api/decisions                             Record new decision
GET  /api/decisions/due                         Decisions past review date
POST /api/decisions/:id/supersede               Supersede a decision
```

## Test Summary

| Package | Tests | Focus |
|---------|-------|-------|
| program-tracker | 19 | Phase gates, milestones, RAG, portfolio health |
| ops-intelligence | 16 | CSV ingestion, anomaly math, scoring |
| ai-layer | 16 | Mocked API, caching, parsing, error handling |
| decision-engine | 9 | ADR lifecycle, business case, markdown |
| api | 12 | Routes, validation, error shapes |
| **Total** | **72** | **Zero network calls** |
