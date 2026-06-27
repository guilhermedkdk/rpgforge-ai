import type { RuleItemResponse } from '@rpgforce-ai/shared';

export function isShieldItem(item: RuleItemResponse): boolean {
  const norm = (item.normalized ?? {}) as Record<string, unknown>;
  const armorCategory = (norm.armorCategory as string | undefined) ?? '';
  const categoryLower = armorCategory.toLowerCase();
  const nameLower = (item.name ?? '').toLowerCase();
  return (
    categoryLower.includes('shield') ||
    nameLower.includes('shield') ||
    nameLower.includes('escudo')
  );
}

/** Body armor: light, medium, or heavy (not shield, not natural-only). */
export function equippedItemIsLightMediumOrHeavyArmor(item: RuleItemResponse | null): boolean {
  if (!item || isShieldItem(item)) return false;
  const norm = (item.normalized ?? {}) as Record<string, unknown>;
  const topCat = String((norm.armorCategory as string | undefined) ?? '').toLowerCase();
  const armorData = norm.armor as { category?: string | null } | null | undefined;
  const subCat = String(armorData?.category ?? '').toLowerCase();
  const combined = `${topCat} ${subCat}`;
  return combined.includes('light') || combined.includes('medium') || combined.includes('heavy');
}
