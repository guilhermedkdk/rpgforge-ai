/**
 * D&D 5e proficiency bonus by character level: +2 at 1–4, +3 at 5–8, +4 at 9–12,
 * +5 at 13–16, +6 at 17–20. Level is clamped to 1–20.
 */
export function proficiencyBonusForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(20, Math.floor(level)));
  return 2 + Math.floor((clamped - 1) / 4);
}
