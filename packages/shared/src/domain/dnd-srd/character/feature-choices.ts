import type { CharacterFormData } from './character-form-data';

/**
 * Maps the flat per-feature form-state fields to/from the grouped `featureChoices` persisted JSON
 * (persistence-layer only; form state keeps its individual fields). Keyed by feature display name so
 * the option-card selections (already name-keyed in `raceTraitSelections`) round-trip exactly.
 */

const ELVEN_LINEAGE = 'Elven Lineage';
const FIGHTING_STYLE = 'Fighting Style';
const EPIC_BOON = 'Epic Boon';
const VERSATILE = 'Versatile';
const GRAPPLER = 'Grappler';
const WEAPON_MASTERY = 'Weapon Mastery';
const PRIMAL_KNOWLEDGE = 'Primal Knowledge';
const EXPERTISE = 'Expertise';
const SCHOLAR = 'Scholar';
const DEFT_EXPLORER = 'Deft Explorer';
const THIEVES_CANT = "Thieves' Cant";
const METAMAGIC = 'Metamagic';
const ELDRITCH_INVOCATIONS = 'Eldritch Invocations';
const PACT_OF_THE_TOME = 'Pact of the Tome';
const MYSTIC_ARCANUM = 'Mystic Arcanum';
const SIGNATURE_SPELLS = 'Signature Spells';
const SPELL_MASTERY = 'Spell Mastery';
const SKILLED = 'Skilled';
const ABILITY_SCORE_IMPROVEMENT = 'Ability Score Improvement';
const MAGIC_INITIATE = 'Magic Initiate';
const BONUS_PROFICIENCIES = 'Bonus Proficiencies';
const ADDITIONAL_FIGHTING_STYLE = 'Additional Fighting Style';
const MAGICAL_DISCOVERIES = 'Magical Discoveries';
const EVOCATION_SAVANT = 'Evocation Savant';

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isNonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
const hasMeaningfulEntry = (v: unknown): boolean =>
  Array.isArray(v) && v.some((x) => x != null && String(x).trim().length > 0);

export type FeatureChoices = Record<string, Record<string, unknown>>;

/** Groups the per-feature selections into `featureChoices`, emitting only non-empty choices. */
export function buildFeatureChoices(data: CharacterFormData): FeatureChoices {
  const out: FeatureChoices = {};
  const set = (feature: string, key: string, value: unknown) => {
    (out[feature] ??= {})[key] = value;
  };

  // Option-card selections and lineage spellcasting ability are already keyed by feature name.
  for (const [name, option] of Object.entries(data.raceTraitSelections ?? {})) {
    if (isNonEmptyString(option)) set(name, 'option', option);
  }
  for (const [name, ability] of Object.entries(data.raceLineageSpellcastingAbility ?? {})) {
    if (isNonEmptyString(ability)) set(name, 'spellcastingAbility', ability);
  }
  if (isNonEmptyString(data.highElfCantripName)) {
    set(ELVEN_LINEAGE, 'highElfCantrip', data.highElfCantripName);
  }

  // One group per granting class, bare while a single class grants it (byte-compatible with every
  // pre-multiclass save) and `<classId>::Fighting Style` from the second on.
  {
    const picks = Object.entries(data.fightingStyleByClass ?? {}).filter(
      ([, pick]) => pick && (pick.featId || pick.optionKey || (pick.cantrips ?? []).length > 0)
    );
    const namespaced = picks.length > 1;
    for (const [classKey, pick] of picks) {
      const key = featureChoiceKey(FIGHTING_STYLE, namespaced ? classKey : null);
      if (pick.featId) set(key, 'featId', pick.featId);
      if (pick.optionKey) set(key, 'option', pick.optionKey);
      if ((pick.mode ?? 'OPTION') !== 'OPTION') set(key, 'mode', pick.mode);
      if ((pick.cantrips ?? []).length > 0) set(key, 'cantrips', [...pick.cantrips]);
    }
  }

  if (data.epicBoonFeatId) set(EPIC_BOON, 'featId', data.epicBoonFeatId);
  if (data.epicBoonAbilityScore) set(EPIC_BOON, 'abilityScore', data.epicBoonAbilityScore);
  if (data.versatileFeatId) set(VERSATILE, 'featId', data.versatileFeatId);
  if (data.grapplerAbilityScore) set(GRAPPLER, 'abilityScore', data.grapplerAbilityScore);

  // One group per granting class. The key stays BARE while a single class grants it, so every
  // single-class sheet serializes byte-identically to a pre-multiclass save; a second class switches
  // both to `<classId>::Weapon Mastery`.
  {
    const byClass = Object.entries(data.weaponMasteryWeaponIdsByClass ?? {}).filter(([, ids]) =>
      isNonEmptyArray(ids)
    );
    const namespaced = byClass.length > 1;
    for (const [classKey, ids] of byClass) {
      set(featureChoiceKey(WEAPON_MASTERY, namespaced ? classKey : null), 'weaponIds', [...ids]);
    }
  }
  if (isNonEmptyString(data.primalKnowledgeSkillKey)) {
    set(PRIMAL_KNOWLEDGE, 'skillKey', data.primalKnowledgeSkillKey);
  }
  // One group per granting class; bare while a single class grants it (see Weapon Mastery above).
  {
    const picks = Object.entries(data.expertiseSkillKeysByClass ?? {}).filter(([, keys]) =>
      isNonEmptyArray(keys)
    );
    const namespaced = picks.length > 1;
    for (const [classKey, keys] of picks) {
      set(featureChoiceKey(EXPERTISE, namespaced ? classKey : null), 'skillKeys', [...keys]);
    }
  }
  if (isNonEmptyString(data.scholarExpertiseSkillKey)) {
    set(SCHOLAR, 'expertiseSkillKey', data.scholarExpertiseSkillKey);
  }
  if (isNonEmptyString(data.deftExplorerExpertiseSkillKey)) {
    set(DEFT_EXPLORER, 'expertiseSkillKey', data.deftExplorerExpertiseSkillKey);
  }
  if (isNonEmptyArray(data.deftExplorerLanguageNames)) {
    set(DEFT_EXPLORER, 'languageNames', [...(data.deftExplorerLanguageNames ?? [])]);
  }
  if (isNonEmptyString(data.thievesCantExtraLanguageName)) {
    set(THIEVES_CANT, 'extraLanguageName', data.thievesCantExtraLanguageName);
  }
  if (isNonEmptyArray(data.metamagicOptionKeys)) {
    set(METAMAGIC, 'optionKeys', [...(data.metamagicOptionKeys ?? [])]);
  }
  if (isNonEmptyArray(data.eldritchInvocationSelections)) {
    set(ELDRITCH_INVOCATIONS, 'selections', [...(data.eldritchInvocationSelections ?? [])]);
  }
  if (
    (data.pactOfTomeSpellNames?.cantrips?.length ?? 0) > 0 ||
    (data.pactOfTomeSpellNames?.rituals?.length ?? 0) > 0
  ) {
    set(PACT_OF_THE_TOME, 'cantrips', [...(data.pactOfTomeSpellNames?.cantrips ?? [])]);
    set(PACT_OF_THE_TOME, 'rituals', [...(data.pactOfTomeSpellNames?.rituals ?? [])]);
  }
  if (hasMeaningfulEntry(data.mysticArcanumSpellNamesByGain)) {
    set(MYSTIC_ARCANUM, 'spellNamesByGain', [...(data.mysticArcanumSpellNamesByGain ?? [])]);
  }
  if (hasMeaningfulEntry(data.signatureSpellsSpellNames)) {
    set(SIGNATURE_SPELLS, 'spellNames', [...(data.signatureSpellsSpellNames ?? [])]);
  }
  if (
    data.spellMasterySpellNamesByLevel &&
    Object.values(data.spellMasterySpellNamesByLevel).some(
      (v) => v != null && String(v).trim().length > 0
    )
  ) {
    set(SPELL_MASTERY, 'spellNamesByLevel', data.spellMasterySpellNamesByLevel);
  }
  // Persist only the source map; the flat union (`skilledProficiencyChoices`) is rebuilt from it.
  if (data.skilledChoicesBySource && Object.keys(data.skilledChoicesBySource).length > 0) {
    set(SKILLED, 'bySource', { ...data.skilledChoicesBySource });
  }
  if (
    Array.isArray(data.abilityScoreImprovementByGain) &&
    data.abilityScoreImprovementByGain.some((v) => v != null)
  ) {
    set(ABILITY_SCORE_IMPROVEMENT, 'byGain', [...data.abilityScoreImprovementByGain]);
  }
  if (data.magicInitiateChoicesBySource && Object.keys(data.magicInitiateChoicesBySource).length > 0) {
    set(MAGIC_INITIATE, 'bySource', { ...data.magicInitiateChoicesBySource });
  }
  if (isNonEmptyArray(data.bonusProficienciesSkillKeys)) {
    set(BONUS_PROFICIENCIES, 'skillKeys', [...(data.bonusProficienciesSkillKeys ?? [])]);
  }
  if (data.additionalFightingStyleFeatId) {
    set(ADDITIONAL_FIGHTING_STYLE, 'featId', data.additionalFightingStyleFeatId);
  }
  if (hasMeaningfulEntry(data.magicalDiscoveriesSpellNames)) {
    set(MAGICAL_DISCOVERIES, 'spellNames', [...(data.magicalDiscoveriesSpellNames ?? [])]);
  }
  if (
    data.evocationSavantSpellbookByLevel &&
    Object.values(data.evocationSavantSpellbookByLevel).some((v) => (v?.length ?? 0) > 0)
  ) {
    set(EVOCATION_SAVANT, 'spellbookByLevel', { ...data.evocationSavantSpellbookByLevel });
  }

  return out;
}

function asEntry(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Separates a class key from the feature name in a multiclass choice key
 * (e.g. `srd-2024_ranger::Fighting Style`).
 */
export const FEATURE_CHOICE_CLASS_SEPARATOR = '::';

/**
 * Choice key for a feature. Namespaced ONLY for a real multiclass, so a single-class sheet keeps
 * writing bare keys and stays byte-identical to pre-multiclass saves. Readers accept both forms.
 */
export function featureChoiceKey(featureName: string, classKey?: string | null): string {
  return classKey
    ? `${classKey}${FEATURE_CHOICE_CLASS_SEPARATOR}${featureName}`
    : featureName;
}

/** Splits a stored key back into its class key (null when bare) and feature name. */
export function parseFeatureChoiceKey(key: string): { classKey: string | null; featureName: string } {
  const idx = key.indexOf(FEATURE_CHOICE_CLASS_SEPARATOR);
  if (idx === -1) return { classKey: null, featureName: key };
  return {
    classKey: key.slice(0, idx),
    featureName: key.slice(idx + FEATURE_CHOICE_CLASS_SEPARATOR.length),
  };
}

/**
 * One feature's choices, accepting both the bare key and any class-namespaced one. Used for the
 * choices that stay global; the per-class fields read every match via {@link readFeatureChoicesByClass}.
 */
function readFeatureChoice(
  fc: Record<string, unknown>,
  featureName: string,
): Record<string, unknown> | null {
  const exact = asEntry(fc[featureName]);
  if (exact) return exact;
  for (const [key, value] of Object.entries(fc)) {
    const parsed = parseFeatureChoiceKey(key);
    if (parsed.classKey && parsed.featureName === featureName) {
      const entry = asEntry(value);
      if (entry) return entry;
    }
  }
  return null;
}

/**
 * Every stored instance of a feature keyed by its class. A bare key maps to `''`, meaning "the
 * only class", which is how pre-multiclass sheets are read back.
 */
export function readFeatureChoicesByClass(
  raw: unknown,
  featureName: string,
): Record<string, Record<string, unknown>> {
  const fc = asEntry(raw);
  if (!fc) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(fc)) {
    const parsed = parseFeatureChoiceKey(key);
    if (parsed.featureName !== featureName) continue;
    const entry = asEntry(value);
    if (entry) out[parsed.classKey ?? ''] = entry;
  }
  return out;
}

/** Reverse of {@link buildFeatureChoices}: spreads grouped choices back onto the flat form fields. */
export function featureChoicesToFormData(raw: unknown): Partial<CharacterFormData> {
  const out: Partial<CharacterFormData> = {};
  const fc = asEntry(raw);
  if (!fc) return out;

  // Option-card selection + lineage spellcasting ability live under every feature's name.
  const raceTraitSelections: Record<string, string> = {};
  const raceLineageSpellcastingAbility: Record<string, string> = {};
  for (const [name, value] of Object.entries(fc)) {
    const e = asEntry(value);
    if (!e) continue;
    // Fighting Style keeps its option inside its own per-class pick, not in the shared name-keyed map.
    if (parseFeatureChoiceKey(name).featureName === FIGHTING_STYLE) continue;
    if (typeof e.option === 'string') raceTraitSelections[name] = e.option;
    if (typeof e.spellcastingAbility === 'string') {
      raceLineageSpellcastingAbility[name] = e.spellcastingAbility;
    }
  }
  if (Object.keys(raceTraitSelections).length > 0) out.raceTraitSelections = raceTraitSelections;
  if (Object.keys(raceLineageSpellcastingAbility).length > 0) {
    out.raceLineageSpellcastingAbility = raceLineageSpellcastingAbility;
  }

  const elven = readFeatureChoice(fc, ELVEN_LINEAGE);
  if (elven && 'highElfCantrip' in elven) {
    out.highElfCantripName = elven.highElfCantrip as string | null;
  }

  const fightingStyleByClass = readFeatureChoicesByClass(fc, FIGHTING_STYLE);
  if (Object.keys(fightingStyleByClass).length > 0) {
    const byClass: NonNullable<CharacterFormData['fightingStyleByClass']> = {};
    for (const [classKey, entry] of Object.entries(fightingStyleByClass)) {
      byClass[classKey] = {
        featId: typeof entry.featId === 'string' ? entry.featId : null,
        mode: entry.mode === 'FEAT' ? 'FEAT' : 'OPTION',
        optionKey: typeof entry.option === 'string' ? entry.option : null,
        cantrips: Array.isArray(entry.cantrips)
          ? entry.cantrips.filter((n): n is string => typeof n === 'string')
          : [],
      };
    }
    out.fightingStyleByClass = byClass;
  }

  const epicBoon = readFeatureChoice(fc, EPIC_BOON);
  if (epicBoon) {
    if ('featId' in epicBoon) out.epicBoonFeatId = epicBoon.featId as string | null;
    if ('abilityScore' in epicBoon) out.epicBoonAbilityScore = epicBoon.abilityScore as string | null;
  }

  const versatile = readFeatureChoice(fc, VERSATILE);
  if (versatile && 'featId' in versatile) out.versatileFeatId = versatile.featId as string | null;

  const grappler = readFeatureChoice(fc, GRAPPLER);
  if (grappler && 'abilityScore' in grappler) {
    out.grapplerAbilityScore = grappler.abilityScore as string | null;
  }

  const weaponMasteryByClass = readFeatureChoicesByClass(fc, WEAPON_MASTERY);
  if (Object.keys(weaponMasteryByClass).length > 0) {
    const byClass: Record<string, string[]> = {};
    for (const [classKey, entry] of Object.entries(weaponMasteryByClass)) {
      if (Array.isArray(entry.weaponIds)) {
        byClass[classKey] = entry.weaponIds.filter((id): id is string => typeof id === 'string');
      }
    }
    // A bare key lands on '' and the derivation rebinds it to the class that actually grants it.
    out.weaponMasteryWeaponIdsByClass = byClass;
  }

  const primalKnowledge = readFeatureChoice(fc, PRIMAL_KNOWLEDGE);
  if (primalKnowledge && 'skillKey' in primalKnowledge) {
    out.primalKnowledgeSkillKey = primalKnowledge.skillKey as string | null;
  }

  const expertiseByClass = readFeatureChoicesByClass(fc, EXPERTISE);
  if (Object.keys(expertiseByClass).length > 0) {
    const byClass: Record<string, string[]> = {};
    for (const [classKey, entry] of Object.entries(expertiseByClass)) {
      if (Array.isArray(entry.skillKeys)) {
        byClass[classKey] = entry.skillKeys.filter((k): k is string => typeof k === 'string');
      }
    }
    out.expertiseSkillKeysByClass = byClass;
  }

  const scholar = readFeatureChoice(fc, SCHOLAR);
  if (scholar && 'expertiseSkillKey' in scholar) {
    out.scholarExpertiseSkillKey = scholar.expertiseSkillKey as string | null;
  }

  const deftExplorer = readFeatureChoice(fc, DEFT_EXPLORER);
  if (deftExplorer) {
    if ('expertiseSkillKey' in deftExplorer) {
      out.deftExplorerExpertiseSkillKey = deftExplorer.expertiseSkillKey as string | null;
    }
    if (Array.isArray(deftExplorer.languageNames)) {
      out.deftExplorerLanguageNames = deftExplorer.languageNames as string[];
    }
  }

  const thievesCant = readFeatureChoice(fc, THIEVES_CANT);
  if (thievesCant && 'extraLanguageName' in thievesCant) {
    out.thievesCantExtraLanguageName = thievesCant.extraLanguageName as string | null;
  }

  const metamagic = readFeatureChoice(fc, METAMAGIC);
  if (metamagic && Array.isArray(metamagic.optionKeys)) {
    out.metamagicOptionKeys = metamagic.optionKeys as string[];
  }

  const invocations = readFeatureChoice(fc, ELDRITCH_INVOCATIONS);
  if (invocations && Array.isArray(invocations.selections)) {
    out.eldritchInvocationSelections =
      invocations.selections as CharacterFormData['eldritchInvocationSelections'];
  }

  const pactOfTome = readFeatureChoice(fc, PACT_OF_THE_TOME);
  if (pactOfTome) {
    out.pactOfTomeSpellNames = {
      cantrips: Array.isArray(pactOfTome.cantrips) ? (pactOfTome.cantrips as string[]) : [],
      rituals: Array.isArray(pactOfTome.rituals) ? (pactOfTome.rituals as string[]) : [],
    };
  }

  const mysticArcanum = readFeatureChoice(fc, MYSTIC_ARCANUM);
  if (mysticArcanum && Array.isArray(mysticArcanum.spellNamesByGain)) {
    out.mysticArcanumSpellNamesByGain = mysticArcanum.spellNamesByGain as (string | null)[];
  }

  const signatureSpells = readFeatureChoice(fc, SIGNATURE_SPELLS);
  if (signatureSpells && Array.isArray(signatureSpells.spellNames)) {
    out.signatureSpellsSpellNames = signatureSpells.spellNames as (string | null)[];
  }

  const spellMastery = readFeatureChoice(fc, SPELL_MASTERY);
  if (spellMastery && asEntry(spellMastery.spellNamesByLevel)) {
    out.spellMasterySpellNamesByLevel = spellMastery.spellNamesByLevel as Record<
      number,
      string | null | undefined
    >;
  }

  const skilledBySource = asEntry(readFeatureChoice(fc, SKILLED)?.bySource);
  if (skilledBySource) {
    out.skilledChoicesBySource = skilledBySource as CharacterFormData['skilledChoicesBySource'];
    // Rebuild the flat deduped union consumers read.
    const flat: string[] = [];
    const seen = new Set<string>();
    for (const picks of Object.values(skilledBySource)) {
      if (!Array.isArray(picks)) continue;
      for (const id of picks) {
        if (typeof id !== 'string' || seen.has(id)) continue;
        seen.add(id);
        flat.push(id);
      }
    }
    out.skilledProficiencyChoices = flat;
  }

  const asi = readFeatureChoice(fc, ABILITY_SCORE_IMPROVEMENT);
  if (asi && Array.isArray(asi.byGain)) {
    out.abilityScoreImprovementByGain =
      asi.byGain as CharacterFormData['abilityScoreImprovementByGain'];
  }

  const magicInitiate = readFeatureChoice(fc, MAGIC_INITIATE);
  if (magicInitiate && asEntry(magicInitiate.bySource)) {
    out.magicInitiateChoicesBySource =
      magicInitiate.bySource as CharacterFormData['magicInitiateChoicesBySource'];
  }

  const bonusProficiencies = readFeatureChoice(fc, BONUS_PROFICIENCIES);
  if (bonusProficiencies && Array.isArray(bonusProficiencies.skillKeys)) {
    out.bonusProficienciesSkillKeys = bonusProficiencies.skillKeys.filter(
      (k): k is string => typeof k === 'string'
    );
  }

  const additionalFightingStyle = readFeatureChoice(fc, ADDITIONAL_FIGHTING_STYLE);
  if (additionalFightingStyle && 'featId' in additionalFightingStyle) {
    out.additionalFightingStyleFeatId = additionalFightingStyle.featId as string | null;
  }

  const magicalDiscoveries = readFeatureChoice(fc, MAGICAL_DISCOVERIES);
  if (magicalDiscoveries && Array.isArray(magicalDiscoveries.spellNames)) {
    out.magicalDiscoveriesSpellNames = magicalDiscoveries.spellNames as (string | null)[];
  }

  const evocationSavant = readFeatureChoice(fc, EVOCATION_SAVANT);
  if (evocationSavant && asEntry(evocationSavant.spellbookByLevel)) {
    out.evocationSavantSpellbookByLevel = evocationSavant.spellbookByLevel as Record<
      number,
      string[]
    >;
  }

  return out;
}
