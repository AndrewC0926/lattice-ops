import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionEngine } from './index.js';
import type { DecisionRecordInput } from '@lattice-ops/shared';

function validInput(overrides: Partial<DecisionRecordInput> = {}): DecisionRecordInput {
  return {
    title: 'Select HVAC controls platform for Costa Mesa HQ modernization',
    situation: 'Costa Mesa HQ Buildings 3-7 require a unified building automation system (BAS) to manage new HVAC equipment. Must integrate with existing Siemens fire/life-safety and support cleanroom pressure cascades.',
    optionsConsidered: [
      {
        option: 'Siemens Desigo CC — extend existing BAS',
        pros: ['Single vendor across fire and HVAC', 'Existing staff trained on platform', 'Seamless fire/life-safety integration'],
        cons: ['Higher per-point licensing cost', 'Vendor lock-in on controls hardware'],
        estimatedCost: 1800000,
      },
      {
        option: 'Tridium Niagara 4 — open protocol BAS',
        pros: ['Open BACnet/IP protocol reduces lock-in', 'Lower licensing cost per controller', 'Multi-vendor equipment support'],
        cons: ['Requires integration middleware for Siemens fire system', 'Staff retraining needed', 'Additional $340K integration services'],
        estimatedCost: 2400000,
      },
    ],
    decision: 'Siemens Desigo CC — extend existing BAS',
    rationale: 'Operational continuity and fire/life-safety integration outweigh licensing cost premium. Staff already certified on Siemens platform, reducing commissioning risk.',
    tradeOffs: 'Accept higher per-point licensing cost and single-vendor dependency in exchange for zero-gap fire system integration and faster commissioning timeline.',
    decidedBy: 'marcus.webb',
    ...overrides,
  };
}

describe('DecisionEngine', () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    engine = new DecisionEngine();
  });

  it('should record a decision with >= 2 options', () => {
    const decision = engine.record(validInput());
    expect(decision.id).toBeDefined();
    expect(decision.status).toBe('accepted');
    expect(decision.optionsConsidered).toHaveLength(2);
  });

  it('should reject decisions with fewer than 2 options', () => {
    expect(() =>
      engine.record(
        validInput({
          optionsConsidered: [
            { option: 'Only option', pros: ['Easy'], cons: ['No alternative'], estimatedCost: 0 },
          ],
        }),
      ),
    ).toThrow('At least 2 options must be considered');
  });

  it('should supersede a decision and link old to new', () => {
    const old = engine.record(validInput({ title: 'Initial chiller vendor selection for Buildings 3-5' }));
    const replacement = engine.record(validInput({ title: 'Revised chiller vendor selection — dual-source Trane/Carrier' }));

    const superseded = engine.supersede(old.id, replacement.id, 'Single-source Trane strategy abandoned after 16-week lead time extension; dual-sourcing reduces delivery risk');

    expect(superseded.status).toBe('superseded');
    expect(superseded.supersededBy).toBe(replacement.id);
    expect(superseded.supersedeReason).toBe('Single-source Trane strategy abandoned after 16-week lead time extension; dual-sourcing reduces delivery risk');
  });

  it('should find decisions past their review date', () => {
    const pastReview = engine.record(
      validInput({ reviewDate: new Date('2020-01-01') }),
    );
    const futureReview = engine.record(
      validInput({ reviewDate: new Date('2030-01-01') }),
    );

    const due = engine.getDue();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(pastReview.id);
  });

  it('should not include superseded decisions in due reviews', () => {
    const old = engine.record(validInput({ reviewDate: new Date('2020-01-01') }));
    const replacement = engine.record(validInput({ title: 'Updated access control vendor after RFP re-evaluation' }));
    engine.supersede(old.id, replacement.id, 'Original vendor failed ITAR compliance verification');

    const due = engine.getDue();
    expect(due.find((d) => d.id === old.id)).toBeUndefined();
  });

  it('should generate a business case document', () => {
    const decision = engine.record(validInput());
    const businessCase = engine.buildBusinessCase(decision.id);

    expect(businessCase).toContain('BUSINESS CASE: Select HVAC controls platform for Costa Mesa HQ modernization');
    expect(businessCase).toContain('SITUATION');
    expect(businessCase).toContain('OPTIONS ANALYSIS');
    expect(businessCase).toContain('Siemens Desigo CC');
    expect(businessCase).toContain('DECISION');
    expect(businessCase).toContain('RATIONALE');
    expect(businessCase).toContain('DECIDED BY: marcus.webb');
  });

  it('should render as ADR markdown', () => {
    const decision = engine.record(validInput());
    const md = engine.toMarkdown(decision.id);

    expect(md).toContain('# ADR: Select HVAC controls platform for Costa Mesa HQ modernization');
    expect(md).toContain('**Status:** accepted');
    expect(md).toContain('## Situation');
    expect(md).toContain('## Options Considered');
    expect(md).toContain('## Decision');
    expect(md).toContain('## Rationale');
    expect(md).toContain('## Trade-offs');
  });

  it('should include review date in markdown when set', () => {
    const decision = engine.record(validInput({ reviewDate: new Date('2026-06-15') }));
    const md = engine.toMarkdown(decision.id);
    expect(md).toContain('**Review by:** 2026-06-15');
  });

  it('should include estimated cost in business case when provided', () => {
    const decision = engine.record(validInput());
    const bc = engine.buildBusinessCase(decision.id);
    expect(bc).toContain('Estimated cost: $2,400,000');
  });
});
