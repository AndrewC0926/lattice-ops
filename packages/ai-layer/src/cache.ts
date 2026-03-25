import { createHash } from 'node:crypto';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class AnalysisCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  static hashInput(input: unknown): string {
    const json = JSON.stringify(input, Object.keys(input as Record<string, unknown>).sort());
    return createHash('sha256').update(json).digest('hex');
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }
}
