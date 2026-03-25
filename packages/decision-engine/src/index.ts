import { randomUUID } from 'node:crypto';
import type { Decision, DecisionRecordInput, DecisionStatus } from '@lattice-ops/shared';

export class DecisionEngine {
  private decisions: Map<string, Decision> = new Map();

  record(input: DecisionRecordInput): Decision {
    if (input.optionsConsidered.length < 2) {
      throw new Error('At least 2 options must be considered — single-option decisions bypass rigorous analysis');
    }

    const now = new Date();
    const decision: Decision = {
      id: randomUUID(),
      programId: input.programId,
      title: input.title,
      situation: input.situation,
      optionsConsidered: input.optionsConsidered,
      decision: input.decision,
      rationale: input.rationale,
      tradeOffs: input.tradeOffs,
      status: 'accepted',
      decidedBy: input.decidedBy,
      decidedAt: now,
      reviewDate: input.reviewDate,
      createdAt: now,
      updatedAt: now,
    };

    this.decisions.set(decision.id, decision);
    return decision;
  }

  getDecision(id: string): Decision | undefined {
    return this.decisions.get(id);
  }

  getAllDecisions(): Decision[] {
    return Array.from(this.decisions.values());
  }

  supersede(id: string, newDecisionId: string, reason: string): Decision {
    const old = this.decisions.get(id);
    if (!old) throw new Error(`Decision ${id} not found`);

    const replacement = this.decisions.get(newDecisionId);
    if (!replacement) throw new Error(`Replacement decision ${newDecisionId} not found`);

    old.status = 'superseded';
    old.supersededBy = newDecisionId;
    old.supersedeReason = reason;
    old.updatedAt = new Date();

    return old;
  }

  deprecate(id: string): Decision {
    const decision = this.decisions.get(id);
    if (!decision) throw new Error(`Decision ${id} not found`);

    decision.status = 'deprecated';
    decision.updatedAt = new Date();
    return decision;
  }

  getDue(): Decision[] {
    const now = new Date();
    return this.getAllDecisions().filter(
      (d) => d.status === 'accepted' && d.reviewDate && d.reviewDate < now
    );
  }

  buildBusinessCase(decisionId: string): string {
    const d = this.decisions.get(decisionId);
    if (!d) throw new Error(`Decision ${decisionId} not found`);

    const optionsSection = d.optionsConsidered
      .map((o, i) => {
        const pros = o.pros.map((p) => `    + ${p}`).join('\n');
        const cons = o.cons.map((c) => `    - ${c}`).join('\n');
        const cost = o.estimatedCost != null ? `    Estimated cost: $${o.estimatedCost.toLocaleString()}` : '';
        return `  Option ${i + 1}: ${o.option}\n${pros}\n${cons}${cost ? '\n' + cost : ''}`;
      })
      .join('\n\n');

    return [
      `BUSINESS CASE: ${d.title}`,
      `${'='.repeat(40)}`,
      '',
      `SITUATION`,
      d.situation,
      '',
      `OPTIONS ANALYSIS`,
      optionsSection,
      '',
      `DECISION`,
      d.decision,
      '',
      `RATIONALE`,
      d.rationale,
      '',
      `TRADE-OFFS`,
      d.tradeOffs,
      '',
      `DECIDED BY: ${d.decidedBy}`,
      `DECIDED AT: ${d.decidedAt.toISOString()}`,
      d.reviewDate ? `REVIEW BY: ${d.reviewDate.toISOString().split('T')[0]}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  toMarkdown(decisionId: string): string {
    const d = this.decisions.get(decisionId);
    if (!d) throw new Error(`Decision ${decisionId} not found`);

    const optionsTable = d.optionsConsidered
      .map(
        (o) =>
          `### ${o.option}\n- **Pros:** ${o.pros.join(', ')}\n- **Cons:** ${o.cons.join(', ')}${o.estimatedCost != null ? `\n- **Estimated Cost:** $${o.estimatedCost.toLocaleString()}` : ''}`,
      )
      .join('\n\n');

    return [
      `# ADR: ${d.title}`,
      '',
      `**Status:** ${d.status}`,
      `**Decided by:** ${d.decidedBy}`,
      `**Date:** ${d.decidedAt.toISOString().split('T')[0]}`,
      d.reviewDate ? `**Review by:** ${d.reviewDate.toISOString().split('T')[0]}` : '',
      '',
      `## Situation`,
      d.situation,
      '',
      `## Options Considered`,
      optionsTable,
      '',
      `## Decision`,
      d.decision,
      '',
      `## Rationale`,
      d.rationale,
      '',
      `## Trade-offs`,
      d.tradeOffs,
    ]
      .filter(Boolean)
      .join('\n');
  }
}

export default DecisionEngine;
