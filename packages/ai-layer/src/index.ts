import Anthropic from '@anthropic-ai/sdk';
import type {
  ProgramContext,
  RiskAssessment,
  ExecutiveBrief,
  PortfolioGapAnalysis,
} from '@lattice-ops/shared';
import { AnalysisCache } from './cache.js';
import { RISK_ASSESSMENT_SYSTEM, EXECUTIVE_BRIEF_SYSTEM, GAP_ANALYSIS_SYSTEM } from './prompts.js';

export { AnalysisCache } from './cache.js';
export { RISK_ASSESSMENT_SYSTEM, EXECUTIVE_BRIEF_SYSTEM, GAP_ANALYSIS_SYSTEM } from './prompts.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

interface AILayerOptions {
  apiKey?: string;
  model?: string;
  cacheTtlHours?: number;
  baseURL?: string;
}

export class AILayer {
  private client: Anthropic;
  private model: string;
  private cache: AnalysisCache;

  constructor(options: AILayerOptions = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? 'test-key',
      baseURL: options.baseURL,
    });
    this.model = options.model ?? DEFAULT_MODEL;
    this.cache = new AnalysisCache(options.cacheTtlHours ?? 24);
  }

  async assessRisk(context: ProgramContext): Promise<RiskAssessment> {
    const cacheKey = AnalysisCache.hashInput({ capability: 'risk', ...context });
    const cached = this.cache.get<RiskAssessment>(cacheKey);
    if (cached) return cached;

    const result = await this.callClaude<RiskAssessment>(
      RISK_ASSESSMENT_SYSTEM,
      JSON.stringify(context),
    );

    this.cache.set(cacheKey, result);
    return result;
  }

  async generateBrief(context: ProgramContext): Promise<ExecutiveBrief> {
    const cacheKey = AnalysisCache.hashInput({ capability: 'brief', ...context });
    const cached = this.cache.get<ExecutiveBrief>(cacheKey);
    if (cached) return cached;

    const result = await this.callClaude<ExecutiveBrief>(
      EXECUTIVE_BRIEF_SYSTEM,
      JSON.stringify(context),
    );

    this.cache.set(cacheKey, result);
    return result;
  }

  async analyzeGaps(contexts: ProgramContext[]): Promise<PortfolioGapAnalysis> {
    const cacheKey = AnalysisCache.hashInput({ capability: 'gaps', contexts });
    const cached = this.cache.get<PortfolioGapAnalysis>(cacheKey);
    if (cached) return cached;

    const result = await this.callClaude<PortfolioGapAnalysis>(
      GAP_ANALYSIS_SYSTEM,
      JSON.stringify(contexts),
    );

    this.cache.set(cacheKey, result);
    return result;
  }

  private async callClaude<T>(systemPrompt: string, userContent: string): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      throw new Error(`Failed to parse Claude response as JSON: ${textBlock.text.slice(0, 200)}`);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export default AILayer;
