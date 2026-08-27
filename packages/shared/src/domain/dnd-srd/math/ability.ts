/**
 * D&D 5e ability modifier: floor((score - 10) / 2).
 * A score of 0 means "not yet chosen" upstream; callers decide whether to treat
 * that as 0 — this function applies the raw formula.
 */
export function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
