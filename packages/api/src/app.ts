import express, { type Request, type Response, type NextFunction, type Express } from 'express';
import { ProgramTracker } from '@lattice-ops/program-tracker';
import { OpsIntelligence } from '@lattice-ops/ops-intelligence';
import { AILayer } from '@lattice-ops/ai-layer';
import { DecisionEngine } from '@lattice-ops/decision-engine';
import type { ProgramContext } from '@lattice-ops/shared';

function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

export function createApp(options?: { aiBaseURL?: string }): Express {
  const app = express();
  app.use(express.json());

  const tracker = new ProgramTracker();
  const intel = new OpsIntelligence();
  const ai = new AILayer({ baseURL: options?.aiBaseURL });
  const decisions = new DecisionEngine();

  // ---- Health ----
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ---- Programs ----
  app.get('/api/programs', (req: Request, res: Response) => {
    let programs = tracker.getAllPrograms();
    const { phase, priority, rag } = req.query;
    if (phase) programs = programs.filter((p) => p.phase === phase);
    if (priority) programs = programs.filter((p) => p.priority === priority);
    if (rag) programs = programs.filter((p) => p.ragStatus === rag);
    res.json(programs);
  });

  app.post('/api/programs', (req: Request, res: Response) => {
    const { title, description, owner, priority, stakeholders, siteId } = req.body;
    if (!title || !description || !owner) {
      res.status(400).json({ error: 'title, description, and owner are required' });
      return;
    }
    const program = tracker.register({ title, description, owner, priority, stakeholders, siteId });
    res.status(201).json(program);
  });

  app.get('/api/programs/:id', (req: Request, res: Response) => {
    const program = tracker.getProgram(param(req, 'id'));
    if (!program) { res.status(404).json({ error: 'Program not found' }); return; }
    res.json(program);
  });

  app.post('/api/programs/:id/advance', (req: Request, res: Response) => {
    try {
      const result = tracker.advance(param(req, 'id'));
      res.json(result);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/programs/:id/milestones', (req: Request, res: Response) => {
    const { title, dueDate } = req.body;
    if (!title) { res.status(400).json({ error: 'title is required' }); return; }
    try {
      const milestone = tracker.addMilestone(param(req, 'id'), title, dueDate ? new Date(dueDate) : undefined);
      res.status(201).json(milestone);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/programs/:id/milestones/:mid/complete', (req: Request, res: Response) => {
    try {
      const milestone = tracker.completeMilestone(param(req, 'id'), param(req, 'mid'));
      res.json(milestone);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/programs/:id/rag', (req: Request, res: Response) => {
    const { status, reason } = req.body;
    if (!status || !reason) { res.status(400).json({ error: 'status and reason are required' }); return; }
    try {
      tracker.updateRAG(param(req, 'id'), status, reason);
      res.json(tracker.getProgram(param(req, 'id')));
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  app.post('/api/programs/:id/spend', (req: Request, res: Response) => {
    const { amount } = req.body;
    if (amount == null || typeof amount !== 'number') {
      res.status(400).json({ error: 'amount (number) is required' });
      return;
    }
    try {
      tracker.recordSpend(param(req, 'id'), amount);
      res.json(tracker.getProgram(param(req, 'id')));
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  // ---- AI ----
  function toProgramContext(id: string): ProgramContext | null {
    const p = tracker.getProgram(id);
    if (!p) return null;
    const now = new Date();
    return {
      id: p.id,
      title: p.title,
      phase: p.phase,
      ragStatus: p.ragStatus,
      ragReason: p.ragReason,
      milestoneCount: p.milestones.length,
      milestonesComplete: p.milestones.filter((m) => m.completed).length,
      blockedMilestones: p.milestones.filter((m) => m.blockedBy.length > 0).length,
      budgetAllocated: p.budgetAllocated,
      budgetSpent: p.budgetSpent,
      budgetUtilization: p.budgetAllocated > 0 ? p.budgetSpent / p.budgetAllocated : 0,
      stakeholders: p.stakeholders,
      targetDate: p.targetDate,
      daysUntilTarget: p.targetDate
        ? Math.ceil((p.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : undefined,
    };
  }

  app.post('/api/ai/risk/:programId', async (req: Request, res: Response) => {
    const ctx = toProgramContext(param(req, 'programId'));
    if (!ctx) { res.status(404).json({ error: 'Program not found' }); return; }
    try {
      const result = await ai.assessRisk(ctx);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ai/brief/:programId', async (req: Request, res: Response) => {
    const ctx = toProgramContext(param(req, 'programId'));
    if (!ctx) { res.status(404).json({ error: 'Program not found' }); return; }
    try {
      const result = await ai.generateBrief(ctx);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/ai/gaps', async (_req: Request, res: Response) => {
    const programs = tracker.getAllPrograms();
    const contexts = programs.map((p) => toProgramContext(p.id)!).filter(Boolean);
    try {
      const result = await ai.analyzeGaps(contexts);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ---- Dashboard ----
  app.get('/api/dashboard/posture', (_req: Request, res: Response) => {
    res.json(intel.getPortfolioPosture());
  });

  app.get('/api/dashboard/sites', (_req: Request, res: Response) => {
    const posture = intel.getPortfolioPosture();
    const scorecards = posture.map((s) => intel.getSiteScorecard(s.siteId)).filter(Boolean);
    res.json(scorecards);
  });

  app.get('/api/dashboard/drift', (req: Request, res: Response) => {
    const days = parseInt(req.query.days as string) || 30;
    res.json(intel.getDriftEvents(days));
  });

  app.get('/api/dashboard/scorecard', (_req: Request, res: Response) => {
    const health = tracker.portfolioHealth();
    const posture = intel.getPortfolioPosture();
    res.json({
      portfolio: health,
      siteCount: posture.length,
      avgHealthScore: posture.length > 0
        ? Math.round(posture.reduce((s, p) => s + p.healthScore, 0) / posture.length)
        : 0,
    });
  });

  // ---- Decisions ----
  app.get('/api/decisions', (_req: Request, res: Response) => {
    res.json(decisions.getAllDecisions());
  });

  app.post('/api/decisions', (req: Request, res: Response) => {
    try {
      const decision = decisions.record(req.body);
      res.status(201).json(decision);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/decisions/due', (_req: Request, res: Response) => {
    res.json(decisions.getDue());
  });

  app.post('/api/decisions/:id/supersede', (req: Request, res: Response) => {
    const { newDecisionId, reason } = req.body;
    if (!newDecisionId || !reason) {
      res.status(400).json({ error: 'newDecisionId and reason are required' });
      return;
    }
    try {
      const result = decisions.supersede(param(req, 'id'), newDecisionId, reason);
      res.json(result);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  return app;
}

export default createApp;
