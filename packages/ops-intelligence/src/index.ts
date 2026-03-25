import type { Metric, AnomalyEvent, SiteHealthReport, SiteScorecard } from '@lattice-ops/shared';

// ============================================================
// Manual CSV Ingester — the "scrappy" tier
// ============================================================

export class ManualCSVIngester {
  parse(csv: string, source: string = 'csv_import'): Metric[] {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must contain a header row and at least one data row');

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

    const required = ['metric_key', 'metric_val'];
    for (const r of required) {
      if (!headers.includes(r)) throw new Error(`Missing required column: ${r}`);
    }

    const metrics: Metric[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      const val = parseFloat(row['metric_val']);
      if (isNaN(val)) throw new Error(`Invalid metric_val on row ${i + 1}: "${row['metric_val']}"`);

      metrics.push({
        siteId: row['site_id'] || undefined,
        programId: row['program_id'] || undefined,
        metricKey: row['metric_key'],
        metricVal: val,
        unit: row['unit'] || undefined,
        source,
        recordedAt: row['recorded_at'] ? new Date(row['recorded_at']) : new Date(),
      });
    }

    return metrics;
  }
}

// ============================================================
// ServiceNow Connector — structured tier
// ============================================================

export interface ServiceNowTicketSummary {
  openCount: number;
  mttr: number; // mean time to resolve in hours
  categoryBreakdown: Record<string, number>;
}

export class ServiceNowConnector {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://instance.service-now.com') {
    this.baseUrl = baseUrl;
  }

  /** Convert ticket data into normalized metrics */
  toMetrics(siteId: string, summary: ServiceNowTicketSummary): Metric[] {
    const now = new Date();
    const metrics: Metric[] = [
      {
        siteId,
        metricKey: 'facility_tickets_open',
        metricVal: summary.openCount,
        unit: 'count',
        source: 'servicenow',
        recordedAt: now,
      },
      {
        siteId,
        metricKey: 'facility_mttr',
        metricVal: summary.mttr,
        unit: 'hours',
        source: 'servicenow',
        recordedAt: now,
      },
    ];

    for (const [category, count] of Object.entries(summary.categoryBreakdown)) {
      metrics.push({
        siteId,
        metricKey: `facility_tickets_${category}`,
        metricVal: count,
        unit: 'count',
        source: 'servicenow',
        recordedAt: now,
      });
    }

    return metrics;
  }
}

// ============================================================
// Anomaly Detector — Z-score based
// ============================================================

export class AnomalyDetector {
  private threshold: number;

  constructor(threshold: number = 2.5) {
    this.threshold = threshold;
  }

  detect(metricKey: string, currentVal: number, historicalValues: number[], siteId?: string): AnomalyEvent | null {
    if (historicalValues.length < 2) return null;

    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const variance = historicalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / historicalValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return null;

    const zScore = Math.abs((currentVal - mean) / stdDev);

    if (zScore <= this.threshold) return null;

    const severity = zScore > 4 ? 'critical' : zScore > 3.5 ? 'high' : zScore > 3 ? 'medium' : 'low';

    return {
      metricKey,
      siteId,
      currentVal,
      baselineVal: mean,
      zScore,
      severity,
      detectedAt: new Date(),
    };
  }
}

// ============================================================
// Site Health Aggregator
// ============================================================

export class SiteHealthAggregator {
  /**
   * Compute a 0–100 health score from site metrics.
   * Weighted: energy efficiency 25%, ticket backlog 25%, space utilization 25%, alerts 25%
   */
  computeHealth(
    energyEfficiency: number,     // 0–1 (higher = better)
    facilityTicketBacklog: number, // raw count
    spaceUtilization: number,      // 0–1
    openAlerts: number,            // raw count
  ): SiteHealthReport & { siteId: string } {
    // Normalize each to 0–100 (higher = healthier)
    const energyScore = Math.min(energyEfficiency * 100, 100);
    const ticketScore = Math.max(100 - facilityTicketBacklog * 5, 0); // each ticket costs 5 points
    const spaceScore = spaceUtilization >= 0.3 && spaceUtilization <= 0.85
      ? 100
      : spaceUtilization < 0.3
        ? spaceUtilization / 0.3 * 100
        : Math.max(100 - (spaceUtilization - 0.85) / 0.15 * 100, 0);
    const alertScore = Math.max(100 - openAlerts * 10, 0); // each alert costs 10 points

    const healthScore = Math.round(
      energyScore * 0.25 + ticketScore * 0.25 + spaceScore * 0.25 + alertScore * 0.25
    );

    return {
      siteId: '', // caller sets this
      healthScore: Math.max(0, Math.min(100, healthScore)),
      energyEfficiency,
      facilityTicketBacklog,
      spaceUtilization,
      openAlerts,
    };
  }
}

// ============================================================
// Dashboard Aggregations
// ============================================================

export class OpsIntelligence {
  private metrics: Metric[] = [];
  private anomalies: AnomalyEvent[] = [];
  private siteHealthMap: Map<string, SiteHealthReport> = new Map();
  private siteNames: Map<string, string> = new Map();

  private csvIngester = new ManualCSVIngester();
  private anomalyDetector = new AnomalyDetector();
  private healthAggregator = new SiteHealthAggregator();

  ingestCSV(csv: string, source?: string): Metric[] {
    const newMetrics = this.csvIngester.parse(csv, source);
    this.metrics.push(...newMetrics);
    return newMetrics;
  }

  addMetrics(metrics: Metric[]): void {
    this.metrics.push(...metrics);
  }

  registerSite(siteId: string, name: string): void {
    this.siteNames.set(siteId, name);
  }

  updateSiteHealth(siteId: string, report: SiteHealthReport): void {
    this.siteHealthMap.set(siteId, report);
  }

  runAnomalyDetection(metricKey: string, siteId?: string): AnomalyEvent | null {
    const relevant = this.metrics.filter(
      (m) => m.metricKey === metricKey && m.siteId === siteId
    );

    if (relevant.length < 3) return null;

    const sorted = [...relevant].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const historical = sorted.slice(0, -1).map((m) => m.metricVal);
    const current = sorted[sorted.length - 1].metricVal;

    const anomaly = this.anomalyDetector.detect(metricKey, current, historical, siteId);
    if (anomaly) {
      this.anomalies.push(anomaly);
    }
    return anomaly;
  }

  getPortfolioPosture(): SiteHealthReport[] {
    return Array.from(this.siteHealthMap.values());
  }

  getDriftEvents(days: number): AnomalyEvent[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.anomalies.filter((a) => a.detectedAt >= cutoff);
  }

  getSiteScorecard(siteId: string): SiteScorecard | null {
    const health = this.siteHealthMap.get(siteId);
    if (!health) return null;

    const siteMetrics = this.metrics.filter((m) => m.siteId === siteId);
    const mttrMetrics = siteMetrics.filter((m) => m.metricKey === 'facility_mttr');
    const mttr = mttrMetrics.length > 0
      ? mttrMetrics[mttrMetrics.length - 1].metricVal
      : 0;

    const siteAnomalies = this.anomalies.filter((a) => a.siteId === siteId);
    const p0 = siteAnomalies.filter((a) => a.severity === 'critical').length;
    const p1 = siteAnomalies.filter((a) => a.severity === 'high').length;

    return {
      siteId,
      siteName: this.siteNames.get(siteId) ?? siteId,
      healthScore: health.healthScore,
      mttr,
      utilization: health.spaceUtilization,
      openP0: p0,
      openP1: p1,
      anomalyCount: siteAnomalies.length,
    };
  }
}

export default OpsIntelligence;
