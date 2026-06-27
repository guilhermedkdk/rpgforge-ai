import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  DND_ATTRIBUTES,
  getEffectiveAttribute,
  getEffectiveEpicBoonAbilityScore,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
  getAbilityScoreImprovementFeatIdsFromGains,
} from '@/lib/dnd-srd/character-state';

export const REPEATABLE_FEAT_NAMES = new Set(['magic initiate', 'skilled']);

export function normalizeFeatName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFeatIdByName(featsList: RuleItemResponse[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const feat of featsList) {
    const key = normalizeFeatName(feat.name ?? '');
    if (!key || map.has(key)) continue;
    map.set(key, feat.id);
  }
  return map;
}

export function buildOwnedFeatIdsSet(
  data: CharacterFormData,
  featsList: RuleItemResponse[],
): Set<string> {
  const featIdByName = buildFeatIdByName(featsList);
  const featureDetailFeatIds = (data.featureDetails ?? [])
    .map((f) => featIdByName.get(normalizeFeatName(f.name ?? '')) ?? null)
    .filter((id): id is string => id != null);
  const ids = [
    ...featureDetailFeatIds,
    ...getAbilityScoreImprovementFeatIdsFromGains(data.abilityScoreImprovementByGain),
    ...(data.fightingStyleFeatId ? [data.fightingStyleFeatId] : []),
    ...(data.epicBoonFeatId ? [data.epicBoonFeatId] : []),
    ...(data.versatileFeatId ? [data.versatileFeatId] : []),
    // Origin feats granted by Eldritch Invocations (Lessons of the First Ones).
    ...(data.eldritchInvocationSelections ?? [])
      .map((s) => s.featId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ];
  return new Set(ids);
}

/** Build effective attribute scores (base + ASI + epic boon + primal champion / body and mind). */
export function buildEffectiveAttributeScores(data: CharacterFormData): Record<string, number> {
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const asiMerged = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
  const combinedAbilityBonuses: Record<string, number> = {};
  for (const k of new Set([
    ...Object.keys(data.backgroundAbilityScoreIncrease ?? {}),
    ...Object.keys(asiMerged),
  ])) {
    combinedAbilityBonuses[k] =
      ((data.backgroundAbilityScoreIncrease ?? {})[k] ?? 0) + (asiMerged[k] ?? 0);
  }
  const effectiveEpicBoonAbilityScore = getEffectiveEpicBoonAbilityScore(data);
  const scores: Record<string, number> = {};
  for (const attr of DND_ATTRIBUTES) {
    scores[attr] = getEffectiveAttribute(
      data.attributes ?? {},
      combinedAbilityBonuses,
      attr,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    );
  }
  return scores;
}

/**
 * Evaluate unmet prerequisites for a feat given the current character data.
 * `featureNamesLower` enables feature-name prerequisite checks (fighting style, versatile).
 */
export function evaluateFeatPrerequisite(
  textRaw: string,
  data: CharacterFormData,
  effectiveAttributeScores: Record<string, number>,
  featureNamesLower?: Set<string>,
): string[] {
  const text = textRaw.trim();
  if (!text) return [];
  const unmet: string[] = [];

  const levelRegex = /level\s*(\d+)\+/gi;
  for (const m of text.matchAll(levelRegex)) {
    const min = Number(m[1] ?? 0);
    if (min > 0 && (data.level ?? 1) < min) unmet.push(`Level ${min}+`);
  }

  const attrsPattern = '(?:Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)';
  const attrRegex = new RegExp(
    `((?:${attrsPattern})(?:\\s+or\\s+(?:${attrsPattern}))*)\\s*(\\d+)\\+`,
    'gi',
  );
  for (const m of text.matchAll(attrRegex)) {
    const expr = String(m[1] ?? '').trim();
    const min = Number(m[2] ?? 0);
    if (!expr || min <= 0) continue;
    const attrs = expr.split(/\s+or\s+/i).map((a) => a.trim());
    const ok = attrs.some((a) => (effectiveAttributeScores[a] ?? 0) >= min);
    if (!ok) unmet.push(`${expr} ${min}+`);
  }

  if (featureNamesLower) {
    const featureReqRegex = /([A-Za-z][A-Za-z\s'-]+?)\s+Feature/gi;
    for (const m of text.matchAll(featureReqRegex)) {
      const reqFeature = String(m[1] ?? '').trim().toLowerCase();
      if (!reqFeature) continue;
      const ok = [...featureNamesLower].some((n) => n === reqFeature || n.includes(reqFeature));
      if (!ok) unmet.push(`${String(m[1]).trim()} Feature`);
    }
  }

  return unmet;
}

export function getFeatMeta(feat: RuleItemResponse): {
  benefitDescs: string[];
  prerequisite: string;
} {
  const raw = (feat.raw ?? {}) as Record<string, unknown>;
  const norm = (feat.normalized ?? {}) as Record<string, unknown>;
  const benefits = (norm.benefits ?? raw.benefits ?? []) as Array<{ desc?: string | null }>;
  const benefitDescs = benefits.map((b) => (b?.desc ?? '').trim()).filter(Boolean);
  const prerequisite = (norm.prerequisite ?? raw.prerequisite ?? '') as string;
  return { benefitDescs, prerequisite };
}

/**
 * Drops feat selections whose prerequisite is no longer met (e.g. an ability score or the level
 * dropped after the feat was chosen). Uses the same effective-score evaluation the per-feat panels
 * use to gate selection, so a feat can never linger once it stops qualifying. Covers every place a
 * feat is chosen: ASI slots, Versatile, Epic Boon, Fighting Style (feat mode) and Eldritch
 * Invocations' Lessons of the First Ones. Returns the same object when nothing changed.
 */
export function reconcileFeatPrerequisites(
  data: CharacterFormData,
  featsList: RuleItemResponse[] | undefined,
): CharacterFormData {
  if (!featsList || featsList.length === 0) return data;
  const featById = new Map(featsList.map((f) => [f.id, f]));
  const scores = buildEffectiveAttributeScores(data);
  const featureNamesLower = new Set(
    (data.featureDetails ?? []).map((f) => f.name.trim().toLowerCase()),
  );
  const prereqUnmet = (featId: string | null | undefined): boolean => {
    if (!featId) return false;
    const feat = featById.get(featId);
    if (!feat) return false; // catalog not loaded yet — leave the selection untouched
    return (
      evaluateFeatPrerequisite(getFeatMeta(feat).prerequisite, data, scores, featureNamesLower)
        .length > 0
    );
  };

  const patch: Partial<CharacterFormData> = {};

  const asiGains = data.abilityScoreImprovementByGain ?? [];
  if (asiGains.some((g) => g?.kind === 'feat' && prereqUnmet(g.featId))) {
    patch.abilityScoreImprovementByGain = asiGains.map((g) =>
      g?.kind === 'feat' && prereqUnmet(g.featId) ? null : g,
    );
  }
  if (prereqUnmet(data.versatileFeatId)) patch.versatileFeatId = null;
  if (prereqUnmet(data.epicBoonFeatId)) {
    patch.epicBoonFeatId = null;
    patch.epicBoonAbilityScore = null;
  }
  if ((data.fightingStyleMode ?? 'OPTION') === 'FEAT' && prereqUnmet(data.fightingStyleFeatId)) {
    patch.fightingStyleFeatId = null;
  }
  const eldritch = data.eldritchInvocationSelections ?? [];
  if (eldritch.some((s) => s.featId && prereqUnmet(s.featId))) {
    patch.eldritchInvocationSelections = eldritch.filter(
      (s) => !(s.featId && prereqUnmet(s.featId)),
    );
  }

  if (Object.keys(patch).length === 0) return data;
  return { ...data, ...patch };
}
