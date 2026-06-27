/**
 * Mechanics-aware feature matching.
 *
 * Reads the stable `featureKey` written by ingestion onto each FeatureDetail
 * (from `normalized.features[].mechanics.featureKey`) and falls back to the
 * legacy display-name matchers when it is absent — so rule items ingested
 * before mechanics existed keep working unchanged.
 *
 * This is the single place the UI decides "what is this feature"; when the SRD
 * changes a feature name, only the ingestion `mechanics-config.ts` needs editing.
 */
import {
  isContactPatronFeatureName,
  isDruidicFeatureName,
  isEldritchInvocationsFeatureName,
  isFaithfulSteedFeatureName,
  isFastMovementFeatureName,
  isFavoredEnemyFeatureName,
  isMysticArcanumFeatureName,
  isPaladinsSmiteFeatureName,
  isRovingFeatureName,
  isSignatureSpellsFeatureName,
  isSpellMasteryFeatureName,
  isUnarmoredMovementFeatureName,
  isWordsOfCreationFeatureName,
} from './character-state';
import {
  isElvenLineageFeatureName,
  isFiendishLegacyFeatureName,
  isGnomishLineageFeatureName,
  isOtherworldlyPresenceFeatureName,
} from './class-detection';

/** Minimal shape both FeatureDetail rows and raw `{ name }` features satisfy. */
export interface MechanicsFeatureLike {
  name: string;
  featureKey?: string;
}

const matchFeature = (
  feature: MechanicsFeatureLike,
  key: string,
  nameFallback: (name: string) => boolean,
): boolean => {
  if (feature.featureKey) return feature.featureKey === key;
  return nameFallback(feature.name);
};

export const isDruidicFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'druidic', isDruidicFeatureName);
export const isWordsOfCreationFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'words-of-creation', isWordsOfCreationFeatureName);
export const isFaithfulSteedFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'faithful-steed', isFaithfulSteedFeatureName);
export const isPaladinsSmiteFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'paladins-smite', isPaladinsSmiteFeatureName);
export const isFavoredEnemyFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'favored-enemy', isFavoredEnemyFeatureName);
export const isContactPatronFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'contact-patron', isContactPatronFeatureName);
export const isMysticArcanumFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'mystic-arcanum', isMysticArcanumFeatureName);
export const isSignatureSpellsFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'signature-spells', isSignatureSpellsFeatureName);
export const isSpellMasteryFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'spell-mastery', isSpellMasteryFeatureName);
export const isEldritchInvocationsFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'eldritch-invocations', isEldritchInvocationsFeatureName);
export const isElvenLineageFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'elven-lineage', isElvenLineageFeatureName);
export const isGnomishLineageFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'gnomish-lineage', isGnomishLineageFeatureName);
export const isFiendishLegacyFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'fiendish-legacy', isFiendishLegacyFeatureName);
export const isOtherworldlyPresenceFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'otherworldly-presence', isOtherworldlyPresenceFeatureName);
export const isFastMovementFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'fast-movement', isFastMovementFeatureName);
export const isRovingFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'roving', isRovingFeatureName);
export const isUnarmoredMovementFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'unarmored-movement', isUnarmoredMovementFeatureName);
