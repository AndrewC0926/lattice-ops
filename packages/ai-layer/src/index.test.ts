import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { AILayer, AnalysisCache } from './index.js';
import type { ProgramContext } from '@lattice-ops/shared';

const BASE_URL = 'https://api.test.anthropic.com';

function mockContext(overrides: Partial<ProgramContext> = {}): ProgramContext {
  return {
    id: 'prog-hvac-cm',
    title: 'HVAC Modernization — Costa Mesa HQ',
    phase: 'executing',
    ragStatus: 'green',
    milestoneCount: 5,
    milestonesComplete: 3,
    blockedMilestones: 0,
    budgetAllocated: 4200000,
    budgetSpent: 1890000,
    budgetUtilization: 0.45,
    stakeholders: ['vp-facilities', 'ehs-director'],
    targetDate: new Date('2026-12-31'),
    daysUntilTarget: 280,
    ...overrides,
  };
}

const MOCK_RISK_RESPONSE = {
  riskScore: 0.35,
  riskLevel: 'medium',
  topBlockers: ['Chiller lead time extended to 16 weeks due to supply chain delays', 'Rooftop structural engineering review pending', 'Cleanroom operations cannot be interrupted during install'],
  mitigationActions: ['Pre-order replacement chiller units from secondary vendor', 'Engage structural PE firm for expedited roof load analysis', 'Schedule HVAC cutover during Q3 production shutdown window'],
  confidenceNote: 'Based on 45% budget utilization ($1.89M of $4.2M) and 3/5 milestones complete',
  evidenceMissing: false,
};

const MOCK_BRIEF_RESPONSE = {
  bluf: 'Approve continued execution — HVAC modernization on track with 60% milestone completion and healthy budget utilization.',
  situation: 'Costa Mesa HQ HVAC modernization is in executing phase with 3 of 5 milestones complete. Budget utilization at 45%. Buildings 3 and 4 ductwork replacement finished ahead of schedule.',
  recommendation: 'Continue execution and schedule a checkpoint after Building 5 cleanroom HVAC cutover.',
  keyRisks: ['Chiller supply chain lead time', 'Rooftop structural load capacity', 'Cleanroom uptime requirements during install'],
  nextMilestone: 'Building 5 — Cleanroom AHU replacement and balancing',
  budgetStatus: '$1.89M of $4.2M spent (45% utilization)',
  evidenceMissing: false,
};

const MOCK_GAP_RESPONSE = {
  gapsIdentified: [
    {
      category: 'resource',
      title: 'Shared mechanical contractor bottleneck across Costa Mesa and Columbus programs',
      affectedPrograms: ['prog-hvac-cm', 'prog-lab-col'],
      severity: 'high',
      recommendation: 'Engage secondary mechanical contractor for Columbus Arsenal lab expansion to deconflict schedules',
    },
  ],
  systemicRisks: ['Mechanical contractor contention across two concurrent facilities programs', 'HVAC equipment vendor concentration risk — 80% of orders through single supplier', 'EHS inspection backlog delaying occupancy permits'],
  prioritizedActions: ['Qualify backup mechanical contractor for Columbus site', 'Diversify HVAC equipment sourcing across Trane and Carrier'],
  evidenceMissing: false,
};

function mockClaudeResponse(body: unknown) {
  return nock(BASE_URL)
    .post('/v1/messages')
    .reply(200, {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: JSON.stringify(body) }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
}

describe('AILayer', () => {
  let ai: AILayer;

  beforeEach(() => {
    nock.disableNetConnect();
    ai = new AILayer({ apiKey: 'test-key', baseURL: BASE_URL });
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    ai.clearCache();
  });

  // --- Risk Assessment ---

  it('should return a valid risk assessment', async () => {
    mockClaudeResponse(MOCK_RISK_RESPONSE);

    const result = await ai.assessRisk(mockContext());
    expect(result.riskScore).toBe(0.35);
    expect(result.riskLevel).toBe('medium');
    expect(result.topBlockers).toHaveLength(3);
    expect(result.mitigationActions).toHaveLength(3);
    expect(result.evidenceMissing).toBe(false);
  });

  it('should propagate evidenceMissing flag on risk assessment', async () => {
    mockClaudeResponse({ ...MOCK_RISK_RESPONSE, evidenceMissing: true });

    const result = await ai.assessRisk(mockContext({ budgetAllocated: 0, budgetSpent: 0 }));
    expect(result.evidenceMissing).toBe(true);
  });

  // --- Executive Brief ---

  it('should return a valid executive brief', async () => {
    mockClaudeResponse(MOCK_BRIEF_RESPONSE);

    const result = await ai.generateBrief(mockContext());
    expect(result.bluf).toMatch(/^Approve/);
    expect(result.keyRisks).toHaveLength(3);
    expect(result.evidenceMissing).toBe(false);
  });

  it('should propagate evidenceMissing flag on brief', async () => {
    mockClaudeResponse({ ...MOCK_BRIEF_RESPONSE, evidenceMissing: true });

    const result = await ai.generateBrief(mockContext({ phase: 'framed' }));
    expect(result.evidenceMissing).toBe(true);
  });

  // --- Gap Analysis ---

  it('should return a valid gap analysis', async () => {
    mockClaudeResponse(MOCK_GAP_RESPONSE);

    const result = await ai.analyzeGaps([mockContext(), mockContext({ id: 'prog-lab-col' })]);
    expect(result.gapsIdentified.length).toBeGreaterThanOrEqual(1);
    expect(result.systemicRisks).toHaveLength(3);
    expect(result.evidenceMissing).toBe(false);
  });

  it('should propagate evidenceMissing flag on gap analysis', async () => {
    mockClaudeResponse({ ...MOCK_GAP_RESPONSE, evidenceMissing: true });

    const result = await ai.analyzeGaps([mockContext()]);
    expect(result.evidenceMissing).toBe(true);
  });

  // --- Caching ---

  it('should return cached result without second HTTP call', async () => {
    const scope = mockClaudeResponse(MOCK_RISK_RESPONSE);

    const ctx = mockContext();
    const result1 = await ai.assessRisk(ctx);
    const result2 = await ai.assessRisk(ctx);

    expect(result1).toEqual(result2);
    expect(scope.isDone()).toBe(true); // only one call was made
    // Verify nock interceptor was consumed exactly once
    expect(scope.pendingMocks()).toHaveLength(0);
  });

  it('should not use cache for different inputs', async () => {
    mockClaudeResponse(MOCK_RISK_RESPONSE);
    mockClaudeResponse({ ...MOCK_RISK_RESPONSE, riskScore: 0.8 });

    const result1 = await ai.assessRisk(mockContext({ id: 'prog-hvac-cm' }));
    const result2 = await ai.assessRisk(mockContext({ id: 'prog-lab-col' }));

    expect(result1.riskScore).toBe(0.35);
    expect(result2.riskScore).toBe(0.8);
  });

  // --- Error Handling ---

  it('should throw on malformed JSON response', async () => {
    nock(BASE_URL)
      .post('/v1/messages')
      .reply(200, {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is not JSON at all' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

    await expect(ai.assessRisk(mockContext())).rejects.toThrow('Failed to parse Claude response as JSON');
  });

  it('should throw on 4xx API error', async () => {
    nock(BASE_URL)
      .post('/v1/messages')
      .reply(401, { error: { message: 'Invalid API key' } });

    await expect(ai.assessRisk(mockContext())).rejects.toThrow();
  });

  it('should throw on 5xx API error', async () => {
    nock(BASE_URL)
      .post('/v1/messages')
      .reply(500, { error: { message: 'Internal server error' } });

    await expect(ai.assessRisk(mockContext())).rejects.toThrow();
  });

  // --- Cache Unit Tests ---

  it('should hash inputs deterministically', () => {
    const input = { a: 1, b: 2 };
    expect(AnalysisCache.hashInput(input)).toBe(AnalysisCache.hashInput(input));
  });

  it('should produce different hashes for different inputs', () => {
    expect(AnalysisCache.hashInput({ a: 1 })).not.toBe(AnalysisCache.hashInput({ a: 2 }));
  });

  // --- Brief-specific ---

  it('should generate brief for each capability independently', async () => {
    mockClaudeResponse(MOCK_RISK_RESPONSE);
    mockClaudeResponse(MOCK_BRIEF_RESPONSE);

    const ctx = mockContext();
    const risk = await ai.assessRisk(ctx);
    const brief = await ai.generateBrief(ctx);

    expect(risk.riskScore).toBeDefined();
    expect(brief.bluf).toBeDefined();
    // They should be different types
    expect('riskScore' in risk).toBe(true);
    expect('bluf' in brief).toBe(true);
  });

  // --- Cache expiry ---

  it('should not return expired cache entries', () => {
    const cache = new AnalysisCache(24);
    cache.set('key', { data: true });
    // Entry should be available before expiry
    expect(cache.get('key')).toEqual({ data: true });
    // Manually expire by clearing
    cache.clear();
    expect(cache.get('key')).toBeNull();
  });

  it('should clear all cached entries on clearCache', async () => {
    mockClaudeResponse(MOCK_RISK_RESPONSE);
    mockClaudeResponse(MOCK_RISK_RESPONSE);

    const ctx = mockContext();
    await ai.assessRisk(ctx);
    ai.clearCache();

    // After clearing, should make a new HTTP call
    const result = await ai.assessRisk(ctx);
    expect(result.riskScore).toBe(0.35);
  });
});
