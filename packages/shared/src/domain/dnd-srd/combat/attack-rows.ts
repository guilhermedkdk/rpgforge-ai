/**
 * The attack rows a sheet shows: one per weapon in the equipment, plus the always-present Unarmed
 * Strike. Ported out of the web section so the PDF export renders the same numbers.
 *
 * Covers what the SRD changes about an attack: proficiency (by the character's own weapon rules),
 * the Archery fighting style, and Martial Arts (die substitution plus Str-or-Dex).
 */
import type { NormalizedWeapon, RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import {
  isWeaponProficientByRules,
  parseWeaponProficiencyRules,
} from '../proficiencies/proficiencies';
import { getWeaponAttackAbilityMod, hasSelectedFightingStyle } from '../equipment/weapons';
import { getWeaponNamesFromEquipment } from '../equipment/equipment-selection';
import { getAllWeaponMasteryWeaponIds } from '../features/weapon-mastery';
import { DND_ATTRIBUTES } from '../derivation/ability-progression';
import { getEffectiveProficiencies } from '../derivation/derived-character-stats';
import { getAbilityResolver, type AbilityResolver } from '../derivation/sheet-display-stats';

const UNARMED_STRIKE = 'Unarmed Strike';
const MARTIAL_ARTS = 'martial arts';
const ARCHERY_TO_HIT_BONUS = 2;

export interface AttackRow {
  weaponName: string;
  /** Absent when the line does not resolve to a catalog weapon. */
  weaponId: string | null;
  toHit: string;
  damage: string;
  proficient: boolean;
  /** Mastery is the union across classes: on the row it only matters THAT the weapon is mastered. */
  mastery: boolean;
}

export interface AttackRowsParams {
  data: CharacterFormData;
  weapons: RuleItemResponse[];
  feats: RuleItemResponse[];
  proficiencyBonus: number | null | undefined;
  /** Reuses the editor's resolver when it has one; built from `data` otherwise. */
  abilities?: AbilityResolver;
}

type WeaponNormalized = NormalizedWeapon &
  Record<string, unknown> & {
    weapon?: {
      damageDice?: string;
      damageType?: { name?: string } | null;
      properties?: Array<{ property?: { name?: string | null } | null }> | null;
    } | null;
  };

function parseDiceFaces(dice: string | null | undefined): number | null {
  if (!dice) return null;
  const compact = String(dice).replace(/\s+/g, '').trim();
  if (/^\d+$/.test(compact)) return parseInt(compact, 10);
  const match = compact.match(/^(\d+)?d(\d+)$/i) ?? compact.match(/d(\d+)/i);
  if (!match) return null;
  const faces = parseInt(match[match.length - 1], 10);
  return Number.isFinite(faces) ? faces : null;
}

function findMartialArtsFeature(featureDetails: FeatureDetail[]): FeatureDetail | undefined {
  return featureDetails.find((f) => f.name.trim().toLowerCase() === MARTIAL_ARTS);
}

/** The Martial Arts die at the character's level, from the feature's own table. */
function getMartialArtsDie(data: CharacterFormData): string | null {
  const feature = findMartialArtsFeature(data.featureDetails ?? []);
  const tables = feature?.tableData ?? [];
  if (tables.length === 0) return null;

  const level = Math.max(1, Math.min(20, data.level ?? 1));
  const dieTables = tables.filter((t) =>
    (t.rows ?? []).some((r) => /d\s*\d+/i.test(String(r.value ?? '')))
  );
  const candidates = dieTables.length > 0 ? dieTables : tables;
  const table =
    candidates.find((t) => t.label.trim().toLowerCase() === 'martial arts die') ??
    candidates.find((t) => t.label.trim().toLowerCase().includes('martial arts die')) ??
    candidates.find((t) => t.label.trim().toLowerCase().includes(MARTIAL_ARTS)) ??
    candidates[0];

  const value = (table?.rows ?? [])
    .filter((r) => r.level <= level)
    .sort((a, b) => b.level - a.level)[0]
    ?.value?.trim();
  if (!value) return null;

  const compact = value.replace(/\s+/g, '');
  const withCount = compact.match(/^(\d+)d(\d+)$/i);
  if (withCount) return `${withCount[1]}d${withCount[2]}`;
  const onlyDie = compact.match(/^d(\d+)$/i) ?? compact.match(/d(\d+)/i);
  return onlyDie ? `1d${onlyDie[1]}` : null;
}

function weaponHasAmmunition(tagKeys: string[], normalized: WeaponNormalized): boolean {
  if (tagKeys.includes('weapon:property:ammunition')) return true;
  const named = (properties: unknown): boolean =>
    Array.isArray(properties) &&
    properties.some((entry) => {
      if (!entry || typeof entry !== 'object' || !('property' in entry)) return false;
      const property = (entry as { property?: { name?: unknown } }).property;
      return (
        typeof property?.name === 'string' && property.name.trim().toLowerCase() === 'ammunition'
      );
    });
  return named(normalized.weapon?.properties) || named(normalized.properties);
}

function baseDamageOf(normalized: WeaponNormalized): string {
  const record = normalized as Record<string, unknown>;
  for (const key of ['damage', 'damageDice', 'damage_dice']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return typeof normalized.weapon?.damageDice === 'string' ? normalized.weapon.damageDice : '';
}

/** The rows exactly as the Attacks section renders them. */
export function computeAttackRows({
  data,
  weapons,
  feats,
  proficiencyBonus,
  abilities,
}: AttackRowsParams): AttackRow[] {
  const { modifierOf } = abilities ?? getAbilityResolver(data);
  const modifiers = Object.fromEntries(DND_ATTRIBUTES.map((a) => [a, modifierOf(a)]));

  const fromEquipment = getWeaponNamesFromEquipment(data.equipment, weapons);
  const weaponNames = fromEquipment.includes(UNARMED_STRIKE)
    ? fromEquipment
    : [UNARMED_STRIKE, ...fromEquipment];

  const proficiencyRules = parseWeaponProficiencyRules(getEffectiveProficiencies(data));
  const hasArchery = hasSelectedFightingStyle(data, feats, 'archery');
  const masteredIds = getAllWeaponMasteryWeaponIds(data);

  const martialArtsDie = getMartialArtsDie(data);
  const unarmoredAndUnshielded = !data.equippedArmorId && !data.equippedShieldId;

  return weaponNames.map((weaponName): AttackRow => {
    const weapon = weapons.find((w) => w.name === weaponName);
    const normalized = (weapon?.normalized ?? {}) as WeaponNormalized;
    const tagKeys = weapon?.tagKeys ?? [];

    const category = tagKeys.includes('weapon:type:simple')
      ? 'simple'
      : tagKeys.includes('weapon:type:martial')
        ? 'martial'
        : undefined;
    const proficient = isWeaponProficientByRules(category, tagKeys, proficiencyRules);

    const isUnarmedStrike = weaponName.trim().toLowerCase() === UNARMED_STRIKE.toLowerCase();
    const isRangedByAmmo = tagKeys.includes('weapon:property:ammunition');
    const isMartialArtsWeapon =
      (category === 'simple' && !isRangedByAmmo) ||
      (category === 'martial' && tagKeys.includes('weapon:property:light') && !isRangedByAmmo);
    const martialArtsApplies =
      Boolean(martialArtsDie) && unarmoredAndUnshielded && (isUnarmedStrike || isMartialArtsWeapon);

    const baseMod = martialArtsApplies
      ? Math.max(modifiers['Strength'] ?? 0, modifiers['Dexterity'] ?? 0)
      : getWeaponAttackAbilityMod(normalized, modifiers, tagKeys);

    let damageDice = baseDamageOf(normalized);
    if (martialArtsApplies && martialArtsDie) {
      const martialFaces = parseDiceFaces(martialArtsDie);
      const currentFaces = parseDiceFaces(damageDice);
      if (martialFaces != null && currentFaces != null && currentFaces <= martialFaces) {
        damageDice = martialArtsDie;
      }
    }

    const proficiencyToHit =
      proficiencyBonus != null && (isUnarmedStrike || proficient) ? proficiencyBonus : 0;
    const archeryToHit =
      hasArchery && !isUnarmedStrike && weapon && weaponHasAmmunition(tagKeys, normalized)
        ? ARCHERY_TO_HIT_BONUS
        : 0;
    const totalToHit = baseMod + proficiencyToHit + archeryToHit;

    // Proficient but no level yet: the sheet shows the ability part and an em dash for the rest.
    const toHit =
      proficient && proficiencyBonus == null
        ? `${baseMod >= 0 ? '+' : ''}${baseMod} —`
        : `${totalToHit >= 0 ? '+' : ''}${totalToHit}`;

    const damage = damageDice
      ? baseMod !== 0
        ? `${damageDice} ${baseMod > 0 ? '+' : '-'} ${Math.abs(baseMod)}`
        : damageDice
      : baseMod !== 0
        ? `${baseMod > 0 ? '+' : ''}${baseMod}`
        : '';

    return {
      weaponName,
      weaponId: weapon?.id ?? null,
      toHit,
      damage,
      proficient,
      mastery: weapon != null && masteredIds.includes(weapon.id),
    };
  });
}
