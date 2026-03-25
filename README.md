# lattice-ops

**AI-powered operational intelligence platform for defense-scale facilities and cross-functional program execution.**

This is a portfolio build demonstrating the operational intelligence architecture I'd implement as TPM, Core Operations at Anduril. Every module maps to a specific capability required for the role — from zero-to-one program delivery to scrappy-to-scalable data pipelines.

## Why This Exists

The role demands four pillars of operational capability. Each package maps to one:

| Pillar | Package | What It Does |
|--------|---------|--------------|
| Zero-to-one program delivery | `program-tracker` | 5-phase lifecycle engine with hard go/no-go gates |
| Scrappy-to-scalable analytics | `ops-intelligence` | CSV ingest through anomaly detection pipeline |
| AI-powered leadership support | `ai-layer` | Risk assessments, BLUF briefs, portfolio gap analysis |
| Structured decision-making | `decision-engine` | Architecture Decision Records with options analysis |
| Cross-functional API | `api` | Express REST API wiring all packages + dashboard |

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

# Run all tests (69 tests, zero network calls)
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
