import type { ClassMulticlassing } from '@rpgforce-ai/shared';

/**
 * SRD 5.2 multiclassing data per class, keyed by Open5e `sourceKey`. Two things Open5e never ships,
 * transcribed from the SRD 5.2 (CC BY): `primaryAbilities`, which the API returns empty for all 12
 * classes, and `grants`, the "As a Multiclass Character" section it does not ingest at all. Both are
 * phrased like the core-traits rows, so the derivation parses them with the helpers it already has.
 *
 * `grants` is ONLY the proficiency subset. A first level in a class also gives its Hit Point Die and
 * that level's features, and every level after grants its own: structural, not data.
 */
export const CLASS_MULTICLASSING: Readonly<Record<string, ClassMulticlassing>> = {
  'srd-2024_barbarian': {
    primaryAbilities: { mode: 'all', abilities: ['Strength'] },
    grants: {
      weaponProficiencies: 'Martial weapons',
      armorTraining: 'Shields',
    },
  },
  'srd-2024_bard': {
    primaryAbilities: { mode: 'all', abilities: ['Charisma'] },
    grants: {
      armorTraining: 'Light armor',
      toolProficiencies: 'Choose 1 Musical Instrument',
      skillChoice: { count: 1, from: 'any' },
    },
  },
  'srd-2024_cleric': {
    primaryAbilities: { mode: 'all', abilities: ['Wisdom'] },
    grants: {
      armorTraining: 'Light and Medium armor and Shields',
    },
  },
  'srd-2024_druid': {
    primaryAbilities: { mode: 'all', abilities: ['Wisdom'] },
    grants: {
      armorTraining: 'Light armor and Shields',
    },
  },
  'srd-2024_fighter': {
    // The only 'any' in the pack: "Strength or Dexterity".
    primaryAbilities: { mode: 'any', abilities: ['Strength', 'Dexterity'] },
    grants: {
      weaponProficiencies: 'Martial weapons',
      armorTraining: 'Light and Medium armor and Shields',
    },
  },
  'srd-2024_monk': {
    primaryAbilities: { mode: 'all', abilities: ['Dexterity', 'Wisdom'] },
    grants: {},
  },
  'srd-2024_paladin': {
    primaryAbilities: { mode: 'all', abilities: ['Strength', 'Charisma'] },
    grants: {
      weaponProficiencies: 'Martial weapons',
      armorTraining: 'Light and Medium armor and Shields',
    },
  },
  'srd-2024_ranger': {
    primaryAbilities: { mode: 'all', abilities: ['Dexterity', 'Wisdom'] },
    grants: {
      weaponProficiencies: 'Martial weapons',
      armorTraining: 'Light and Medium armor and Shields',
      skillChoice: { count: 1, from: 'class-list' },
    },
  },
  'srd-2024_rogue': {
    primaryAbilities: { mode: 'all', abilities: ['Dexterity'] },
    grants: {
      armorTraining: 'Light armor',
      toolProficiencies: "Thieves' Tools",
      skillChoice: { count: 1, from: 'class-list' },
    },
  },
  'srd-2024_sorcerer': {
    primaryAbilities: { mode: 'all', abilities: ['Charisma'] },
    grants: {},
  },
  'srd-2024_warlock': {
    primaryAbilities: { mode: 'all', abilities: ['Charisma'] },
    grants: {
      armorTraining: 'Light armor',
    },
  },
  'srd-2024_wizard': {
    primaryAbilities: { mode: 'all', abilities: ['Intelligence'] },
    grants: {},
  },
};

/** Attaches `normalized.multiclassing` to a CLASS rule item; other kinds pass through. */
export function applyMulticlassing(
  kind: string,
  sourceKey: string,
  normalized: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (kind !== 'CLASS' || !normalized) return normalized;
  const multiclassing = CLASS_MULTICLASSING[sourceKey];
  if (!multiclassing) return normalized;
  return { ...normalized, multiclassing };
}
