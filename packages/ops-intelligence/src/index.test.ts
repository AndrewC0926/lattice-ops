import { describe, it, expect, beforeEach } from 'vitest';
import { ManualCSVIngester, AnomalyDetector, SiteHealthAggregator, OpsIntelligence, ServiceNowConnector } from './index.js';

// ============================================================
// ManualCSVIngester
// ============================================================

describe('ManualCSVIngester', () => {
  const ingester = new ManualCSVIngester();

  it('should parse valid CSV into Metric array', () => {
    const csv = `site_id,metric_key,metric_val,unit,recorded_at
costa-mesa-hq,energy_kwh,42150,kwh,2026-01-15T10:00:00Z
costa-mesa-hq,space_utilization,0.78,,2026-01-15T10:00:00Z`;

    const metrics = ingester.parse(csv);
    expect(metrics).toHaveLength(2);
    expect(metrics[0].metricKey).toBe('energy_kwh');
    expect(metrics[0].metricVal).toBe(42150);
    expect(metrics[0].siteId).toBe('costa-mesa-hq');
    expect(metrics[0].source).toBe('csv_import');
    expect(metrics[1].unit).toBeUndefined();
  });

  it('should reject CSV without required columns', () => {
    const csv = `site_id,value
costa-mesa-hq,100`;

    expect(() => ingester.parse(csv)).toThrow('Missing required column: metric_key');
  });

  it('should reject CSV with invalid metric_val', () => {
    const csv = `metric_key,metric_val
energy_kwh,not_a_number`;

    expect(() => ingester.parse(csv)).toThrow('Invalid metric_val on row 2');
  });

  it('should reject CSV with only a header row', () => {
    const csv = `metric_key,metric_val`;
    expect(() => ingester.parse(csv)).toThrow('CSV must contain a header row and at least one data row');
  });

  it('should use custom source name', () => {
    const csv = `metric_key,metric_val
energy_kwh,100`;

    const metrics = ingester.parse(csv, 'excel_export');
    expect(metrics[0].source).toBe('excel_export');
  });
});

// ============================================================
// AnomalyDetector
// ============================================================

describe('AnomalyDetector', () => {
  const detector = new AnomalyDetector(2.5);

  it('should detect anomaly above threshold', () => {
    const historical = [10, 11, 10, 12, 11, 10, 11, 10, 12, 11];
    const anomaly = detector.detect('energy_kwh', 50, historical, 'costa-mesa-hq');

    expect(anomaly).not.toBeNull();
    expect(anomaly!.zScore).toBeGreaterThan(2.5);
    expect(anomaly!.metricKey).toBe('energy_kwh');
    expect(anomaly!.siteId).toBe('costa-mesa-hq');
  });

  it('should return null for values within normal range', () => {
    const historical = [10, 11, 10, 12, 11, 10, 11, 10, 12, 11];
    const anomaly = detector.detect('energy_kwh', 11, historical);

    expect(anomaly).toBeNull();
  });

  it('should return null with insufficient historical data', () => {
    const anomaly = detector.detect('energy_kwh', 100, [10]);
    expect(anomaly).toBeNull();
  });

  it('should assign correct severity based on z-score', () => {
    // Values that produce very high z-scores
    const historical = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10.1];
    const anomaly = detector.detect('energy_kwh', 100, historical);

    expect(anomaly).not.toBeNull();
    expect(anomaly!.severity).toBe('critical'); // z-score >> 4
  });
});

// ============================================================
// SiteHealthAggregator
// ============================================================

describe('SiteHealthAggregator', () => {
  const aggregator = new SiteHealthAggregator();

  it('should compute health score in 0-100 range', () => {
    const report = aggregator.computeHealth(0.85, 3, 0.65, 1);
    expect(report.healthScore).toBeGreaterThanOrEqual(0);
    expect(report.healthScore).toBeLessThanOrEqual(100);
  });

  it('should produce high score for ideal conditions', () => {
    const report = aggregator.computeHealth(0.95, 0, 0.60, 0);
    expect(report.healthScore).toBeGreaterThanOrEqual(80);
  });

  it('should produce low score for poor conditions', () => {
    const report = aggregator.computeHealth(0.1, 20, 0.99, 10);
    expect(report.healthScore).toBeLessThanOrEqual(20);
  });
});

// ============================================================
// ServiceNowConnector
// ============================================================

describe('ServiceNowConnector', () => {
  it('should convert ticket summary to metrics', () => {
    const connector = new ServiceNowConnector();
    const metrics = connector.toMetrics('costa-mesa-hq', {
      openCount: 47,
      mttr: 6.2,
      categoryBreakdown: { hvac: 18, electrical: 29 },
    });

    expect(metrics.length).toBe(4); // open + mttr + 2 categories
    expect(metrics[0].metricKey).toBe('facility_tickets_open');
    expect(metrics[0].metricVal).toBe(47);
    expect(metrics[1].metricKey).toBe('facility_mttr');
    expect(metrics[1].metricVal).toBe(6.2);
  });
});

// ============================================================
// OpsIntelligence (integrated)
// ============================================================

describe('OpsIntelligence', () => {
  let intel: OpsIntelligence;

  beforeEach(() => {
    intel = new OpsIntelligence();
  });

  it('should return site scorecard with correct shape', () => {
    intel.registerSite('costa-mesa-hq', 'Costa Mesa HQ');
    intel.updateSiteHealth('costa-mesa-hq', {
      siteId: 'costa-mesa-hq',
      healthScore: 82,
      energyEfficiency: 0.87,
      facilityTicketBacklog: 12,
      spaceUtilization: 0.78,
      openAlerts: 3,
    });

    const scorecard = intel.getSiteScorecard('costa-mesa-hq');
    expect(scorecard).not.toBeNull();
    expect(scorecard!.siteName).toBe('Costa Mesa HQ');
    expect(scorecard!.healthScore).toBe(82);
  });

  it('should return null scorecard for unknown site', () => {
    const scorecard = intel.getSiteScorecard('nonexistent');
    expect(scorecard).toBeNull();
  });

  it('should return empty portfolio posture when no sites registered', () => {
    const posture = intel.getPortfolioPosture();
    expect(posture).toEqual([]);
  });
});
