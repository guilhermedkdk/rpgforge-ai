/**
 * Reading the sheet's equipment: which catalog weapons/armor appear in the equipment string, and
 * the selected class/background starting-equipment option text. Pure (catalog lists passed in).
 */
import type { CharacterFormData } from '../character/character-form-data';
import { parseEquipmentLine } from '../options/character-options';

export function getWeaponNamesFromEquipment(
  equipment: string | undefined,
  weaponsList: { name: string }[]
): string[] {
  const lines = (equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const weaponNames = new Set(weaponsList.map((w) => w.name));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    const { name } = parseEquipmentLine(line);
    if (weaponNames.has(name) && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function getArmorItemsFromEquipment<T extends { id: string; name: string }>(
  equipment: string | undefined,
  armorsList: T[]
): T[] {
  const lines = (equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const armorByName = new Map(armorsList.map((a) => [a.name, a]));
  const seen = new Set<string>();
  const result: T[] = [];
  for (const line of lines) {
    const { name } = parseEquipmentLine(line);
    const armor = armorByName.get(name);
    if (armor && !seen.has(armor.id)) {
      seen.add(armor.id);
      result.push(armor);
    }
  }
  return result;
}

export const getClassOptionText = (data: CharacterFormData): string | null =>
  data.startingEquipmentSelectedIndex != null &&
  data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]
    ? data.startingEquipmentOptions.options[data.startingEquipmentSelectedIndex].text
    : null;

export const getBackgroundOptionText = (data: CharacterFormData): string | null =>
  data.backgroundEquipmentSelectedIndex != null &&
  data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]
    ? data.backgroundEquipmentOptions.options[data.backgroundEquipmentSelectedIndex].text
    : null;
