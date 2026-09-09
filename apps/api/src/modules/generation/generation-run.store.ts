import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  GenerateCharacterMeta,
  GenerationAnswer,
  GenerationQuestion,
} from '@rpgforce-ai/shared';

/** The wizard interaction accumulated across the two generation calls, before the sheet exists. */
export interface PendingGenerationRun {
  userId: string;
  packId: string;
  prompt: string;
  note: string;
  questions: GenerationQuestion[];
  answers: GenerationAnswer[];
  meta: GenerateCharacterMeta | null;
  model: string;
  createdAt: number;
}

/** A run is only worth keeping while the user is still reviewing the draft. */
const TTL_MS = 2 * 60 * 60 * 1000;
const SWEEP_EVERY = 50;

/**
 * An in-flight wizard interaction, keyed by an opaque id the client echoes back on save.
 *
 * In memory on purpose: only the last of the three requests persists anything, so an abandoned draft
 * never reaches the database, and a restart loses the log but never the sheet.
 */
@Injectable()
export class GenerationRunStore {
  private readonly logger = new Logger(GenerationRunStore.name);
  private readonly runs = new Map<string, PendingGenerationRun>();
  private writesSinceSweep = 0;

  /** Opens a run with the clarifying round and returns the id the client carries from here on. */
  start(input: Omit<PendingGenerationRun, 'answers' | 'meta' | 'createdAt'>): string {
    const id = randomUUID();
    this.runs.set(id, { ...input, answers: [], meta: null, createdAt: Date.now() });
    this.sweepPeriodically();
    return id;
  }

  /** Records the answered round + the model's justification. No-op when the id is unknown/expired. */
  complete(id: string, patch: { answers: GenerationAnswer[]; meta: GenerateCharacterMeta }): void {
    const run = this.runs.get(id);
    if (!run) return;
    run.answers = patch.answers;
    run.meta = patch.meta;
  }

  /** Reads and removes a run: it is persisted at most once, when its draft becomes a sheet. */
  take(id: string, userId: string): PendingGenerationRun | null {
    const run = this.runs.get(id);
    if (!run) return null;
    this.runs.delete(id);
    // A run belongs to whoever generated it; a mismatched id is dropped rather than mislinked.
    if (run.userId !== userId) {
      this.logger.warn(`Generation run ${id} claimed by a different user; discarded`);
      return null;
    }
    return run;
  }

  // No timer: a background interval would keep the process alive and needs teardown. Sweeping on
  // write is enough for a map that only grows when someone is actively using the wizard.
  private sweepPeriodically(): void {
    this.writesSinceSweep += 1;
    if (this.writesSinceSweep < SWEEP_EVERY) return;
    this.writesSinceSweep = 0;
    const cutoff = Date.now() - TTL_MS;
    for (const [id, run] of this.runs) {
      if (run.createdAt < cutoff) this.runs.delete(id);
    }
  }
}
