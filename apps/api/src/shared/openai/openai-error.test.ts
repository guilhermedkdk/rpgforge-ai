import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { AI_BUDGET_EXHAUSTED, AI_PROVIDER_UNAVAILABLE } from '@rpgforce-ai/shared';
import { toProviderFailure } from './openai-error';

const logger = () =>
  ({ error: vi.fn(), warn: vi.fn() }) as unknown as Logger & {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

/**
 * Built from a response BODY through the SDK's own factory, not by calling the constructor.
 *
 * The factory is what decides where `code` is read from, and that is the single field the whole
 * classification turns on: constructing the error by hand would test a shape the provider never
 * sends and pass while production failed.
 */
const apiError = (status: number, code: string): OpenAI.APIError =>
  OpenAI.APIError.generate(
    status,
    { error: { code, message: code } },
    code,
    new Headers()
  ) as OpenAI.APIError;

const codeOf = (thrown: unknown): unknown => (thrown as ServiceUnavailableException).getResponse();

describe('toProviderFailure', () => {
  it.each([
    'organization_spend_limit_exceeded',
    'project_spend_limit_exceeded',
    'insufficient_quota',
  ])('reports %s as a spent budget, and logs it as an error', (code) => {
    const log = logger();

    const failure = toProviderFailure(apiError(429, code), log, 'test');

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(codeOf(failure)).toMatchObject({ message: AI_BUDGET_EXHAUSTED });
    // The operator has to be able to tell this apart in the logs: nothing else fixes it.
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('keeps a genuine rate limit separate from a spent budget', () => {
    const log = logger();

    const failure = toProviderFailure(apiError(429, 'rate_limit_exceeded'), log, 'test');

    expect(codeOf(failure)).toMatchObject({ message: AI_PROVIDER_UNAVAILABLE });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('treats a provider outage as retryable', () => {
    const failure = toProviderFailure(apiError(503, 'server_error'), logger(), 'test');

    expect(codeOf(failure)).toMatchObject({ message: AI_PROVIDER_UNAVAILABLE });
  });

  it('never answers 429, which in this API means the caller is going too fast', () => {
    const failure = toProviderFailure(apiError(429, 'insufficient_quota'), logger(), 'test');

    expect((failure as ServiceUnavailableException).getStatus()).toBe(503);
  });

  it('leaves an error that did not come from the provider untouched', () => {
    const ours = new Error('LLM returned no parsed output for Draft');

    expect(toProviderFailure(ours, logger(), 'test')).toBe(ours);
  });
});
