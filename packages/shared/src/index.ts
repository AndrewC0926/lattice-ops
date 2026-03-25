// ============================================================
// Program Tracker Types
// ============================================================

export type Phase = 'framed' | 'scoped' | 'executing' | 'scaled' | 'closed';

export type RAGStatus = 'green' | 'amber' | 'red';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface Program {
  id: string;
  title: string;
  description: string;
  phase: Phase;
  ragStatus: RAGStatus;
  ragReason?: string;
  priority: Priority;
  owner: string;
  stakeholders: string[];
  targetDate?: Date;
  actualCompletionDate?: Date;
  budgetAllocated: number;
  budgetSpent: number;
  aiRiskScore?: number;
  siteId?: string;
  milestones: Milestone[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  id: string;
  programId: string;
  title: string;
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
  blockedBy: string[];
}

export interface ProgramRegistrationInput {
  title: string;
  description: string;
  priority?: Priority;
  owner: string;
  stakeholders?: string[];
  siteId?: string;
}

export interface PhaseTransitionResult {
  success: boolean;
  blocked: boolean;
  fromPhase: Phase;
  toPhase?: Phase;
  validationErrors: string[];
}

export interface PortfolioHealth {
  totalPrograms: number;
  phaseCounts: Record<Phase, number>;
  ragCounts: Record<RAGStatus, number>;
  overdueMilestones: number;
  budgetUtilization: number;
  schedulePressureIndex: number;
}

// ============================================================
// Ops Intelligence Types
// ============================================================

export interface Metric {
  id?: string;
  siteId?: string;
  programId?: string;
  metricKey: string;
  metricVal: number;
  unit?: string;
  source: string;
  recordedAt: Date;
}

export interface SiteHealthReport {
  siteId: string;
  healthScore: number;
  energyEfficiency: number;
  facilityTicketBacklog: number;
  spaceUtilization: number;
  openAlerts: number;
}

export interface AnomalyEvent {
  metricKey: string;
  siteId?: string;
  currentVal: number;
  baselineVal: number;
  zScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
}

export interface SiteScorecard {
  siteId: string;
  siteName: string;
  healthScore: number;
  mttr: number;
  utilization: number;
  openP0: number;
  openP1: number;
  anomalyCount: number;
}

// ============================================================
// AI Layer Types
// ============================================================

export interface ProgramContext {
  id: string;
  title: string;
  phase: Phase;
  ragStatus: RAGStatus;
  ragReason?: string;
  milestoneCount: number;
  milestonesComplete: number;
  blockedMilestones: number;
  budgetAllocated: number;
  budgetSpent: number;
  budgetUtilization: number;
  stakeholders: string[];
  targetDate?: Date;
  daysUntilTarget?: number;
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  topBlockers: string[];
  mitigationActions: string[];
  confidenceNote: string;
  evidenceMissing: boolean;
}

export interface ExecutiveBrief {
  bluf: string;
  situation: string;
  recommendation: string;
  keyRisks: string[];
  nextMilestone: string;
  budgetStatus: string;
  evidenceMissing: boolean;
}

export interface PortfolioGapAnalysis {
  gapsIdentified: GapItem[];
  systemicRisks: string[];
  prioritizedActions: string[];
  evidenceMissing: boolean;
}

export interface GapItem {
  category: string;
  title: string;
  affectedPrograms: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

// ============================================================
// Decision Engine Types
// ============================================================

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'deprecated';

export interface DecisionOption {
  option: string;
  pros: string[];
  cons: string[];
  estimatedCost?: number;
}

export interface Decision {
  id: string;
  programId?: string;
  title: string;
  situation: string;
  optionsConsidered: DecisionOption[];
  decision: string;
  rationale: string;
  tradeOffs: string;
  status: DecisionStatus;
  supersededBy?: string;
  supersedeReason?: string;
  decidedBy: string;
  decidedAt: Date;
  reviewDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecisionRecordInput {
  programId?: string;
  title: string;
  situation: string;
  optionsConsidered: DecisionOption[];
  decision: string;
  rationale: string;
  tradeOffs: string;
  decidedBy: string;
  reviewDate?: Date;
}

// ============================================================
// Site Types
// ============================================================

export type SiteType = 'hq' | 'manufacturing' | 'r_and_d' | 'testing' | 'field';

export interface Site {
  id: string;
  name: string;
  siteType: SiteType;
  location: string;
  status: 'active' | 'inactive' | 'planned';
  sqFootage?: number;
  headcountCap?: number;
  opexMonthly?: number;
}
