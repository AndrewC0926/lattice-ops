import { describe, it, expect, beforeEach } from 'vitest';
import { ProgramTracker } from './index.js';
import type { Program } from '@lattice-ops/shared';

describe('ProgramTracker', () => {
  let tracker: ProgramTracker;

  beforeEach(() => {
    tracker = new ProgramTracker();
  });

  // --- Registration ---

  it('should register a program at framed phase', () => {
    const program = tracker.register({
      title: 'HVAC Modernization — Costa Mesa HQ',
      description: 'Replace legacy HVAC across Buildings 3-7 at Costa Mesa HQ to meet ASHRAE 90.1 energy targets and support cleanroom expansion',
      owner: 'marcus.webb',
      stakeholders: ['vp-facilities', 'ehs-director'],
    });

    expect(program.id).toBeDefined();
    expect(program.phase).toBe('framed');
    expect(program.ragStatus).toBe('green');
    expect(program.milestones).toEqual([]);
  });

  it('should emit program:registered event on registration', () => {
    let emitted: Program | null = null;
    tracker.on('program:registered', (p) => { emitted = p; });

    const program = tracker.register({
      title: 'Perimeter Security Upgrade — Huntington Beach Test Range',
      description: 'Deploy anti-climb fencing, thermal cameras, and vehicle barriers around the perimeter of the Huntington Beach test range',
      owner: 'rachel.torres',
    });

    expect(emitted).not.toBeNull();
    expect(emitted!.id).toBe(program.id);
  });

  // --- Phase gate: framed -> scoped ---

  it('should block framed->scoped when description < 50 chars', () => {
    const program = tracker.register({
      title: 'Badge Reader Replacement',
      description: 'Replace badge readers',
      owner: 'rachel.torres',
      stakeholders: ['physical-security'],
    });

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('Description must be at least 50 characters');
  });

  it('should block framed->scoped when no stakeholders', () => {
    const program = tracker.register({
      title: 'Columbus Arsenal Generator Replacement',
      description: 'Replace two aging 500kW diesel generators at Columbus Arsenal with natural gas units rated for full-facility backup',
      owner: 'marcus.webb',
      stakeholders: [],
    });

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('At least 1 stakeholder must be identified');
  });

  it('should advance framed->scoped when gate criteria pass', () => {
    const program = tracker.register({
      title: 'Lab Expansion — Columbus Ohio Arsenal',
      description: 'Build out 12,000 sqft of additional electronics integration lab space at the Columbus Arsenal facility to support Anvil production ramp',
      owner: 'david.chen',
      stakeholders: ['manufacturing-ops'],
    });

    const result = tracker.advance(program.id);
    expect(result.success).toBe(true);
    expect(result.toPhase).toBe('scoped');
    expect(tracker.getProgram(program.id)!.phase).toBe('scoped');
  });

  // --- Phase gate: scoped -> executing ---

  it('should block scoped->executing without target date, budget, and milestones', () => {
    const program = tracker.register({
      title: 'Network Infrastructure Buildout — Reston VA',
      description: 'Deploy redundant 100Gbps backbone, dark fiber interconnects, and zero-trust segmentation across Reston VA operations center',
      owner: 'sarah.mitchell',
      stakeholders: ['it-infrastructure'],
    });
    tracker.advance(program.id); // framed -> scoped

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('Target date must be set');
    expect(result.validationErrors).toContain('Budget must be allocated');
    expect(result.validationErrors).toContain('At least 1 milestone must be defined');
  });

  it('should advance scoped->executing when all criteria met', () => {
    const program = tracker.register({
      title: 'Security Infrastructure Upgrade — Huntington Beach',
      description: 'Install vehicle barriers, upgrade perimeter CCTV to thermal imaging, and deploy mantraps at Huntington Beach Test Range entry points',
      owner: 'rachel.torres',
      stakeholders: ['physical-security'],
    });
    tracker.advance(program.id);
    tracker.setTargetDate(program.id, new Date('2026-12-31'));
    tracker.setBudget(program.id, 7800000);
    tracker.addMilestone(program.id, 'Site survey and threat assessment complete');

    const result = tracker.advance(program.id);
    expect(result.success).toBe(true);
    expect(result.toPhase).toBe('executing');
  });

  // --- Phase gate: executing -> scaled ---

  it('should block executing->scaled with incomplete milestones', () => {
    const program = setupExecutingProgram(tracker);
    tracker.addMilestone(program.id, 'Final fire marshal inspection');

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors[0]).toMatch(/milestone\(s\) not yet complete/);
  });

  it('should block executing->scaled when RAG is red', () => {
    const program = setupExecutingProgram(tracker);
    tracker.updateRAG(program.id, 'red', 'Critical blocker');

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('RAG status must not be red');
  });

  it('should advance executing->scaled when milestones complete and RAG not red', () => {
    const program = setupExecutingProgram(tracker);

    const result = tracker.advance(program.id);
    expect(result.success).toBe(true);
    expect(result.toPhase).toBe('scaled');
  });

  // --- Phase gate: scaled -> closed ---

  it('should block scaled->closed without actual completion date', () => {
    const program = setupScaledProgram(tracker);

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('Actual completion date must be recorded');
  });

  it('should advance scaled->closed when completion date recorded', () => {
    const program = setupScaledProgram(tracker);
    tracker.setActualCompletionDate(program.id, new Date());

    const result = tracker.advance(program.id);
    expect(result.success).toBe(true);
    expect(result.toPhase).toBe('closed');
  });

  // --- Terminal state ---

  it('should prevent advancing past closed phase', () => {
    const program = setupScaledProgram(tracker);
    tracker.setActualCompletionDate(program.id, new Date());
    tracker.advance(program.id); // scaled -> closed

    const result = tracker.advance(program.id);
    expect(result.blocked).toBe(true);
    expect(result.validationErrors).toContain('Program is already in terminal phase');
  });

  // --- Milestone blocking/unblocking ---

  it('should prevent completing a milestone with unresolved blockers', () => {
    const program = tracker.register({
      title: 'Cleanroom HVAC Commissioning — Costa Mesa',
      description: 'Commission new ISO Class 7 cleanroom HVAC in Building 5 at Costa Mesa HQ supporting autonomous vehicle sensor assembly',
      owner: 'marcus.webb',
      stakeholders: ['manufacturing-ops'],
    });

    const m1 = tracker.addMilestone(program.id, 'Ductwork installation and pressure testing');
    const m2 = tracker.addMilestone(program.id, 'Particle count certification');
    tracker.addBlocker(program.id, m2.id, m1.id);

    expect(() => tracker.completeMilestone(program.id, m2.id)).toThrow('blocked by 1 incomplete milestone(s)');
  });

  it('should clear downstream blockers when a milestone completes', () => {
    const program = tracker.register({
      title: 'Reston VA Data Center Power Upgrade',
      description: 'Upgrade Reston VA operations center from 2MW to 5MW utility feed with redundant transformer switchgear and UPS capacity',
      owner: 'david.chen',
      stakeholders: ['it-infrastructure'],
    });

    const m1 = tracker.addMilestone(program.id, 'Utility transformer delivery and installation');
    const m2 = tracker.addMilestone(program.id, 'UPS cutover and load testing');
    tracker.addBlocker(program.id, m2.id, m1.id);

    tracker.completeMilestone(program.id, m1.id);

    const updated = tracker.getProgram(program.id)!;
    const dependent = updated.milestones.find((m) => m.id === m2.id)!;
    expect(dependent.blockedBy).toEqual([]);

    // Should now be completable
    const completed = tracker.completeMilestone(program.id, m2.id);
    expect(completed.completed).toBe(true);
  });

  // --- RAG auto-escalation ---

  it('should auto-escalate RAG to amber at >90% budget utilization', () => {
    const program = tracker.register({
      title: 'Costa Mesa Fire Suppression Retrofit',
      description: 'Retrofit Buildings 3-7 at Costa Mesa HQ with clean-agent fire suppression systems rated for electronics manufacturing areas',
      owner: 'marcus.webb',
      stakeholders: ['ehs-director'],
    });
    tracker.setBudget(program.id, 3200000);

    tracker.recordSpend(program.id, 2912000);
    expect(tracker.getProgram(program.id)!.ragStatus).toBe('amber');
  });

  it('should not auto-escalate if already amber or red', () => {
    const program = tracker.register({
      title: 'Columbus Electrical Panel Replacement',
      description: 'Replace aging 480V electrical distribution panels at Columbus Ohio Arsenal to support increased manufacturing load',
      owner: 'david.chen',
      stakeholders: ['manufacturing-ops'],
    });
    tracker.setBudget(program.id, 5400000);
    tracker.updateRAG(program.id, 'red', 'Vendor failed delivery milestone — panels on 8-week backorder');

    tracker.recordSpend(program.id, 4914000);
    // Should remain red, not downgrade to amber
    expect(tracker.getProgram(program.id)!.ragStatus).toBe('red');
  });

  // --- Portfolio health ---

  it('should calculate portfolio health correctly', () => {
    const p1 = tracker.register({
      title: 'HVAC Modernization — Costa Mesa HQ',
      description: 'Replace legacy HVAC across Buildings 3-7 at Costa Mesa HQ to meet ASHRAE 90.1 energy targets and support cleanroom expansion',
      owner: 'marcus.webb',
      stakeholders: ['vp-facilities'],
    });
    const p2 = tracker.register({
      title: 'Lab Expansion — Columbus Ohio Arsenal',
      description: 'Build out 12,000 sqft of additional electronics integration lab space at Columbus Arsenal to support Anvil production ramp',
      owner: 'david.chen',
      stakeholders: ['manufacturing-ops'],
    });

    tracker.advance(p1.id); // framed -> scoped
    tracker.setBudget(p1.id, 4200000);
    tracker.setBudget(p2.id, 8400000);
    tracker.recordSpend(p1.id, 2100000);
    tracker.recordSpend(p2.id, 4200000);

    const overdueMilestone = tracker.addMilestone(p2.id, 'Structural steel delivery');
    // Manually set due date in the past
    overdueMilestone.dueDate = new Date('2020-01-01');

    const health = tracker.portfolioHealth();

    expect(health.totalPrograms).toBe(2);
    expect(health.phaseCounts.scoped).toBe(1);
    expect(health.phaseCounts.framed).toBe(1);
    expect(health.ragCounts.green).toBe(2);
    expect(health.overdueMilestones).toBe(1);
    expect(health.budgetUtilization).toBe(0.5); // 150k / 300k
  });

  // --- Event emission ---

  it('should emit program:gate_blocked when advance fails', () => {
    let blocked = false;
    tracker.on('program:gate_blocked', () => { blocked = true; });

    const program = tracker.register({
      title: 'Parking Structure Expansion — Costa Mesa',
      description: 'Expand covered parking',
      owner: 'marcus.webb',
      stakeholders: ['vp-facilities'],
    });

    tracker.advance(program.id);
    expect(blocked).toBe(true);
  });
});

// --- Test Helpers ---

function setupExecutingProgram(tracker: ProgramTracker): Program {
  const program = tracker.register({
    title: 'Security Infrastructure Upgrade — Huntington Beach',
    description: 'Install vehicle barriers, upgrade perimeter CCTV to thermal imaging, and deploy mantraps at Huntington Beach Test Range entry points',
    owner: 'rachel.torres',
    stakeholders: ['physical-security'],
  });
  tracker.advance(program.id); // framed -> scoped
  tracker.setTargetDate(program.id, new Date('2026-12-31'));
  tracker.setBudget(program.id, 7800000);
  const m = tracker.addMilestone(program.id, 'Site survey and threat assessment complete');
  tracker.completeMilestone(program.id, m.id);
  tracker.advance(program.id); // scoped -> executing
  return tracker.getProgram(program.id)!;
}

function setupScaledProgram(tracker: ProgramTracker): Program {
  const program = setupExecutingProgram(tracker);
  tracker.advance(program.id); // executing -> scaled
  return tracker.getProgram(program.id)!;
}
