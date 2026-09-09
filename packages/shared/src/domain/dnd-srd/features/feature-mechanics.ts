/**
 * Mechanics-aware feature matching.
 *
 * Reads the stable `featureKey` written by ingestion and falls back to the legacy display-name
 * matchers when it is absent, so items ingested before mechanics existed keep working. Single place
 * the UI decides "what is this feature": a renamed SRD feature only touches `mechanics-config.ts`.
 */
import {
  isContactPatronFeatureName,
  isDruidicFeatureName,
  isJackOfAllTradesFeatureName,
  isMagicInitiateFeatureName,
  isMagicalSecretsFeatureName,
  isRaceLineageSpellcastingFeatureName,
  isSkilledFeatureName,
  isThievesCantFeatureName,
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
} from './feature-matchers';
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
  nameFallback: (name: string) => boolean
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

export const isThievesCantFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'thieves-cant', isThievesCantFeatureName);
export const isMagicalSecretsFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'magical-secrets', isMagicalSecretsFeatureName);
export const isJackOfAllTradesFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'jack-of-all-trades', isJackOfAllTradesFeatureName);
export const isMagicInitiateFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'magic-initiate', isMagicInitiateFeatureName);
export const isSkilledFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'skilled', isSkilledFeatureName);

/**
 * Any race lineage that grants spells (Elven, Gnomish, Fiendish). Each has its own key, so this only
 * falls back to the name when the pack carries none of them.
 */
export const isRaceLineageSpellcastingFeature = (f: MechanicsFeatureLike) =>
  f.featureKey
    ? isElvenLineageFeature(f) || isGnomishLineageFeature(f) || isFiendishLegacyFeature(f)
    : isRaceLineageSpellcastingFeatureName(f.name);

/**
 * Reads the machine key off a FEAT rule item, whose mechanics live at the ROOT of `normalized`
 * (a feat is one item), not under `normalized.features[]` like a class feature.
 */
export function featRuleItemAsMechanicsFeature(feat: {
  name: string;
  normalized?: unknown;
}): MechanicsFeatureLike {
  const normalized = (feat.normalized ?? {}) as { mechanics?: { featureKey?: unknown } };
  const key = normalized.mechanics?.featureKey;
  return { name: feat.name, featureKey: typeof key === 'string' ? key : undefined };
}

/** Grappler and Skilled are FEATS; both carry a machine key in this pack. */
export const isGrapplerFeature = (f: MechanicsFeatureLike) =>
  matchFeature(f, 'grappler', (name) => name.trim().toLowerCase() === 'grappler');
