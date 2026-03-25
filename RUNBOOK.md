# RUNBOOK — lattice-ops Operations Order

## 1. Situation

**What this system is:** lattice-ops is the operational intelligence platform for cross-functional program tracking, site health monitoring, AI-driven risk analysis, and structured decision records. It supports leadership decision-making across all operational sites.

**What it protects:** Portfolio visibility, program lifecycle integrity, and the data pipeline that feeds executive decision-making. Loss of this system degrades leadership's ability to track active programs, detect site anomalies, and produce risk assessments.

**What failure looks like:**
- Programs stuck in phase transitions with no visibility into gate blockers
- Site health metrics going stale — anomalies undetected for hours
- AI analysis endpoints returning errors — executives lose risk assessment capability
- Decision audit trail gaps — compliance exposure

**Threat model:** The primary risks are data staleness (connectors failing silently), AI API outages degrading analysis capability, and database corruption affecting the program audit trail.

## 2. Mission

The on-call engineer's mission is to maintain continuous operation of:
1. The program lifecycle engine (phase gates must function — programs cannot be stuck)
2. The metrics pipeline (site health data must flow — anomalies must be detected)
3. AI analysis endpoints (risk assessments and briefs must be available within SLA)
4. The decision audit trail (records must be durable and queryable)

**SLA targets:**
- API uptime: 99.9%
- Metrics pipeline latency: < 5 minutes from source to dashboard
- AI analysis response: < 30 seconds
- Recovery time objective (RTO): 15 minutes for Tier 1 incidents

## 3. Execution

### Incident: Metrics Connector Failure

**Detection:** Missing data points in `metrics` table; alert fires when a source hasn't reported in > 15 minutes.

**Response:**
1. Check connector logs: `docker logs lattice-ops-api-1 2>&1 | grep "connector"`
2. Verify upstream availability (ServiceNow, sensor APIs)
3. If upstream is down: acknowledge alert, set expected recovery time
4. If connector bug: restart the API service, check for error patterns
5. Backfill: re-run the connector with `--backfill --since <last_good_timestamp>`

### Incident: AI API Outage (Anthropic)

**Detection:** `/api/ai/*` endpoints returning 5xx; cache misses increasing.

**Response:**
1. Check Anthropic status page
2. Cached results remain available — no immediate impact for repeat queries
3. If outage > 30 minutes: enable fallback messaging on AI endpoints ("Analysis temporarily unavailable — using cached data from [timestamp]")
4. Do NOT disable the cache — it's the resilience layer
5. Monitor cache expiry — if outage exceeds TTL (24h), escalate

### Incident: Database Unavailable

**Detection:** Health check fails; connection pool errors in logs.

**Response:**
1. Check PostgreSQL status: `docker exec lattice-ops-postgres-1 pg_isready`
2. Check disk space: pgdata volume at > 90% triggers compaction
3. If connection pool exhaustion: restart API, investigate connection leaks
4. If data corruption: restore from latest backup, verify `ai_analyses` cache integrity
5. Check replication lag if running replicas

### Incident: OPA Gate Failure in CI

**Detection:** PR blocked by `conftest verify` failure.

**Response:**
1. Read the deny message — it tells you exactly which policy failed and why
2. If program-gate: fix the seed/fixture data (missing target_date or budget)
3. If ai-output: check that test fixtures include `evidenceMissing` field
4. Do NOT bypass the gate — fix the data quality issue

## 4. Admin / Logistics

### Credential Rotation

| Credential | Location | Rotation Cadence |
|-----------|----------|-----------------|
| ANTHROPIC_API_KEY | Environment / secrets manager | 90 days |
| DATABASE_URL | Environment / secrets manager | 90 days |
| SLACK_WEBHOOK_URL | Environment / secrets manager | On compromise |
| JIRA_API_TOKEN | Environment / secrets manager | 90 days |

### Backup Procedures

- **Database:** Automated daily pg_dump to encrypted S3 bucket. Retention: 30 days.
- **AI cache:** Non-critical — rebuilds automatically on cache miss. No backup required.
- **Decision records:** Included in database backup. Additionally exported to markdown weekly via `pnpm decision:export`.

### Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| API response time (p95) | > 2s | > 5s |
| Metrics pipeline lag | > 10 min | > 30 min |
| Database connection pool | > 80% | > 95% |
| AI cache hit rate | < 50% | < 20% |
| Disk utilization | > 80% | > 90% |

## 5. Command / Signal

### Escalation Path

1. **L1 — On-call engineer:** API restarts, connector restarts, known incident playbooks
2. **L2 — Platform lead:** Database issues, infrastructure changes, policy exceptions
3. **L3 — Engineering director:** Data loss scenarios, extended outages, compliance incidents

### Communication Channels

| Channel | Purpose |
|---------|---------|
| #ops-incidents (Slack) | Active incident coordination |
| #ops-platform (Slack) | Day-to-day platform discussion |
| JIRA project: OPS | Ticket tracking for all operational issues |
| PagerDuty service: lattice-ops | Automated alerting and on-call routing |

### Reporting

- **Daily:** Automated dashboard scorecard posted to #ops-platform at 09:00
- **Weekly:** Portfolio health summary to leadership (generated via `/api/dashboard/scorecard`)
- **On incident:** Post-mortem within 48 hours, filed in JIRA with root cause and prevention actions
