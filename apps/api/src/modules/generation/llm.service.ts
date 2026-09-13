import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { AiUsageService, type AiOperation } from '../ai-usage/ai-usage.service';
import { toProviderFailure } from '../../shared/openai/openai-error';

/**
 * Isolated so swapping the generation model (or provider) is a one-line change, like EmbeddingsService.
 *
 * Not the cheapest tier on purpose. Measured over 9 drafts each on the same battery, `-nano` reported
 * a request this pack cannot fulfil in 2/6 runs and invented one false report; `-mini` did 6/6 with
 * none, and spent FEWER output tokens (1042 vs 1247 per draft) because it retries itself less. That
 * is ~US$0.010 per generated sheet against ~US$0.003.
 */
export const GENERATION_MODEL = 'gpt-5.4-mini';

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiUsage: AiUsageService
  ) {
    this.client = new OpenAI({ apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY') });
  }

  /**
   * One chat completion constrained to a Zod schema via OpenAI structured outputs.
   *
   * Every call is recorded in the usage ledger, here rather than at the call sites: this is the one
   * place that talks to the provider, so no future caller can forget to account for what it spent.
   */
  async structured<S extends z.ZodType>(params: {
    schema: S;
    schemaName: string;
    system: string;
    user: string;
    /** Which feature is spending, and for whom, so a bill can be read per user and per step. */
    operation: AiOperation;
    userId?: string | null;
  }): Promise<z.infer<S>> {
    let completion;
    try {
      completion = await this.client.chat.completions.parse({
        model: GENERATION_MODEL,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        response_format: zodResponseFormat(params.schema, params.schemaName),
      });
    } catch (caught) {
      // A provider error is not a bug here, and an untranslated one reaches the browser as a 500
      // that tells the user to try again: for a spent budget that advice is wrong forever.
      throw toProviderFailure(caught, this.logger, params.schemaName);
    }

    // Recorded before the refusal/parse checks below: a refused answer was still billed.
    await this.aiUsage.record({
      userId: params.userId,
      operation: params.operation,
      model: completion.model ?? GENERATION_MODEL,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      cachedPromptTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    });

    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      this.logger.warn(`LLM refused (${params.schemaName}): ${message.refusal}`);
      throw new Error('A geração foi recusada pelo modelo. Tente reformular o conceito.');
    }
    const parsed = message?.parsed;
    if (!parsed) {
      throw new Error(`LLM returned no parsed output for ${params.schemaName}`);
    }
    return parsed;
  }
}
