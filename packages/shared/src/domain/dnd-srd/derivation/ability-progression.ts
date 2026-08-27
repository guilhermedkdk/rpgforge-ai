/**
 * Ability-score progression rules: base distribution (point buy / standard array), background
 * ability bonuses, class Ability Score Improvement gains, and the Epic Boon / Primal Champion /
 * Body-and-Mind capstone bonuses. Pure — operates on `CharacterFormData` (sub-)shapes + the shared
 * ability math — so both the web derivation and the backend recompute resolve effective ability
 * scores/modifiers identically. Web `character-state.ts` re-exports these.
 */
import { calcModifier } from '../math/ability';
import { sumClassFeatureGainCount } from '../features/feature-scope';
import {
  abilityScoreCeilingForAsi,
  getEffectiveAttribute,
  getEffectiveModifier,
} from '../math/attributes';
import type { CharacterFormData, AbilityScoreImprovementGainChoice } from '../character/character-form-data';

/** Canonical D&D ability names used across sheet state and derivation. */
export const DND_ATTRIBUTES: readonly string[] = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
];

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

function sumByAbilityMap(m: Record<string, number> | undefined): number {
  if (!m) return 0;
  return DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
}

export function formatModifier(score: number): string {
  const mod = calcModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Fields needed to know if ASI score increases are allowed (point buy / standard array / background bonuses). */
export type AbilityScoreImprovementPrerequisites = Pick<
  CharacterFormData,
  | 'abilityScoreMethod'
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreOption'
  | 'backgroundAbilityScoreIncrease'
>;

/** Same rule as the Attributes column: background must be chosen before ASI / background bonus rules apply. */
export function isCharacterBackgroundSelected(
  data: Pick<CharacterFormData, 'background' | 'backgroundRuleItemId'>
): boolean {
  return (data.background ?? '').trim() !== '' || data.backgroundRuleItemId != null;
}

/** All six abilities have values 8–15 and total point-buy cost equals {@link POINT_BUY_BUDGET}. */
export function isPointBuyAbilityDistributionComplete(attributes: Record<string, number>): boolean {
  let spent = 0;
  for (const a of DND_ATTRIBUTES) {
    const s = attributes[a] ?? POINT_BUY_MIN;
    if (s < POINT_BUY_MIN || s > POINT_BUY_MAX) return false;
    spent += POINT_BUY_COSTS[s] ?? 0;
  }
  return spent === POINT_BUY_BUDGET;
}

/** Each ability has one of 15, 14, 13, 12, 10, 8 with no duplicates. */
export function isStandardArrayAbilityDistributionComplete(
  attributes: Record<string, number>
): boolean {
  const values = DND_ATTRIBUTES.map((a) => attributes[a] ?? 0);
  if (values.some((v) => v <= 0)) return false;
  const sorted = [...values].sort((x, y) => x - y);
  const expected = [...STANDARD_ARRAY].sort((x, y) => x - y);
  if (sorted.length !== expected.length) return false;
  return sorted.every((v, i) => v === expected[i]);
}

/**
 * Background ability bonus pool is fully assigned, or the background grants no such pool.
 */
export function isBackgroundAbilityBonusDistributionComplete(
  backgroundAbilityScoreOption: CharacterFormData['backgroundAbilityScoreOption'],
  backgroundAbilityScoreIncrease: Record<string, number> | undefined
): boolean {
  if (!backgroundAbilityScoreOption) return true;
  const allowed =
    backgroundAbilityScoreOption.allowedAbilityNames.length > 0
      ? backgroundAbilityScoreOption.allowedAbilityNames
      : [...DND_ATTRIBUTES];
  const spent = allowed.reduce((s, a) => s + (backgroundAbilityScoreIncrease?.[a] ?? 0), 0);
  return spent === backgroundAbilityScoreOption.totalPoints;
}

/**
 * The whole creation-time ability allocation is placed: base distribution (per the chosen method)
 * plus every background bonus point. Single source for the save-time validation and the play-mode
 * lock. Does NOT cover ASI gains, which are progression, not creation.
 */
export function isBaseAbilityAllocationComplete(
  data: Pick<
    CharacterFormData,
    | 'abilityScoreMethod'
    | 'attributes'
    | 'background'
    | 'backgroundRuleItemId'
    | 'backgroundAbilityScoreOption'
    | 'backgroundAbilityScoreIncrease'
  >
): boolean {
  const method = data.abilityScoreMethod ?? 'standard-array';
  const baseComplete =
    method === 'point-buy'
      ? isPointBuyAbilityDistributionComplete(data.attributes ?? {})
      : isStandardArrayAbilityDistributionComplete(data.attributes ?? {});
  if (!baseComplete) return false;
  if (!isCharacterBackgroundSelected(data)) return false;
  return isBackgroundAbilityBonusDistributionComplete(
    data.backgroundAbilityScoreOption,
    data.backgroundAbilityScoreIncrease
  );
}

/**
 * True when the player may use Ability Score Improvement → Increase Scores (assign ASI points).
 * Requires: full point buy or full standard array, a selected background, and all background ability bonus points spent (if any).
 */
export function canApplyAbilityScoreImprovementASI(
  data: AbilityScoreImprovementPrerequisites
): boolean {
  const method = data.abilityScoreMethod ?? 'standard-array';
  const attrsOk =
    method === 'point-buy'
      ? isPointBuyAbilityDistributionComplete(data.attributes ?? {})
      : isStandardArrayAbilityDistributionComplete(data.attributes ?? {});
  if (!attrsOk) return false;
  if (!isCharacterBackgroundSelected(data)) return false;
  return isBackgroundAbilityBonusDistributionComplete(
    data.backgroundAbilityScoreOption,
    data.backgroundAbilityScoreIncrease
  );
}

/** User-facing prerequisite lines (what the player must do). */
const REQ_BASE_SCORES = 'Finish all six base ability scores (Point Buy or Standard Array).';
const REQ_SELECT_BACKGROUND = 'Select a background.';
const REQ_SPEND_BACKGROUND_BONUSES = 'Spend every point from your background ability bonus pool.';
/** “Feat” = the class feature named Ability Score Improvement (rule item), not the optional feat-vs-+2 picks inside it. */
const REQ_ASI_TEMPLATE = (n: number) =>
  n === 1
    ? 'Complete your Ability Score Improvement feat at this level.'
    : `Complete all ${n} Ability Score Improvement feats at this level.`;
const REQ_EPIC_BOON = 'Choose an Epic Boon feat and the +1 ability.';

/** Human-readable hints when {@link canApplyAbilityScoreImprovementASI} is false (UI tooltips). */
export function getAbilityScoreImprovementASIBlockedReasons(
  data: AbilityScoreImprovementPrerequisites
): string[] {
  const reasons: string[] = [];
  const method = data.abilityScoreMethod ?? 'standard-array';
  if (method === 'point-buy') {
    if (!isPointBuyAbilityDistributionComplete(data.attributes ?? {})) {
      reasons.push(REQ_BASE_SCORES);
    }
  } else if (!isStandardArrayAbilityDistributionComplete(data.attributes ?? {})) {
    reasons.push(REQ_BASE_SCORES);
  }
  if (!isCharacterBackgroundSelected(data)) {
    reasons.push(REQ_SELECT_BACKGROUND);
  } else if (
    !isBackgroundAbilityBonusDistributionComplete(
      data.backgroundAbilityScoreOption,
      data.backgroundAbilityScoreIncrease
    )
  ) {
    reasons.push(REQ_SPEND_BACKGROUND_BONUSES);
  }
  return reasons;
}

/** Data needed to know if all class Ability Score Improvement gains are committed (points or feats). */
export type PrimalBodyAndMindBonusInput = Pick<
  CharacterFormData,
  | 'abilityScoreMethod'
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreOption'
  | 'backgroundAbilityScoreIncrease'
  | 'abilityScoreImprovementByGain'
  | 'featureDetails'
  | 'epicBoonFeatId'
  | 'epicBoonAbilityScore'
  | 'grapplerAbilityScore'
>;

/**
 * Number of Ability Score Improvement entries gained at the current level.
 * Summed across classes: every class grants its own ASIs on its own schedule, so a Fighter 8 /
 * Wizard 8 has four, not the two a single lookup would have reported.
 */
export function getAbilityScoreImprovementGainCount(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): number {
  return Math.max(0, sumClassFeatureGainCount(featureDetails, 'ability score improvement'));
}

/** Merged ability score bonuses from every “increase scores” gain. */
export function getTotalAbilityScoreImprovementFromGains(
  byGain: AbilityScoreImprovementGainChoice[] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of byGain ?? []) {
    if (g?.kind === 'increase_scores') {
      for (const a of DND_ATTRIBUTES) {
        const v = g.byAbility[a] ?? 0;
        if (v) out[a] = (out[a] ?? 0) + v;
      }
    }
  }
  return out;
}

/** Feat ids chosen on “choose feat” gains (order matches gain slots). */
export function getAbilityScoreImprovementFeatIdsFromGains(
  byGain: AbilityScoreImprovementGainChoice[] | undefined
): string[] {
  return (byGain ?? [])
    .filter(
      (g): g is { kind: 'feat'; featId: string } =>
        g != null && g.kind === 'feat' && typeof g.featId === 'string' && g.featId.length > 0
    )
    .map((g) => g.featId);
}

export function sumIncreaseScoresInGain(
  choice: AbilityScoreImprovementGainChoice | null | undefined
): number {
  if (!choice || choice.kind !== 'increase_scores') return 0;
  return sumByAbilityMap(choice.byAbility);
}

export function isAbilityScoreImprovementGainComplete(
  choice: AbilityScoreImprovementGainChoice | null | undefined
): boolean {
  if (choice == null) return false;
  if (choice.kind === 'feat') {
    return typeof choice.featId === 'string' && choice.featId.length > 0;
  }
  return sumIncreaseScoresInGain(choice) === 2;
}

/**
 * True when ONE Ability Score Improvement instance has all of its own gains resolved.
 *
 * Under multiclassing each class grants its own improvements into the same character-wide array, so
 * a chip on the Fighter's feature must not turn green because the Wizard's slot is filled.
 */
export function isAbilityScoreImprovementInstanceResolved(
  data: PrimalBodyAndMindBonusInput,
  feature: { gainCount?: number; gainSlotOffset?: number } | undefined
): boolean {
  const total = getAbilityScoreImprovementGainCount(data.featureDetails);
  if (total <= 0) return true;
  const offset = Math.max(0, feature?.gainSlotOffset ?? 0);
  const count = Math.max(0, feature?.gainCount ?? total - offset);
  const arr = data.abilityScoreImprovementByGain ?? [];
  if (arr.length < offset + count) return false;
  for (let i = offset; i < offset + count; i++) {
    if (!isAbilityScoreImprovementGainComplete(arr[i])) return false;
  }
  return true;
}

/**
 * True when every Ability Score Improvement gain at the current level is resolved (2 points or one feat each).
 */
export function isAbilityScoreImprovementFullyResolved(data: PrimalBodyAndMindBonusInput): boolean {
  const n = getAbilityScoreImprovementGainCount(data.featureDetails);
  if (n <= 0) return true;
  const arr = data.abilityScoreImprovementByGain ?? [];
  if (arr.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!isAbilityScoreImprovementGainComplete(arr[i])) return false;
  }
  return true;
}

export type EpicBoonBonusInput = PrimalBodyAndMindBonusInput;

export function canApplyEpicBoonChoices(data: PrimalBodyAndMindBonusInput): boolean {
  return canApplyAbilityScoreImprovementASI(data) && isAbilityScoreImprovementFullyResolved(data);
}

/** Human-readable hints when {@link canApplyEpicBoonChoices} is false (shared with Primal Champion / Body and Mind). */
export function getEpicBoonPrerequisiteBlockedReasons(data: PrimalBodyAndMindBonusInput): string[] {
  const reasons: string[] = [];
  if (!canApplyAbilityScoreImprovementASI(data)) {
    reasons.push(...getAbilityScoreImprovementASIBlockedReasons(data));
  } else if (!isAbilityScoreImprovementFullyResolved(data)) {
    const n = getAbilityScoreImprovementGainCount(data.featureDetails);
    if (n > 0) {
      reasons.push(REQ_ASI_TEMPLATE(n));
    }
  }
  return reasons;
}

/**
 * Ability that receives the Epic Boon +1 when {@link canApplyEpicBoonChoices} is true and both a boon
 * feat and target ability are chosen. Otherwise modifiers ignore the boon.
 */
export function getEffectiveEpicBoonAbilityScore(data: EpicBoonBonusInput): string | null {
  if (!canApplyEpicBoonChoices(data)) return null;
  const fid = data.epicBoonFeatId;
  if (fid == null || String(fid).trim() === '') return null;
  const s = data.epicBoonAbilityScore;
  return typeof s === 'string' && s.trim() !== '' ? s : null;
}

function featureDetailsHasPrimalChampion(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'primal champion');
}

function featureDetailsHasBodyAndMind(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'body and mind');
}

function featureDetailsHasEpicBoon(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'epic boon');
}

/**
 * When the sheet includes the Epic Boon class feature, Primal Champion / Body and Mind +4 only apply
 * after that feature is fully chosen (boon + ability), same as {@link getEffectiveEpicBoonAbilityScore}.
 */
function isEpicBoonFilledWhenRequiredForPrimalBodyMind(data: EpicBoonBonusInput): boolean {
  if (!featureDetailsHasEpicBoon(data.featureDetails)) return true;
  return getEffectiveEpicBoonAbilityScore(data) != null;
}

/**
 * Whether Primal Champion / Body and Mind **score bonuses** (+4, cap 25) apply.
 * Requires: base array + background bonuses complete, all class ASI gains resolved, the feature on the sheet,
 * and if Epic Boon is on the sheet, it must be fully completed (boon + +1 ability).
 */
export function getPrimalChampionBodyAndMindBonusFlags(data: PrimalBodyAndMindBonusInput): {
  hasPrimalChampion: boolean;
  hasBodyAndMind: boolean;
} {
  const rawPc = featureDetailsHasPrimalChampion(data.featureDetails);
  const rawBm = featureDetailsHasBodyAndMind(data.featureDetails);
  const prereq =
    canApplyEpicBoonChoices(data) && isEpicBoonFilledWhenRequiredForPrimalBodyMind(data);
  return {
    hasPrimalChampion: rawPc && prereq,
    hasBodyAndMind: rawBm && prereq,
  };
}

/**
 * Why Primal Champion / Body and Mind score bonuses (+4, cap 25) are not applied on the sheet yet.
 */
export function getPrimalChampionBodyAndMindBonusBlockedReasons(
  data: PrimalBodyAndMindBonusInput
): string[] {
  const reasons: string[] = [...getEpicBoonPrerequisiteBlockedReasons(data)];
  if (reasons.length > 0) return reasons;
  if (
    featureDetailsHasEpicBoon(data.featureDetails) &&
    getEffectiveEpicBoonAbilityScore(data) == null
  ) {
    reasons.push(REQ_EPIC_BOON);
  }
  return reasons;
}

/**
 * Maximum total ASI bonus points allowed on one ability: ceiling minus effective score
 * from base, background, Primal Champion, Body and Mind, Grappler (everything except ASI).
 * Epic Boon is excluded on purpose: its +1 stacks on top of the ASI cap (it lets the score
 * reach 21), so it must not consume ASI headroom.
 */
export type MaxAsiBonusForAttributeInput = Pick<
  CharacterFormData,
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreIncrease'
  | 'epicBoonAbilityScore'
  | 'epicBoonFeatId'
  | 'featureDetails'
  | 'abilityScoreMethod'
  | 'backgroundAbilityScoreOption'
  | 'abilityScoreImprovementByGain'
  | 'grapplerAbilityScore'
>;

export function maxAsiBonusForAttribute(data: MaxAsiBonusForAttributeInput, attr: string): number {
  const base = data.attributes?.[attr] ?? 0;
  if (base <= 0) return 0;
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const ceiling = abilityScoreCeilingForAsi(attr, hasPrimalChampion, hasBodyAndMind);
  // Epic Boon (+1) is NOT passed here: it stacks above the ASI cap, so it must not
  // reduce the ASI headroom (otherwise ASI gets clamped and the score can't reach 21).
  const totalExcludingAsiAndBoon = getEffectiveAttribute(
    data.attributes ?? {},
    data.backgroundAbilityScoreIncrease,
    attr,
    null,
    hasPrimalChampion,
    hasBodyAndMind,
    data.grapplerAbilityScore
  );
  return Math.max(0, ceiling - totalExcludingAsiAndBoon);
}

/**
 * A character's effective modifier for `attr`, assembling every score source the sheet tracks
 * (background bonus, ASI gains, Epic Boon, Primal Champion / Body and Mind, Grappler).
 * For a single lookup; callers deriving several modifiers at once should hoist the assembly
 * and call {@link getEffectiveModifier} directly so it runs only once.
 */
export function getCharacterAbilityModifier(data: CharacterFormData, attr: string): number {
  const bg = data.backgroundAbilityScoreIncrease ?? {};
  const asi = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
  const combined: Record<string, number> = {};
  for (const k of new Set([...Object.keys(bg), ...Object.keys(asi)])) {
    combined[k] = (bg[k] ?? 0) + (asi[k] ?? 0);
  }
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  return getEffectiveModifier(
    data.attributes ?? {},
    combined,
    attr,
    getEffectiveEpicBoonAbilityScore(data),
    hasPrimalChampion,
    hasBodyAndMind,
    data.grapplerAbilityScore
  );
}

/**
 * All six effective ability SCORES, assembling every source the sheet tracks (background bonus,
 * ASI gains, Epic Boon, Primal Champion / Body and Mind, Grappler).
 *
 * This is what "a score of at least 13" means for the multiclass prerequisite: the number printed
 * on the sheet, not the raw array the player distributed at creation.
 */
export function getCharacterAbilityScores(data: CharacterFormData): Record<string, number> {
  const bg = data.backgroundAbilityScoreIncrease ?? {};
  const asi = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
  const combined: Record<string, number> = {};
  for (const k of new Set([...Object.keys(bg), ...Object.keys(asi)])) {
    combined[k] = (bg[k] ?? 0) + (asi[k] ?? 0);
  }
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const epicBoon = getEffectiveEpicBoonAbilityScore(data);
  const out: Record<string, number> = {};
  for (const attr of DND_ATTRIBUTES) {
    out[attr] = getEffectiveAttribute(
      data.attributes ?? {},
      combined,
      attr,
      epicBoon,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore
    );
  }
  return out;
}

/** Room left on one ability for the “increase scores” choice at `gainIndex`, after other gains. */
export function maxIncreaseScoresOnAttributeForGain(
  data: MaxAsiBonusForAttributeInput,
  attr: string,
  byGain: AbilityScoreImprovementGainChoice[],
  gainIndex: number
): number {
  let fromOthers = 0;
  for (let i = 0; i < byGain.length; i++) {
    if (i === gainIndex) continue;
    const g = byGain[i];
    if (g?.kind === 'increase_scores') fromOthers += g.byAbility[attr] ?? 0;
  }
  return Math.max(0, maxAsiBonusForAttribute(data, attr) - fromOthers);
}
