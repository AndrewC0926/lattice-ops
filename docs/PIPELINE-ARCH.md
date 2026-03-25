# Pipeline Architecture: Scrappy to Scalable

This document describes the data ingestion spectrum — from ad-hoc Excel exports to automated anomaly detection pipelines. The architecture supports operating at every tier simultaneously, because real operations don't wait for the ideal system to be built.

## The Spectrum

```
Tier 1 (Scrappy)          Tier 2 (Structured)          Tier 3 (Scalable)
─────────────────         ──────────────────          ─────────────────
Excel/CSV paste     →     REST API connectors    →    Scheduled pipelines
Manual upload       →     ServiceNow, Jira       →    BullMQ job queues
Zero infra needed   →     API keys + config      →    Redis + workers
Minutes to start    →     Hours to configure     →    Days to build
```

## Tier 1: Scrappy (ManualCSVIngester)

**When to use:** You have an Excel spreadsheet with operational data and you need it in the system today. No API, no automation, no infrastructure.

**How it works:**
1. Export from Excel/Google Sheets as CSV
2. POST the CSV content to the ingestion endpoint (or call `ManualCSVIngester.parse()` directly)
3. Data is normalized to `Metric[]` schema and stored

**Required columns:** `metric_key`, `metric_val`
**Optional columns:** `site_id`, `program_id`, `unit`, `recorded_at`

**Why this matters:** The job description says "scrappy, ad hoc Excel data crunching." This is that. It works today, with zero infrastructure, and the output feeds the same anomaly detection pipeline as the automated connectors.

```typescript
const ingester = new ManualCSVIngester();
const metrics = ingester.parse(csvString, 'excel_export');
// → Metric[] ready for storage and analysis
```

## Tier 2: Structured (REST Connectors)

**When to use:** You have a recurring data source with an API. You want structured, repeatable ingestion.

**Current connectors:**
- **ServiceNowConnector** — pulls facilities ticket data (open count, MTTR, category breakdown)
- More connectors follow the same pattern: fetch → normalize to `Metric[]` → store

**How it works:**
1. Configure connector with base URL and credentials
2. Call `toMetrics(siteId, summary)` to get normalized metrics
3. Feed into the same pipeline as Tier 1 data

**Adding a new connector:**
1. Create a class with a `toMetrics()` method returning `Metric[]`
2. Use the `source` field to identify the data origin
3. All downstream analysis (anomaly detection, dashboards) works automatically

## Tier 3: Scalable (Automated Pipelines)

**When to use:** Data volume or freshness requirements exceed what manual/polling approaches can handle.

**Architecture (future state):**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Sources    │────▶│  BullMQ Jobs │────▶│  PostgreSQL   │
│              │     │              │     │  + pgvector   │
│ ServiceNow   │     │ Scheduled    │     │              │
│ Jira         │     │ connectors   │     │ metrics      │
│ Sensors      │     │ every 5min   │     │ ai_analyses  │
│ CSV uploads  │     │              │     │ embeddings   │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                    ┌─────────────┴────────────┐
                                    │                          │
                              ┌─────▼─────┐            ┌──────▼──────┐
                              │  Anomaly   │            │  pgvector   │
                              │  Detector  │            │  RAG Store  │
                              │  (z-score) │            │  (1536-dim) │
                              └─────┬──────┘            └─────────────┘
                                    │
                              ┌─────▼──────┐
                              │   Alerts   │
                              │ Slack/Jira │
                              └────────────┘
```

**Key components:**
- **BullMQ** — job queue backed by Redis for scheduled connector runs
- **Anomaly Detector** — z-score based, fires on values > 2.5 SD from 30-day baseline
- **pgvector RAG store** — 1536-dimensional embeddings for context retrieval in AI analysis
- **Alert pipeline** — anomalies trigger Slack notifications and Jira tickets

## Why This Spectrum Matters

Real operations teams don't have the luxury of building the ideal system before they start tracking data. They start with spreadsheets, graduate to scripts, and eventually build pipelines. This architecture supports all three tiers simultaneously:

- A facilities manager can paste CSV data and see it in the dashboard immediately
- An integration engineer can wire up a new REST connector in a day
- A platform engineer can add scheduled jobs and anomaly alerting when volume demands it

The key insight: **the Metric[] schema is the contract.** Every tier produces the same normalized output. Downstream analysis (anomaly detection, site health scoring, dashboards) doesn't care which tier sourced the data.

## Anomaly Detection

The anomaly detector uses a z-score approach:

1. Compute rolling 30-day mean and standard deviation for each metric key
2. Compare the latest value against the baseline
3. If |z-score| > 2.5, fire an `AnomalyEvent`
4. Severity mapping: > 4.0 = critical, > 3.5 = high, > 3.0 = medium, else low

This is deliberately simple. It catches the obvious outliers (sudden spikes in facility tickets, energy consumption anomalies, utilization drops) without the complexity of ML-based detection. When the data volume justifies it, swap in a more sophisticated detector — the interface stays the same.
