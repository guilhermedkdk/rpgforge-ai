/**
 * What each model charges, in micro-dollars per MILLION tokens (1 USD = 1_000_000 micro).
 *
 * These are list prices and they change: confirm them against the provider's pricing page and edit
 * here. A model missing from this table is still RECORDED, with its token counts intact and a cost
 * of zero, because inventing a price would put fabricated money in an admin panel about money.
 */
export interface ModelPrice {
  /** Micro-dollars per million input (prompt) tokens. */
  input: number;
  /** Micro-dollars per million output (completion) tokens. */
  output: number;
  /**
   * Micro-dollars per million input tokens the provider served from its prompt cache, when the model
   * has that rate (~90% off). The wizard's system prompts are long and identical across calls, so
   * this is not a rounding detail: billing cached tokens at the full rate OVERSTATES the spend.
   */
  cachedInput?: number;
}

const USD = 1_000_000;

export const AI_PRICING: Record<string, ModelPrice> = {
  // Chat model behind the character wizard. Confirmed against the provider's own model page.
  'gpt-5.4-mini': { input: 0.75 * USD, cachedInput: 0.075 * USD, output: 4.5 * USD },
  // Embeddings behind the semantic search; output tokens do not apply.
  'text-embedding-3-small': { input: 0.02 * USD, output: 0 },
};

/**
 * The price for a model id. The provider answers with the dated snapshot it actually served
 * ("gpt-5.4-mini-2026-03-17"), so an exact-key lookup finds nothing and every call is priced at
 * zero: the longest configured key the id starts with is the one that applies.
 */
export function findModelPrice(model: string): ModelPrice | null {
  const exact = AI_PRICING[model];
  if (exact) return exact;

  const prefix = Object.keys(AI_PRICING)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? AI_PRICING[prefix] : null;
}

/**
 * Cost of one call in micro-dollars, rounded up so a fraction of a cent is never free.
 *
 * `cachedPromptTokens` is the slice of the prompt the provider served from its cache: it is part of
 * `promptTokens`, not extra, and it is billed at the model's cached rate when it has one.
 */
export function priceCall(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedPromptTokens = 0
): number {
  const price = findModelPrice(model);
  if (!price) return 0;

  const cached = Math.min(Math.max(cachedPromptTokens, 0), promptTokens);
  const full = promptTokens - cached;
  const input = (full * price.input + cached * (price.cachedInput ?? price.input)) / 1_000_000;
  const output = (completionTokens * price.output) / 1_000_000;
  return Math.ceil(input + output);
}

/** Micro-dollars as a readable amount, e.g. 12_400 -> "US$ 0.0124". */
export function formatMicroUsd(microUsd: number): string {
  return `US$ ${(microUsd / USD).toFixed(4)}`;
}
