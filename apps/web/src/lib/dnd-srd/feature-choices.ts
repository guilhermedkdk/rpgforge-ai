import type { CharacterFormData } from './character-state';

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

  const hasFightingStyleChoice = Boolean(
    data.fightingStyleFeatId ?? data.raceTraitSelections?.[FIGHTING_STYLE] ?? null
  );
  if (data.fightingStyleFeatId) set(FIGHTING_STYLE, 'featId', data.fightingStyleFeatId);
  if (hasFightingStyleChoice && (data.fightingStyleMode ?? 'OPTION') !== 'OPTION') {
    set(FIGHTING_STYLE, 'mode', data.fightingStyleMode);
  }
  if ((data.fightingStyleCantrips?.length ?? 0) > 0) {
    set(FIGHTING_STYLE, 'cantrips', [...(data.fightingStyleCantrips ?? [])]);
  }

  if (data.epicBoonFeatId) set(EPIC_BOON, 'featId', data.epicBoonFeatId);
  if (data.epicBoonAbilityScore) set(EPIC_BOON, 'abilityScore', data.epicBoonAbilityScore);
  if (data.versatileFeatId) set(VERSATILE, 'featId', data.versatileFeatId);
  if (data.grapplerAbilityScore) set(GRAPPLER, 'abilityScore', data.grapplerAbilityScore);

  if (isNonEmptyArray(data.weaponMasteryWeaponIds)) {
    set(WEAPON_MASTERY, 'weaponIds', [...(data.weaponMasteryWeaponIds ?? [])]);
  }
  if (isNonEmptyString(data.primalKnowledgeSkillKey)) {
    set(PRIMAL_KNOWLEDGE, 'skillKey', data.primalKnowledgeSkillKey);
  }
  if (isNonEmptyArray(data.expertiseSkillKeys)) {
    set(EXPERTISE, 'skillKeys', [...(data.expertiseSkillKeys ?? [])]);
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

  return out;
}

function asEntry(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
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
    if (typeof e.option === 'string') raceTraitSelections[name] = e.option;
    if (typeof e.spellcastingAbility === 'string') {
      raceLineageSpellcastingAbility[name] = e.spellcastingAbility;
    }
  }
  if (Object.keys(raceTraitSelections).length > 0) out.raceTraitSelections = raceTraitSelections;
  if (Object.keys(raceLineageSpellcastingAbility).length > 0) {
    out.raceLineageSpellcastingAbility = raceLineageSpellcastingAbility;
  }

  const elven = asEntry(fc[ELVEN_LINEAGE]);
  if (elven && 'highElfCantrip' in elven) {
    out.highElfCantripName = elven.highElfCantrip as string | null;
  }

  const fightingStyle = asEntry(fc[FIGHTING_STYLE]);
  if (fightingStyle) {
    if ('featId' in fightingStyle) out.fightingStyleFeatId = fightingStyle.featId as string | null;
    if (fightingStyle.mode === 'OPTION' || fightingStyle.mode === 'FEAT') {
      out.fightingStyleMode = fightingStyle.mode;
    }
    if (Array.isArray(fightingStyle.cantrips)) {
      out.fightingStyleCantrips = fightingStyle.cantrips.filter(
        (n): n is string => typeof n === 'string'
      );
    }
  }

  const epicBoon = asEntry(fc[EPIC_BOON]);
  if (epicBoon) {
    if ('featId' in epicBoon) out.epicBoonFeatId = epicBoon.featId as string | null;
    if ('abilityScore' in epicBoon) out.epicBoonAbilityScore = epicBoon.abilityScore as string | null;
  }

  const versatile = asEntry(fc[VERSATILE]);
  if (versatile && 'featId' in versatile) out.versatileFeatId = versatile.featId as string | null;

  const grappler = asEntry(fc[GRAPPLER]);
  if (grappler && 'abilityScore' in grappler) {
    out.grapplerAbilityScore = grappler.abilityScore as string | null;
  }

  const weaponMastery = asEntry(fc[WEAPON_MASTERY]);
  if (weaponMastery && Array.isArray(weaponMastery.weaponIds)) {
    out.weaponMasteryWeaponIds = weaponMastery.weaponIds as string[];
  }

  const primalKnowledge = asEntry(fc[PRIMAL_KNOWLEDGE]);
  if (primalKnowledge && 'skillKey' in primalKnowledge) {
    out.primalKnowledgeSkillKey = primalKnowledge.skillKey as string | null;
  }

  const expertise = asEntry(fc[EXPERTISE]);
  if (expertise && Array.isArray(expertise.skillKeys)) {
    out.expertiseSkillKeys = expertise.skillKeys as string[];
  }

  const scholar = asEntry(fc[SCHOLAR]);
  if (scholar && 'expertiseSkillKey' in scholar) {
    out.scholarExpertiseSkillKey = scholar.expertiseSkillKey as string | null;
  }

  const deftExplorer = asEntry(fc[DEFT_EXPLORER]);
  if (deftExplorer) {
    if ('expertiseSkillKey' in deftExplorer) {
      out.deftExplorerExpertiseSkillKey = deftExplorer.expertiseSkillKey as string | null;
    }
    if (Array.isArray(deftExplorer.languageNames)) {
      out.deftExplorerLanguageNames = deftExplorer.languageNames as string[];
    }
  }

  const thievesCant = asEntry(fc[THIEVES_CANT]);
  if (thievesCant && 'extraLanguageName' in thievesCant) {
    out.thievesCantExtraLanguageName = thievesCant.extraLanguageName as string | null;
  }

  const metamagic = asEntry(fc[METAMAGIC]);
  if (metamagic && Array.isArray(metamagic.optionKeys)) {
    out.metamagicOptionKeys = metamagic.optionKeys as string[];
  }

  const invocations = asEntry(fc[ELDRITCH_INVOCATIONS]);
  if (invocations && Array.isArray(invocations.selections)) {
    out.eldritchInvocationSelections =
      invocations.selections as CharacterFormData['eldritchInvocationSelections'];
  }

  const pactOfTome = asEntry(fc[PACT_OF_THE_TOME]);
  if (pactOfTome) {
    out.pactOfTomeSpellNames = {
      cantrips: Array.isArray(pactOfTome.cantrips) ? (pactOfTome.cantrips as string[]) : [],
      rituals: Array.isArray(pactOfTome.rituals) ? (pactOfTome.rituals as string[]) : [],
    };
  }

  const mysticArcanum = asEntry(fc[MYSTIC_ARCANUM]);
  if (mysticArcanum && Array.isArray(mysticArcanum.spellNamesByGain)) {
    out.mysticArcanumSpellNamesByGain = mysticArcanum.spellNamesByGain as (string | null)[];
  }

  const signatureSpells = asEntry(fc[SIGNATURE_SPELLS]);
  if (signatureSpells && Array.isArray(signatureSpells.spellNames)) {
    out.signatureSpellsSpellNames = signatureSpells.spellNames as (string | null)[];
  }

  const spellMastery = asEntry(fc[SPELL_MASTERY]);
  if (spellMastery && asEntry(spellMastery.spellNamesByLevel)) {
    out.spellMasterySpellNamesByLevel = spellMastery.spellNamesByLevel as Record<
      number,
      string | null | undefined
    >;
  }

  const skilledBySource = asEntry(asEntry(fc[SKILLED])?.bySource);
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

  const asi = asEntry(fc[ABILITY_SCORE_IMPROVEMENT]);
  if (asi && Array.isArray(asi.byGain)) {
    out.abilityScoreImprovementByGain =
      asi.byGain as CharacterFormData['abilityScoreImprovementByGain'];
  }

  const magicInitiate = asEntry(fc[MAGIC_INITIATE]);
  if (magicInitiate && asEntry(magicInitiate.bySource)) {
    out.magicInitiateChoicesBySource =
      magicInitiate.bySource as CharacterFormData['magicInitiateChoicesBySource'];
  }

  return out;
}
