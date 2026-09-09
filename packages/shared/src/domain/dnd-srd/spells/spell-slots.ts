/**
 * The spell slots a sheet actually has, assembled from the three sources the SRD defines: the
 * Multiclass Spellcaster table, a single class's own table, and the Pact Magic pool.
 *
 * Lives here rather than in the web hook because it is the only place that decides WHICH table
 * applies, and that decision has to hold for the sheet, the save validation and any backend read.
 */
import type { FeatureDetail } from '../character/character-form-data';
import {
  computeMulticlassCasterLevel,
  getMulticlassSpellSlots,
  usesMulticlassSpellSlots,
} from './multiclass-spellcasting';
import { getPactMagicInfo, getTableValueAtLevel, parseTableInt } from './spellcasting-limits';
import { isSlotAvailable } from './spells';
import type { CastingClass } from './class-spellcasting';

const SLOT_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function findSlotColumn(feature: FeatureDetail, spellLevel: number) {
  const ordinal = SLOT_ORDINALS[spellLevel - 1];
  return (feature.tableData ?? []).find(
    (t) => t.label.toLowerCase().includes(ordinal) && t.label.toLowerCase().includes('slot')
  );
}

export interface SpellSlotsInput {
  /** Every class that casts, from `getCastingClasses`. */
  castingClasses: readonly CastingClass[];
  /**
   * Pre-multiclass fallback: the single Spellcasting feature the whole sheet resolves to, used only
   * when no class resolved one (features without `sourceClassId`, or mid-hydration).
   */
  fallbackFeature?: FeatureDetail | null;
  /** Character level, paired with `fallbackFeature`. */
  fallbackLevel?: number;
}

export interface SpellSlotsResult {
  /** True once 2+ classes have the Spellcasting feature; Pact Magic never counts toward it. */
  usesMulticlassTable: boolean;
  /** Combined caster level. Computed always, but only USED when the multiclass table applies. */
  casterLevel: number;
  pactMagic: { slotLevel: number; totalSlots: number } | null;
  /** Slots per spell level 1-9, Pact Magic already added on top. */
  totalsByLevel: Record<number, number>;
  /** Levels the sheet can cast at. Its own map because a level can be usable with 0 in the table. */
  availabilityByLevel: Record<number, boolean>;
}

/**
 * Slots by spell level. Three SRD cases:
 * 1. two or more Spellcasting classes use the combined caster level, not either class's own;
 * 2. exactly one uses that class's table at ITS level;
 * 3. Pact Magic is a separate pool that ADDS on top, since either pool can cast the other's spells.
 */
export function computeSpellSlots({
  castingClasses,
  fallbackFeature = null,
  fallbackLevel = 1,
}: SpellSlotsInput): SpellSlotsResult {
  const casterInput = castingClasses.map((c) => ({ casterType: c.casterType, level: c.level }));
  const usesMulticlassTable = usesMulticlassSpellSlots(casterInput);
  const casterLevel = computeMulticlassCasterLevel(casterInput);
  const noCasterResolved = castingClasses.length === 0;

  const pactCaster = castingClasses.find((c) => c.casterType === 'PACT');
  const pactMagic = pactCaster
    ? getPactMagicInfo(pactCaster.feature, pactCaster.level)
    : noCasterResolved
      ? getPactMagicInfo(fallbackFeature, fallbackLevel)
      : null;

  const totalsByLevel: Record<number, number> = {};
  for (let level = 1; level <= 9; level += 1) totalsByLevel[level] = 0;
  const availabilityByLevel: Record<number, boolean> = {};

  if (usesMulticlassTable) {
    for (const [level, count] of Object.entries(getMulticlassSpellSlots(casterLevel))) {
      totalsByLevel[Number(level)] = count;
      availabilityByLevel[Number(level)] = true;
    }
  } else {
    const caster = castingClasses.find((c) => c.casterType !== 'PACT');
    const feature = noCasterResolved ? fallbackFeature : (caster?.feature ?? null);
    const featureLevel = noCasterResolved ? fallbackLevel : (caster?.level ?? 1);
    // Pact Magic has no per-level slot columns; its pool is added below instead.
    const isPactMagic = feature?.name.toLowerCase().includes('pact magic') ?? false;
    if (feature?.tableData && !isPactMagic) {
      for (let level = 1; level <= 9; level += 1) {
        const column = findSlotColumn(feature, level);
        if (!column) continue;
        const cell = getTableValueAtLevel(column.rows, featureLevel);
        totalsByLevel[level] = parseTableInt(cell);
        // Read separately from the count: a table cell is "—" or "0" when the level is out of reach.
        availabilityByLevel[level] = isSlotAvailable(cell);
      }
    }
  }

  if (pactMagic) {
    for (let level = 1; level <= pactMagic.slotLevel; level += 1) {
      totalsByLevel[level] += pactMagic.totalSlots;
      availabilityByLevel[level] = true;
    }
  }

  return { usesMulticlassTable, casterLevel, pactMagic, totalsByLevel, availabilityByLevel };
}
