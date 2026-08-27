// Parsers for the levels at which a feature is gained (structured `gained_at` + desc fallback).
import { escapeRegExp } from '../util/text-utils';

export function getGainedAtLevels(f: { gained_at?: unknown }): number[] {
  const gainedAt = f.gained_at;
  if (!gainedAt) return [];
  if (!Array.isArray(gainedAt)) return [];
  const levels: number[] = [];
  for (const x of gainedAt) {
    if (typeof x === 'number') levels.push(x);
    else if (x && typeof x === 'object' && 'level' in x)
      levels.push(Number((x as { level?: number }).level));
  }
  return levels;
}

/**
 * Recovers extra "gained again" levels from a feature's description. Open5e's structured `gained_at`
 * is sometimes incomplete — e.g. Bard Expertise has `gained_at: [2]` while the text says "At Bard
 * level 9, you gain Expertise in two more". Anchoring on "you gain <this feature>" keeps it to real
 * re-gains of the same feature (never a different benefit granted at that level).
 */
export function parseRepeatGainLevelsFromDesc(desc: string, featureName: string): number[] {
  const name = featureName.trim();
  if (!desc || name.length < 2) return [];
  const escaped = escapeRegExp(name);
  const re = new RegExp(
    `\\bat\\s+(?:[a-z]+\\s+)?level\\s+(\\d+)\\s*,?\\s+you\\s+gain\\s+${escaped}\\b`,
    'gi'
  );
  const levels: number[] = [];
  for (const m of desc.matchAll(re)) {
    const lvl = Number(m[1]);
    if (Number.isFinite(lvl) && lvl > 0) levels.push(lvl);
  }
  return levels;
}

export function getGainedAtEntriesAtOrBefore(
  gainedAt: unknown,
  currentLevel: number
): Array<{ level: number; detail?: string }> {
  if (!Array.isArray(gainedAt)) return [];
  const entries: Array<{ level: number; detail?: string }> = [];
  for (const x of gainedAt) {
    if (typeof x === 'number') {
      if (x <= currentLevel) entries.push({ level: x });
    } else if (x && typeof x === 'object' && 'level' in x) {
      const level = Number((x as { level?: number }).level);
      if (!Number.isFinite(level) || level > currentLevel) continue;
      const detailRaw = (x as { detail?: unknown }).detail;
      const detail = typeof detailRaw === 'string' ? detailRaw : undefined;
      entries.push({ level, detail });
    }
  }
  return entries.sort((a, b) => a.level - b.level);
}
