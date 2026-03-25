-- lattice-ops database schema
-- PostgreSQL 16 + pgvector

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- Sites — physical locations
-- ============================================================
CREATE TABLE sites (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    site_type   TEXT NOT NULL CHECK (site_type IN ('hq', 'manufacturing', 'r_and_d', 'testing', 'field')),
    location    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'planned')),
    sq_footage  INTEGER,
    headcount_cap INTEGER,
    opex_monthly NUMERIC(12, 2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Programs — full lifecycle record
-- ============================================================
CREATE TABLE programs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    phase           TEXT NOT NULL DEFAULT 'framed'
                    CHECK (phase IN ('framed', 'scoped', 'executing', 'scaled', 'closed')),
    rag_status      TEXT NOT NULL DEFAULT 'green'
                    CHECK (rag_status IN ('green', 'amber', 'red')),
    rag_reason      TEXT,
    priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    owner           TEXT NOT NULL,
    stakeholders    TEXT[] NOT NULL DEFAULT '{}',
    target_date     DATE,
    actual_completion_date DATE,
    budget_allocated NUMERIC(12, 2) DEFAULT 0,
    budget_spent    NUMERIC(12, 2) DEFAULT 0,
    ai_risk_score   NUMERIC(3, 2),
    site_id         UUID REFERENCES sites(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Milestones — linked to programs
-- ============================================================
CREATE TABLE milestones (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    due_date    DATE,
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    blocked_by  UUID[] DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Decisions — MAGTF-structured ADRs
-- ============================================================
CREATE TABLE decisions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id          UUID REFERENCES programs(id),
    title               TEXT NOT NULL,
    situation           TEXT NOT NULL,
    options_considered  JSONB NOT NULL DEFAULT '[]',
    decision            TEXT,
    rationale           TEXT,
    trade_offs          TEXT,
    status              TEXT NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed', 'accepted', 'superseded', 'deprecated')),
    superseded_by       UUID REFERENCES decisions(id),
    supersede_reason    TEXT,
    decided_by          TEXT,
    decided_at          TIMESTAMPTZ,
    review_date         DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Metrics — time-series operational data
-- ============================================================
CREATE TABLE metrics (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID REFERENCES sites(id),
    program_id  UUID REFERENCES programs(id),
    metric_key  TEXT NOT NULL,
    metric_val  NUMERIC NOT NULL,
    unit        TEXT,
    source      TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_site_key ON metrics (site_id, metric_key, recorded_at DESC);
CREATE INDEX idx_metrics_program_key ON metrics (program_id, metric_key, recorded_at DESC);

-- ============================================================
-- Alerts — fired anomalies
-- ============================================================
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID REFERENCES sites(id),
    metric_key  TEXT NOT NULL,
    severity    TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    message     TEXT NOT NULL,
    z_score     NUMERIC(6, 3),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    slack_ts    TEXT,
    jira_key    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI Analyses — LLM output cache
-- ============================================================
CREATE TABLE ai_analyses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    input_hash  TEXT NOT NULL,
    capability  TEXT NOT NULL CHECK (capability IN ('risk_assessment', 'executive_brief', 'gap_analysis')),
    input_data  JSONB NOT NULL,
    output_data JSONB NOT NULL,
    model       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_ai_analyses_hash ON ai_analyses (input_hash);

-- ============================================================
-- Embeddings — pgvector store for RAG
-- ============================================================
CREATE TABLE embeddings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type TEXT NOT NULL,
    source_id   UUID NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    content     TEXT NOT NULL,
    embedding   vector(1536),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_source ON embeddings (source_type, source_id);
