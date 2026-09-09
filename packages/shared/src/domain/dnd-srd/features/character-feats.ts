/**
 * Which FEATS a character owns. They arrive from six different places (a background grant, an ASI
 * gain spent on a feat, each class's Fighting Style, Champion's second style, Epic Boon, Versatile,
 * and an Eldritch Invocation that grants an origin feat), so "the character's feats" is a rule, not
 * a field — and both the sheet's Features section and the PDF export read it from here.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import { normalizeFeatName } from './feat-prerequisites';
import { getAllFightingStyleFeatIds } from './fighting-style';

/** Feat rule-item ids, in the order the sheet lists them, deduped. */
export function getCharacterFeatIds(
  data: CharacterFormData,
  feats: readonly RuleItemResponse[]
): string[] {
  const idByName = new Map<string, string>();
  for (const feat of feats) {
    const key = normalizeFeatName(feat.name ?? '');
    if (key && !idByName.has(key)) idByName.set(key, feat.id);
  }

  // A background grants its feat as a FEATURE row; only its name ties it back to the feat item.
  const fromBackground = (data.featureDetails ?? [])
    .filter((feature: FeatureDetail) => feature.source === 'background')
    .map((feature) => idByName.get(normalizeFeatName(feature.name ?? '')) ?? null)
    .filter((id): id is string => id != null);

  const fromImprovements = (data.abilityScoreImprovementByGain ?? [])
    .filter(
      (gain): gain is { kind: 'feat'; featId: string } =>
        gain?.kind === 'feat' && typeof gain.featId === 'string'
    )
    .map((gain) => gain.featId);

  const fromInvocations = (data.eldritchInvocationSelections ?? [])
    .map((selection) => selection.featId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const all = [
    ...fromBackground,
    ...fromImprovements,
    ...getAllFightingStyleFeatIds(data),
    ...(data.additionalFightingStyleFeatId ? [data.additionalFightingStyleFeatId] : []),
    ...(data.epicBoonFeatId ? [data.epicBoonFeatId] : []),
    ...(data.versatileFeatId ? [data.versatileFeatId] : []),
    ...fromInvocations,
  ];

  return all.filter((id, index) => all.indexOf(id) === index);
}

/** The owned feats as rule items, skipping ids the catalog does not carry. */
export function getCharacterFeats(
  data: CharacterFormData,
  feats: readonly RuleItemResponse[]
): RuleItemResponse[] {
  const byId = new Map(feats.map((feat) => [feat.id, feat]));
  return getCharacterFeatIds(data, feats)
    .map((id) => byId.get(id))
    .filter((feat): feat is RuleItemResponse => feat != null);
}
