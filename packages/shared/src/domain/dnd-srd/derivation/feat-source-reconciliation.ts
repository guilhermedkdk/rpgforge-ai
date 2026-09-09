// Feat "source slot" enumeration + reconciliation for feats granted by multiple sources
// (Magic Initiate / Skilled). Keeps per-source picks in sync as sources are added/removed —
// the single source of truth shared by the derivation and every panel that mutates these.
import type { RuleItemResponse } from '../../../types/ruleitem';
import {
  MAGIC_INITIATE_SPELL_LISTS,
  type CharacterFormData,
  type AbilityScoreImprovementGainChoice,
  type EldritchInvocationSelection,
  type MagicInitiateGain,
  type MagicInitiateSpellList,
} from '../character/character-form-data';
import {
  buildMiAsiKey,
  buildMiEldritchKey,
  buildMiFdKey,
  isSkilledFeatureName,
  isSkillFromNonSkilledSource,
  MI_VERSATILE_KEY,
} from '../features/feature-matchers';

function extractMiLockedSpellList(name: string): MagicInitiateSpellList | null {
  const match = name.match(/\(([^)]+)\)/);
  if (!match) return null;
  const variant = match[1].trim();
  const normalized = variant.charAt(0).toUpperCase() + variant.slice(1).toLowerCase();
  return (MAGIC_INITIATE_SPELL_LISTS as readonly string[]).includes(normalized)
    ? (normalized as MagicInitiateSpellList)
    : null;
}

function normalizeMiFeatName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generic enumeration of the ordered feat "source slots" — every place a feat matching
 * `matches` is granted (feature details incl. background, Versatile, each ASI choice, and
 * Eldritch Invocations / Lessons of the First Ones). Each slot has a stable `key` (shared
 * key scheme so MI and Skilled stores never collide because they live in separate records)
 * plus a human `label` and the granting feat's `featName`.
 */
export function computeActiveFeatSources(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId: string | null | undefined,
  eldritchInvocationSelections: EldritchInvocationSelection[] | undefined,
  matches: (name: string) => boolean
): Array<{ key: string; label: string; featName: string }> {
  const result: Array<{ key: string; label: string; featName: string }> = [];

  for (const fd of featureDetails) {
    if (!matches(fd.name)) continue;
    const n = fd.gainCount ?? 1;
    const src = fd.source === 'background' ? 'Background' : fd.source === 'race' ? 'Race' : 'Class';
    for (let i = 0; i < n; i++) {
      result.push({ key: buildMiFdKey(fd.source, fd.name, i), label: src, featName: fd.name });
    }
  }

  if (versatileFeatId) {
    const vFeat = featsList.find((f) => f.id === versatileFeatId);
    if (vFeat && matches(vFeat.name)) {
      result.push({ key: MI_VERSATILE_KEY, label: 'Versatile', featName: vFeat.name });
    }
  }

  (abilityScoreImprovementByGain ?? []).forEach((gain, idx) => {
    if (gain?.kind !== 'feat') return;
    const f = featsList.find((feat) => feat.id === gain.featId);
    if (!f || !matches(f.name)) return;
    const ordinalLabel = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : `${idx + 1}th`;
    result.push({
      key: buildMiAsiKey(idx),
      label: `${ordinalLabel} Ability Score Improvement`,
      featName: f.name,
    });
  });

  for (const sel of eldritchInvocationSelections ?? []) {
    if (!sel.featId) continue;
    const f = featsList.find((feat) => feat.id === sel.featId);
    if (!f || !matches(f.name)) continue;
    result.push({
      key: buildMiEldritchKey(sel.featId),
      label: 'Lessons of the First Ones',
      featName: f.name,
    });
  }

  return result;
}

/** Magic Initiate predicate — strips the spell-list parenthetical (e.g. "Magic Initiate (Cleric)"). */
const matchesMagicInitiate = (name: string) => normalizeMiFeatName(name) === 'magic initiate';

/**
 * Computes the ordered list of active Magic Initiate source slots from the character's
 * current sources (featureDetails, versatile feat, ASI choices, Eldritch Invocations).
 * Each slot has a stable `key` usable as index into `magicInitiateChoicesBySource`.
 */
export function computeActiveMiSourceInfo(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId?: string | null,
  eldritchInvocationSelections?: EldritchInvocationSelection[]
): Array<{ key: string; lockedSpellList: MagicInitiateSpellList | null; label: string }> {
  return computeActiveFeatSources(
    featureDetails,
    abilityScoreImprovementByGain,
    featsList,
    versatileFeatId,
    eldritchInvocationSelections,
    matchesMagicInitiate
  ).map(({ key, label, featName }) => ({
    key,
    label,
    lockedSpellList: extractMiLockedSpellList(featName),
  }));
}

/**
 * Computes the ordered list of active Skilled source slots (one per Skilled feat granted by
 * any source). Each slot's 3 skill/tool picks live under its `key` in `skilledChoicesBySource`.
 */
export function computeActiveSkilledSources(
  featureDetails: Array<{ name: string; source?: string; gainCount?: number }>,
  abilityScoreImprovementByGain: (AbilityScoreImprovementGainChoice | null)[] | undefined,
  featsList: RuleItemResponse[],
  versatileFeatId?: string | null,
  eldritchInvocationSelections?: EldritchInvocationSelection[]
): Array<{ key: string; label: string }> {
  return computeActiveFeatSources(
    featureDetails,
    abilityScoreImprovementByGain,
    featsList,
    versatileFeatId,
    eldritchInvocationSelections,
    isSkilledFeatureName
  ).map(({ key, label }) => ({ key, label }));
}

/** Number of skill/tool picks each Skilled instance grants. */
export const SKILLED_PICKS_PER_SOURCE = 3;

/** Skilled is complete only when every active source has all of its picks filled. */
export function isSkilledFullyChosen(
  data: CharacterFormData,
  featsList: RuleItemResponse[]
): boolean {
  const sources = computeActiveSkilledSources(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections
  );
  const bySource = data.skilledChoicesBySource ?? {};
  return sources.every((s) => (bySource[s.key]?.length ?? 0) >= SKILLED_PICKS_PER_SOURCE);
}

const SKILL_CHOICE_PREFIX = 'skill:';

/**
 * Prunes `skilledChoicesBySource` to the currently-active sources, rebuilds the flattened list, and
 * reconciles `skillProficiencies` (clearing skills dropped by a removed source unless granted by a
 * non-Skilled source). Returns just the affected fields so callers can spread them. This is the
 * single place that keeps Skilled selections in sync with their sources — called by the derivation
 * and by every panel that adds/removes a Skilled source (so removal resets immediately).
 */
export function reconcileSkilledChoices(
  data: CharacterFormData,
  featsList: RuleItemResponse[]
): Pick<
  CharacterFormData,
  'skilledChoicesBySource' | 'skilledProficiencyChoices' | 'skillProficiencies'
> {
  const activeKeys = computeActiveSkilledSources(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections
  ).map((s) => s.key);

  // Migration: no source map yet but a flat list exists → chunk it into active sources (3 each).
  let prev = data.skilledChoicesBySource;
  if (!prev && (data.skilledProficiencyChoices?.length ?? 0) > 0) {
    prev = {};
    const items = [...(data.skilledProficiencyChoices ?? [])];
    for (const key of activeKeys) {
      if (items.length === 0) break;
      prev[key] = items.splice(0, SKILLED_PICKS_PER_SOURCE);
    }
  }

  const cleanBySource: Record<string, string[]> = {};
  for (const key of activeKeys) {
    const picks = (prev?.[key] ?? []).slice(0, SKILLED_PICKS_PER_SOURCE);
    if (picks.length > 0) cleanBySource[key] = picks;
  }

  const flat: string[] = [];
  const seen = new Set<string>();
  for (const key of activeKeys) {
    for (const id of cleanBySource[key] ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      flat.push(id);
    }
  }

  const keptSkillKeys = new Set(
    flat
      .filter((id) => id.startsWith(SKILL_CHOICE_PREFIX))
      .map((id) => id.slice(SKILL_CHOICE_PREFIX.length))
  );
  const nextSkillProf = { ...(data.skillProficiencies ?? {}) };
  for (const old of data.skilledProficiencyChoices ?? []) {
    if (!old.startsWith(SKILL_CHOICE_PREFIX)) continue;
    const skillKey = old.slice(SKILL_CHOICE_PREFIX.length);
    if (keptSkillKeys.has(skillKey)) continue;
    if (!isSkillFromNonSkilledSource(data, skillKey)) nextSkillProf[skillKey] = false;
  }
  for (const key of keptSkillKeys) nextSkillProf[key] = true;

  return {
    skilledChoicesBySource: cleanBySource,
    skilledProficiencyChoices: flat,
    skillProficiencies: nextSkillProf,
  };
}

/**
 * Prunes `magicInitiateChoicesBySource` to the active sources and rebuilds the ordered
 * `magicInitiateChoicesByGain` view. Single source of truth for keeping Magic Initiate in sync with
 * its sources — called by the derivation and by every panel that adds/removes an MI source (ASI,
 * Versatile, Lessons of the First Ones) so removal resets immediately.
 */
export function reconcileMagicInitiateChoices(
  data: CharacterFormData,
  featsList: RuleItemResponse[]
): Pick<CharacterFormData, 'magicInitiateChoicesBySource' | 'magicInitiateChoicesByGain'> {
  const activeSlots = computeActiveMiSourceInfo(
    data.featureDetails ?? [],
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections
  );

  // Migration: old position-based array but no source map → seed the map from it.
  let sourceMap = data.magicInitiateChoicesBySource;
  if (!sourceMap && (data.magicInitiateChoicesByGain?.length ?? 0) > 0) {
    sourceMap = {};
    const oldGains = data.magicInitiateChoicesByGain ?? [];
    activeSlots.forEach(({ key }, i) => {
      (sourceMap as Record<string, MagicInitiateGain | null>)[key] = oldGains[i] ?? null;
    });
  }

  // Keep only active keys, so a removed source's stale entry can't resurface.
  const cleanSourceMap: Record<string, MagicInitiateGain | null> = {};
  for (const { key } of activeSlots) cleanSourceMap[key] = sourceMap?.[key] ?? null;

  return {
    magicInitiateChoicesBySource: cleanSourceMap,
    magicInitiateChoicesByGain: activeSlots.map(({ key }) => cleanSourceMap[key] ?? null),
  };
}
