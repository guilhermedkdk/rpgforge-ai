import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { priceCall } from './ai-pricing';

/** Where the call came from. One string per paid entry point, so a bill can be read by feature. */
export type AiOperation =
  | 'generation.questions'
  | 'generation.character'
  | 'search.embedding'
  | 'embed.backfill';

export interface RecordAiUsageInput {
  /** Absent for calls with nobody behind them (the ingestion CLI, an anonymous search). */
  userId?: string | null;
  operation: AiOperation;
  model: string;
  promptTokens: number;
  completionTokens?: number;
  /** Part of `promptTokens` that the provider served from its prompt cache, at ~90% off. */
  cachedPromptTokens?: number;
}

/**
 * The ledger of paid AI calls.
 *
 * Written for EVERY call, whether or not the draft it produced was saved: an abandoned wizard costs
 * exactly the same money. Recording never blocks or fails the call it is measuring, since losing a
 * row is a gap in a report while a thrown error is a broken feature.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record({
    userId,
    operation,
    model,
    promptTokens,
    completionTokens = 0,
    cachedPromptTokens = 0,
  }: RecordAiUsageInput): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId: userId ?? null,
          operation,
          model,
          promptTokens,
          completionTokens,
          cachedPromptTokens,
          totalTokens: promptTokens + completionTokens,
          costMicroUsd: priceCall(model, promptTokens, completionTokens, cachedPromptTokens),
        },
      });
    } catch (error) {
      this.logger.warn(`Could not record AI usage for ${operation}: ${String(error)}`);
    }
  }
}
