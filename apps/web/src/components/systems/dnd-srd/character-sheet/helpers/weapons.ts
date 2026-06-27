import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';

export function getWeaponPropertyNames(norm: Record<string, unknown>): string[] {
  const raw = norm.properties as unknown;
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const p of raw) {
    if (typeof p === 'string') names.push(p);
    else if (p && typeof p === 'object' && 'property' in p) {
      const prop = (p as { property?: { name?: string } }).property;
      const name = prop?.name;
      if (typeof name === 'string') names.push(name);
    }
  }
  return names;
}

export function getWeaponAttackAbilityMod(
  norm: Record<string, unknown>,
  modifiers: Record<string, number>,
  tagKeys: string[] = []
): number {
  const propNames = getWeaponPropertyNames(norm);
  const propLower = propNames.map((p) => p.toLowerCase());
  const tagSet = new Set(tagKeys);
  const str = modifiers['Strength'] ?? 0;
  const dex = modifiers['Dexterity'] ?? 0;

  // Ranged weapons use Dexterity (detected via Ammunition property).
  const isRanged = propLower.some((p) => p === 'ammunition') || tagSet.has('weapon:property:ammunition');
  const isFinesse = propLower.some((p) => p === 'finesse') || tagSet.has('weapon:property:finesse');

  if (isRanged) return dex;
  if (isFinesse) return Math.max(str, dex);
  return str;
}

/** Normalize fighting style option/feat names for comparison. */
export function normalizeFightingStyleOptionLabel(name: string): string {
  return name.trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
}

export function hasSelectedFightingStyle(
  data: CharacterFormData,
  feats: RuleItemResponse[],
  styleNormalized: string
): boolean {
  const hasFsFeature = (data.featureDetails ?? []).some(
    (f) => f.name.trim().toLowerCase() === 'fighting style'
  );
  if (!hasFsFeature) return false;

  if (data.fightingStyleFeatId) {
    const wf = feats.find((f) => f.id === data.fightingStyleFeatId);
    if (wf && normalizeFightingStyleOptionLabel(wf.name) === styleNormalized) return true;
  }

  for (const fd of data.featureDetails ?? []) {
    if (fd.name.trim().toLowerCase() !== 'fighting style') continue;
    const selKey = data.raceTraitSelections?.[fd.name];
    if (!selKey) continue;
    const opt = fd.options?.find((o) => o.key === selKey);
    if (opt && normalizeFightingStyleOptionLabel(opt.label) === styleNormalized) return true;
  }
  return false;
}

// Eldritch Invocation prerequisite logic moved to lib/dnd-srd/eldritch-invocations.ts so the
// derivation (which prunes orphaned selections on level/feature changes) can share it.
export { eldritchInvocationPrerequisiteAllowsSelect } from '@/lib/dnd-srd/eldritch-invocations';
