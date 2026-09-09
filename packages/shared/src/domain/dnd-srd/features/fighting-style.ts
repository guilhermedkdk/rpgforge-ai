/**
 * Fighting Style, PER granting class.
 *
 * Fighter, Paladin and Ranger each grant their own, so a Fighter/Paladin has TWO to choose and they
 * must be different: with one flat field, picking in one panel rewrote the other. Every read and
 * write goes through here — the shape is a map keyed by the granting class's rule item id (`''` only
 * on sheets saved before the split, which the derivation rebinds).
 */
import type { CharacterFormData } from '../character/character-form-data';

export interface FightingStylePick {
  /** The Fighting Style FEAT chosen (also set for an option that has a matching feat). */
  featId: string | null;
  /** `OPTION` = the class's own alternative (Blessed/Druidic Warrior); `FEAT` = a Fighting Style feat. */
  mode: 'OPTION' | 'FEAT';
  /** Option key when `mode` is OPTION. */
  optionKey: string | null;
  /** Cantrips granted by the option (Blessed Warrior / Druidic Warrior). */
  cantrips: string[];
}

const EMPTY_PICK: FightingStylePick = {
  featId: null,
  mode: 'OPTION',
  optionKey: null,
  cantrips: [],
};

/** Bucket key for a Fighting Style instance: the granting class, `''` on pre-multiclass data. */
export const fightingStyleClassKey = (feature: { sourceClassId?: string } | undefined): string =>
  feature?.sourceClassId ?? '';

/** This class's pick; a legacy bare bucket answers while it is the only one stored. */
export function getFightingStylePick(
  data: Pick<CharacterFormData, 'fightingStyleByClass'>,
  feature: { sourceClassId?: string } | undefined
): FightingStylePick {
  const byClass = data.fightingStyleByClass ?? {};
  const key = fightingStyleClassKey(feature);
  const own =
    byClass[key] ?? (key !== '' && Object.keys(byClass).length <= 1 ? byClass[''] : undefined);
  return { ...EMPTY_PICK, ...(own ?? {}) };
}

/** Replaces one class's pick, leaving the other classes' untouched. */
export function setFightingStylePick(
  data: CharacterFormData,
  feature: { sourceClassId?: string } | undefined,
  patch: Partial<FightingStylePick>
): Partial<CharacterFormData> {
  const byClass = { ...(data.fightingStyleByClass ?? {}) };
  const key = fightingStyleClassKey(feature);
  const current = getFightingStylePick(data, feature);
  // Writing under the real class also retires the legacy bare bucket this pick came from.
  if (key !== '' && byClass[''] != null && byClass[key] == null) delete byClass[''];
  byClass[key] = { ...current, ...patch };
  return { fightingStyleByClass: byClass };
}

/** Every stored pick, with the class key that owns it. */
export function getFightingStyleEntries(
  data: Pick<CharacterFormData, 'fightingStyleByClass'>
): Array<{ classKey: string; pick: FightingStylePick }> {
  return Object.entries(data.fightingStyleByClass ?? {}).map(([classKey, pick]) => ({
    classKey,
    pick: { ...EMPTY_PICK, ...pick },
  }));
}

/**
 * Every Fighting Style feat the character owns, across classes plus the Champion's extra slot.
 * This is what "do I already have Defense?" and the feat pickers read.
 */
export function getAllFightingStyleFeatIds(
  data: Pick<CharacterFormData, 'fightingStyleByClass' | 'additionalFightingStyleFeatId'>
): string[] {
  const ids = getFightingStyleEntries(data)
    .map((e) => e.pick.featId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (data.additionalFightingStyleFeatId) ids.push(data.additionalFightingStyleFeatId);
  return [...new Set(ids)];
}

/** Every cantrip granted by a Blessed/Druidic Warrior option, across classes. */
export function getAllFightingStyleCantrips(
  data: Pick<CharacterFormData, 'fightingStyleByClass'>
): string[] {
  return [
    ...new Set(
      getFightingStyleEntries(data).flatMap((e) =>
        e.pick.mode === 'OPTION' ? e.pick.cantrips.filter(Boolean) : []
      )
    ),
  ];
}
