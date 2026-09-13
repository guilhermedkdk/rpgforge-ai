import { Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { AI_BUDGET_EXHAUSTED, AI_PROVIDER_UNAVAILABLE } from '@rpgforce-ai/shared';

/**
 * Codes for "the money ran out", not "the pace was too fast".
 *
 * All three arrive as 429, the same status as a genuine rate limit, so the code is the ONLY thing
 * that separates an error worth retrying from one that will answer the same way forever.
 */
const BUDGET_CODES = new Set([
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'insufficient_quota',
]);

/**
 * Translates a provider failure into what a caller can act on, or returns it untouched when it did
 * not come from the provider.
 *
 * Both outcomes are 503 and never 429, because in this API 429 means the caller is going too fast
 * and the web says exactly that. A spend ceiling reached by the deployment is not the caller's
 * fault and no amount of waiting clears it.
 */
export const toProviderFailure = (error: unknown, logger: Logger, context: string): unknown => {
  if (!(error instanceof OpenAI.APIError)) return error;

  const code = typeof error.code === 'string' ? error.code : '';

  if (BUDGET_CODES.has(code)) {
    logger.error(`AI spend ceiling reached during ${context} (${code}). Raise it to serve again.`);
    return new ServiceUnavailableException({ message: AI_BUDGET_EXHAUSTED });
  }

  logger.warn(`Provider failed during ${context}: ${error.status ?? '?'} ${code || error.name}`);
  return new ServiceUnavailableException({ message: AI_PROVIDER_UNAVAILABLE });
};
