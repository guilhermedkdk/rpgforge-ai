/** Weapon property / attack-ability + fighting-style selection helpers (pure). */
import { getFightingStylePick } from '../features/fighting-style';
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';

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
  const isRanged =
    propLower.some((p) => p === 'ammunition') || tagSet.has('weapon:property:ammunition');
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
  // Additional Fighting Style (Champion): second fighting-style feat slot, with its own gate.
  const hasAdditionalFsFeature = (data.featureDetails ?? []).some(
    (f) => f.source === 'subclass' && f.name.trim().toLowerCase() === 'additional fighting style'
  );
  if (hasAdditionalFsFeature && data.additionalFightingStyleFeatId) {
    const wf = feats.find((f) => f.id === data.additionalFightingStyleFeatId);
    if (wf && normalizeFightingStyleOptionLabel(wf.name) === styleNormalized) return true;
  }

  const instances = (data.featureDetails ?? []).filter(
    (f) => f.name.trim().toLowerCase() === 'fighting style'
  );
  if (instances.length === 0) return false;

  // Any granting class may be the one holding this style: a Fighter/Paladin has two picks.
  for (const feature of instances) {
    const pick = getFightingStylePick(data, feature);
    if (pick.featId) {
      const wf = feats.find((f) => f.id === pick.featId);
      if (wf && normalizeFightingStyleOptionLabel(wf.name) === styleNormalized) return true;
    }
    if (!pick.optionKey) continue;
    const opt = feature.options?.find((o) => o.key === pick.optionKey);
    if (opt && normalizeFightingStyleOptionLabel(opt.label) === styleNormalized) return true;
  }
  return false;
}
