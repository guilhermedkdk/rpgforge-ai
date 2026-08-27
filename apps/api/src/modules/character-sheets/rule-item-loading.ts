/** Shared by the two services that rebuild a sheet from rule items (recompute + list previews). */

/** Every rule-item read here goes through `mapToRuleItemResponse`, which needs the tag rows. */
export const RULE_ITEM_INCLUDE = { tags: { include: { tag: true } } } as const;

/** A persisted id field, or null when it is absent/blank (older sheets omit optional ids). */
export function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
