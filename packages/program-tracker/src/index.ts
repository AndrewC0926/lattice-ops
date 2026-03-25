import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type {
  Program,
  Phase,
  RAGStatus,
  Priority,
  Milestone,
  ProgramRegistrationInput,
  PhaseTransitionResult,
  PortfolioHealth,
} from '@lattice-ops/shared';

const PHASE_ORDER: Phase[] = ['framed', 'scoped', 'executing', 'scaled', 'closed'];

function nextPhase(current: Phase): Phase | undefined {
  const idx = PHASE_ORDER.indexOf(current);
  return idx >= 0 && idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : undefined;
}

type GateValidator = (program: Program) => string[];

const GATE_VALIDATORS: Record<string, GateValidator> = {
  'framed->scoped': (p) => {
    const errors: string[] = [];
    if (p.description.length < 50) errors.push('Description must be at least 50 characters');
    if (p.stakeholders.length < 1) errors.push('At least 1 stakeholder must be identified');
    return errors;
  },
  'scoped->executing': (p) => {
    const errors: string[] = [];
    if (!p.targetDate) errors.push('Target date must be set');
    if (p.budgetAllocated <= 0) errors.push('Budget must be allocated');
    if (p.milestones.length < 1) errors.push('At least 1 milestone must be defined');
    return errors;
  },
  'executing->scaled': (p) => {
    const errors: string[] = [];
    const incomplete = p.milestones.filter((m) => !m.completed);
    if (incomplete.length > 0) errors.push(`${incomplete.length} milestone(s) not yet complete`);
    if (p.ragStatus === 'red') errors.push('RAG status must not be red');
    return errors;
  },
  'scaled->closed': (p) => {
    const errors: string[] = [];
    if (!p.actualCompletionDate) errors.push('Actual completion date must be recorded');
    return errors;
  },
};

export class ProgramTracker extends EventEmitter {
  private programs: Map<string, Program> = new Map();

  register(input: ProgramRegistrationInput): Program {
    const now = new Date();
    const program: Program = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      phase: 'framed',
      ragStatus: 'green',
      priority: input.priority ?? 'medium',
      owner: input.owner,
      stakeholders: input.stakeholders ?? [],
      budgetAllocated: 0,
      budgetSpent: 0,
      milestones: [],
      createdAt: now,
      updatedAt: now,
    };
    this.programs.set(program.id, program);
    this.emit('program:registered', program);
    return program;
  }

  getProgram(id: string): Program | undefined {
    return this.programs.get(id);
  }

  getAllPrograms(): Program[] {
    return Array.from(this.programs.values());
  }

  advance(programId: string): PhaseTransitionResult {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    const next = nextPhase(program.phase);
    if (!next) {
      return {
        success: false,
        blocked: true,
        fromPhase: program.phase,
        validationErrors: ['Program is already in terminal phase'],
      };
    }

    const gateKey = `${program.phase}->${next}`;
    const validator = GATE_VALIDATORS[gateKey];
    const errors = validator ? validator(program) : [];

    if (errors.length > 0) {
      this.emit('program:gate_blocked', { programId, fromPhase: program.phase, toPhase: next, errors });
      return {
        success: false,
        blocked: true,
        fromPhase: program.phase,
        toPhase: next,
        validationErrors: errors,
      };
    }

    const fromPhase = program.phase;
    program.phase = next;
    program.updatedAt = new Date();
    this.emit('program:advanced', { programId, fromPhase, toPhase: next });

    return {
      success: true,
      blocked: false,
      fromPhase,
      toPhase: next,
      validationErrors: [],
    };
  }

  addMilestone(programId: string, title: string, dueDate?: Date): Milestone {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    const milestone: Milestone = {
      id: randomUUID(),
      programId,
      title,
      dueDate,
      completed: false,
      blockedBy: [],
    };
    program.milestones.push(milestone);
    program.updatedAt = new Date();
    return milestone;
  }

  completeMilestone(programId: string, milestoneId: string): Milestone {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    const milestone = program.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`);

    if (milestone.blockedBy.length > 0) {
      const unresolvedBlockers = milestone.blockedBy.filter((blockerId) => {
        const blocker = program.milestones.find((m) => m.id === blockerId);
        return blocker && !blocker.completed;
      });
      if (unresolvedBlockers.length > 0) {
        throw new Error(`Milestone is blocked by ${unresolvedBlockers.length} incomplete milestone(s)`);
      }
    }

    milestone.completed = true;
    milestone.completedAt = new Date();
    program.updatedAt = new Date();
    this.emit('milestone:completed', { programId, milestoneId, title: milestone.title });

    // Clear this milestone as a blocker from downstream milestones
    for (const m of program.milestones) {
      const idx = m.blockedBy.indexOf(milestoneId);
      if (idx !== -1) {
        m.blockedBy.splice(idx, 1);
      }
    }

    return milestone;
  }

  addBlocker(programId: string, milestoneId: string, blockerMilestoneId: string): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    const milestone = program.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found`);

    if (!milestone.blockedBy.includes(blockerMilestoneId)) {
      milestone.blockedBy.push(blockerMilestoneId);
    }
  }

  updateRAG(programId: string, status: RAGStatus, reason: string): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    const previous = program.ragStatus;
    program.ragStatus = status;
    program.ragReason = reason;
    program.updatedAt = new Date();

    if (previous !== status) {
      this.emit('program:rag_changed', { programId, previous, current: status, reason });
    }
  }

  recordSpend(programId: string, amount: number): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    program.budgetSpent += amount;
    program.updatedAt = new Date();

    // Auto-escalate RAG to amber at >90% budget utilization
    if (program.budgetAllocated > 0) {
      const utilization = program.budgetSpent / program.budgetAllocated;
      if (utilization > 0.9 && program.ragStatus === 'green') {
        this.updateRAG(programId, 'amber', `Budget utilization at ${(utilization * 100).toFixed(1)}%`);
      }
    }
  }

  setBudget(programId: string, amount: number): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    program.budgetAllocated = amount;
    program.updatedAt = new Date();
  }

  setTargetDate(programId: string, date: Date): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    program.targetDate = date;
    program.updatedAt = new Date();
  }

  setActualCompletionDate(programId: string, date: Date): void {
    const program = this.programs.get(programId);
    if (!program) throw new Error(`Program ${programId} not found`);

    program.actualCompletionDate = date;
    program.updatedAt = new Date();
  }

  portfolioHealth(): PortfolioHealth {
    const programs = this.getAllPrograms();
    const phaseCounts: Record<Phase, number> = { framed: 0, scoped: 0, executing: 0, scaled: 0, closed: 0 };
    const ragCounts: Record<RAGStatus, number> = { green: 0, amber: 0, red: 0 };

    let totalBudgetAllocated = 0;
    let totalBudgetSpent = 0;
    let overdueMilestones = 0;
    let activeWithTargetCount = 0;
    let overTargetCount = 0;
    const now = new Date();

    for (const p of programs) {
      phaseCounts[p.phase]++;
      ragCounts[p.ragStatus]++;
      totalBudgetAllocated += p.budgetAllocated;
      totalBudgetSpent += p.budgetSpent;

      for (const m of p.milestones) {
        if (!m.completed && m.dueDate && m.dueDate < now) {
          overdueMilestones++;
        }
      }

      // Schedule pressure: programs in executing/scoped with target dates
      if ((p.phase === 'executing' || p.phase === 'scoped') && p.targetDate) {
        activeWithTargetCount++;
        if (p.targetDate < now) {
          overTargetCount++;
        }
      }
    }

    const budgetUtilization = totalBudgetAllocated > 0 ? totalBudgetSpent / totalBudgetAllocated : 0;
    const schedulePressureIndex = activeWithTargetCount > 0 ? overTargetCount / activeWithTargetCount : 0;

    return {
      totalPrograms: programs.length,
      phaseCounts,
      ragCounts,
      overdueMilestones,
      budgetUtilization,
      schedulePressureIndex,
    };
  }
}

export default ProgramTracker;
