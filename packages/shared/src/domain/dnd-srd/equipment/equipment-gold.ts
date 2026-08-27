/** Reading quantities / GP totals out of a multi-line equipment string. */
import { parseEquipmentLine } from '../options/character-options';

/** Returns total quantity of an item in equipment (all sources). Case-insensitive name match. */
export function getEquipmentItemQuantity(
  equipment: string | null | undefined,
  itemName: string
): number {
  if (!equipment?.trim() || !itemName?.trim()) return 0;
  const nameLower = itemName.trim().toLowerCase();
  return equipment
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((sum, line) => {
      const { quantity, name } = parseEquipmentLine(line);
      return name.toLowerCase() === nameLower ? sum + quantity : sum;
    }, 0);
}

/** Sums all GP from an equipment string (base GP from the sources). */
export function getTotalGP(equipment: string | null | undefined): number {
  if (!equipment?.trim()) return 0;
  return equipment
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((sum, line) => {
      const { quantity, name } = parseEquipmentLine(line);
      return name.toUpperCase() === 'GP' ? sum + quantity : sum;
    }, 0);
}

/**
 * Available GP = base (lines) - spent on purchases.
 * The GP lines (Class, Background, etc.) never change; only the total reflects purchases/sales.
 */
export function getAvailableGP(
  equipment: string | null | undefined,
  equipmentSpentGP: number = 0
): number {
  return Math.max(0, getTotalGP(equipment) - equipmentSpentGP);
}

/** Same as available GP but not clamped to zero (sheet view manual GP edits). */
export function getAvailableGpUnclamped(
  equipment: string | null | undefined,
  equipmentSpentGP: number = 0
): number {
  return getTotalGP(equipment) - equipmentSpentGP;
}
