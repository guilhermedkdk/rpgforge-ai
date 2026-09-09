import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';
import {
  isBackgroundAbilityBonusDistributionComplete,
  isCharacterBackgroundSelected,
  isPointBuyAbilityDistributionComplete,
  isStandardArrayAbilityDistributionComplete,
} from '../derivation/ability-progression';
import { getOptionGrantedExtraCantrips } from '../features/feature-matchers';
import {
  featRuleItemAsMechanicsFeature,
  isGrapplerFeature,
  isMagicInitiateFeature,
} from '../features/feature-mechanics';
import { isMagicInitiateFullyChosen } from '../character/character-factory';
import { isEldritchInvocationsFeature } from '../features/feature-mechanics';
import { getPendingToolProficiencyChoices } from '../proficiencies/tool-proficiencies';
import { isClassSkillSelectionComplete } from '../proficiencies/skills';
import {
  areStandardLanguagesComplete,
  MAX_STANDARD_LANGUAGES_TOTAL,
} from '../proficiencies/languages';
import { getFeatureChoiceState } from '../features/feature-choice-state';
import { normalizeFeatName } from '../features/feat-prerequisites';
import { isSubclassOfClass } from '../features/class-detection';
import { realClassEntries, totalClassLevel } from '../character/class-entries';
import { getSheetMulticlassPrerequisiteMisses } from '../character/multiclass-prerequisites';
import { SUBCLASS_UNLOCK_LEVEL, splitEquipmentBySource } from '../options/character-options';
import {
  HOLY_SYMBOL_PLACEHOLDER_LINE,
  MUSICAL_INSTRUMENT_PLACEHOLDER_LINE,
} from '../equipment/equipment-lookup';
import { isSkilledFullyChosen } from '../derivation/feat-source-reconciliation';
import { getAllFightingStyleFeatIds } from '../features/fighting-style';
import {
  isPactOfTomeSelected,
  PACT_OF_TOME_MAX_CANTRIPS,
  PACT_OF_TOME_MAX_RITUALS,
} from '../features/eldritch-invocations';
import {
  countPickedCantrips,
  countPickedLeveledSpells,
  countWizardSpellbookSpells,
  findSpellcastingFeatureDetail,
  getMaxCantrips,
  getMaxPreparedSpells,
  wizardSpellbookMaxByLevel,
} from '../spells/spellcasting-limits';
import {
  countAvailableSpells,
  ruleItemIsRitual,
  ruleItemSpellLevel,
  spellClassTag,
} from '../spells/spells';
import { attributePickedSpells, getCastingClasses } from '../spells/class-spellcasting';

function collectToolProficiencyErrors(data: CharacterFormData): string[] {
  return getPendingToolProficiencyChoices(data).map(
    (p) => `Escolha proficiências em ferramentas: ${p.categoryLabel} (${p.chosen}/${p.chooseN}).`
  );
}

function collectAdditionalFeatErrors(
  data: CharacterFormData,
  featsList: RuleItemResponse[],
  allSpells: RuleItemResponse[] | undefined
): string[] {
  const errors: string[] = [];
  const featIdByNormalizedName = new Map<string, string>();
  for (const feat of featsList) {
    const key = normalizeFeatName(feat.name ?? '');
    if (!key || featIdByNormalizedName.has(key)) continue;
    featIdByNormalizedName.set(key, feat.id);
  }
  const backgroundFeatIds = (data.featureDetails ?? [])
    .filter((f) => f.source === 'background')
    .map((f) => featIdByNormalizedName.get(normalizeFeatName(f.name ?? '')) ?? null)
    .filter((id): id is string => id != null);

  const additionalFeatIds = [
    ...backgroundFeatIds,
    ...(data.abilityScoreImprovementByGain ?? [])
      .filter(
        (g): g is { kind: 'feat'; featId: string } =>
          g?.kind === 'feat' && typeof g.featId === 'string'
      )
      .map((g) => g.featId),
    ...getAllFightingStyleFeatIds(data),
    ...(data.epicBoonFeatId ? [data.epicBoonFeatId] : []),
    ...(data.versatileFeatId ? [data.versatileFeatId] : []),
    ...(data.eldritchInvocationSelections ?? [])
      .map((s) => s.featId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);

  // Skilled is checked once across every granting source (each needs all of its picks).
  if (!isSkilledFullyChosen(data, featsList)) {
    errors.push('Complete as escolhas do talento Skilled em cada origem.');
  }

  for (const id of additionalFeatIds) {
    const feat = featsList.find((x) => x.id === id);
    if (!feat) continue;
    // A feat is one rule item, so its machine key sits at the root of `normalized`.
    const featAsFeature = featRuleItemAsMechanicsFeature(feat);
    if (isGrapplerFeature(featAsFeature) && !data.grapplerAbilityScore) {
      errors.push('Escolha Força ou Destreza para o talento Grappler.');
    }
    if (isMagicInitiateFeature(featAsFeature) && !isMagicInitiateFullyChosen(data, allSpells)) {
      errors.push(`Conclua as escolhas em: “${feat.name}”.`);
    }
  }
  return errors;
}

export type CharacterSheetSaveValidationContext = {
  standardLanguageOptions: RuleItemResponse[];
  skillsList: Array<{ key: string; name: string }>;
  feats: RuleItemResponse[];
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
  /**
   * Full spell catalog of the pack. Lets every "pick N spells" requirement be capped at how many
   * are actually selectable (`min(max, available)`) so a pool smaller than the max can never make a
   * sheet impossible to save. Optional: when absent (no catalog on hand), spell counts fall back to
   * the raw max — the check only ever loosens, so it can never wrongly block a save.
   */
  allSpells?: RuleItemResponse[];
};

/**
 * Returns user-facing messages (Portuguese) for everything that must be resolved before persisting.
 */
export function getCharacterSheetSaveValidationErrors(
  data: CharacterFormData,
  ctx: CharacterSheetSaveValidationContext
): string[] {
  const errors: string[] = [];

  if (!data.name.trim()) {
    errors.push('Informe o nome do personagem.');
  }

  const level = Math.floor(Number(data.level));
  if (!Number.isFinite(level) || level < 1 || level > 20) {
    errors.push('Defina o nível do personagem entre 1 e 20.');
  }

  if (data.raceRuleItemId == null && !(data.race ?? '').trim()) {
    errors.push('Selecione a espécie (species).');
  }

  if (data.classRuleItemId == null && !(data.className ?? '').trim()) {
    errors.push('Selecione a classe.');
  }

  // In SRD 5.2 every class chooses its subclass at level 3 IN THAT CLASS; required when the pack
  // has one for it. Checked per entry, so a Fighter 5 / Wizard 1 is only asked for the Fighter's.
  const classEntries = realClassEntries(data);
  for (const entry of classEntries) {
    if (entry.level < SUBCLASS_UNLOCK_LEVEL || entry.subclassRuleItemId != null) continue;
    const classItem = ctx.classes.find((c) => c.id === entry.classRuleItemId) ?? null;
    if (classItem && ctx.subclasses.some((s) => isSubclassOfClass(s, classItem))) {
      errors.push(
        classEntries.length > 1
          ? `Selecione a subclasse de ${entry.className || 'sua classe'}.`
          : 'Selecione a subclasse (Subclass).'
      );
    }
  }

  if (classEntries.length > 1) {
    // The class levels ARE the character level; a mismatch means a tampered or stale payload.
    const sum = totalClassLevel(classEntries);
    if (sum > 20) {
      errors.push('A soma dos níveis das classes não pode passar de 20.');
    }
    // Same entry point the sheet's own cue reads, so the field that turns red and the error that
    // blocks the save can never disagree. Scores are the EFFECTIVE ones (background bonus, ASI...).
    for (const miss of getSheetMulticlassPrerequisiteMisses(data, ctx.classes)) {
      // The WHOLE requirement, never just the ability that fell short: a Monk demands Dexterity and
      // Wisdom, and naming one of them reads as the only one it wants.
      const abilities = miss.abilities.join(miss.mode === 'any' ? ' ou ' : ' e ');
      // Which ability the score belongs to only matters when the class names more than one.
      const score =
        miss.abilities.length > 1
          ? `você tem ${miss.actual} em ${miss.ability}`
          : `você tem ${miss.actual}`;
      errors.push(
        `Multiclasse em ${miss.className} exige ${abilities} ${miss.required}: ${score}.`
      );
    }
  }

  if (!isCharacterBackgroundSelected(data)) {
    errors.push('Selecione o antecedente.');
  }

  const method = data.abilityScoreMethod ?? 'standard-array';
  const attrsOk =
    method === 'point-buy'
      ? isPointBuyAbilityDistributionComplete(data.attributes ?? {})
      : isStandardArrayAbilityDistributionComplete(data.attributes ?? {});
  if (!attrsOk) {
    errors.push(
      method === 'point-buy'
        ? 'Complete a distribuição de atributos (Point Buy).'
        : 'Complete a distribuição de atributos (Standard Array).'
    );
  }

  if (
    isCharacterBackgroundSelected(data) &&
    !isBackgroundAbilityBonusDistributionComplete(
      data.backgroundAbilityScoreOption,
      data.backgroundAbilityScoreIncrease
    )
  ) {
    errors.push(
      'Distribua todos os pontos de atributo do antecedente (Background Ability Bonuses).'
    );
  }

  if (!areStandardLanguagesComplete(data, ctx.standardLanguageOptions)) {
    const required = Math.min(MAX_STANDARD_LANGUAGES_TOTAL, ctx.standardLanguageOptions.length);
    errors.push(`Escolha ${required} idiomas padrão (incluindo Common quando disponível).`);
  }

  if (!isClassSkillSelectionComplete(data, ctx.skillsList)) {
    errors.push(
      'Complete todas as perícias obrigatórias da classe na seção Skills (Class Skills).'
    );
  }

  errors.push(...collectToolProficiencyErrors(data));

  const startOpts = data.startingEquipmentOptions?.options ?? [];
  if (startOpts.length > 0 && data.startingEquipmentSelectedIndex === null) {
    errors.push('Escolha o equipamento inicial da classe (Class Starting Equipment).');
  }

  const bgEqOpts = data.backgroundEquipmentOptions?.options ?? [];
  if (bgEqOpts.length > 0 && data.backgroundEquipmentSelectedIndex === null) {
    errors.push('Escolha o equipamento do antecedente (Background Equipment).');
  }

  // Equipment item choices — validate per source so class/background keys are checked correctly.
  const classOptText =
    data.startingEquipmentSelectedIndex != null
      ? (data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]?.text ??
        null)
      : null;
  const bgOptText =
    data.backgroundEquipmentSelectedIndex != null
      ? (data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]?.text ??
        null)
      : null;
  const {
    classLines: classEquip,
    backgroundLines: bgEquip,
    manualLines: manualEquip,
  } = splitEquipmentBySource(
    data.equipment ?? '',
    classOptText,
    bgOptText,
    data.equipmentSourceByLine
  );
  const hasPlaceholder = (lines: string[], placeholder: string) =>
    lines.some((l) => l.trim().toLowerCase() === placeholder);

  if (
    hasPlaceholder(classEquip, MUSICAL_INSTRUMENT_PLACEHOLDER_LINE) ||
    hasPlaceholder(manualEquip, MUSICAL_INSTRUMENT_PLACEHOLDER_LINE)
  ) {
    if (!data.toolProficiencyChoices?.['Musical Instrument of your choice']?.length) {
      errors.push('Escolha um instrumento musical no equipamento inicial da classe.');
    }
  }
  if (hasPlaceholder(bgEquip, MUSICAL_INSTRUMENT_PLACEHOLDER_LINE)) {
    if (!data.toolProficiencyChoices?.['Musical Instrument of your choice (Background)']?.length) {
      errors.push('Escolha um instrumento musical no equipamento do antecedente.');
    }
  }

  if (
    hasPlaceholder(classEquip, HOLY_SYMBOL_PLACEHOLDER_LINE) ||
    hasPlaceholder(manualEquip, HOLY_SYMBOL_PLACEHOLDER_LINE)
  ) {
    if (!data.holySymbolChoiceItemIds?.class) {
      errors.push('Escolha um Holy Symbol no equipamento inicial da classe.');
    }
  }
  if (hasPlaceholder(bgEquip, HOLY_SYMBOL_PLACEHOLDER_LINE)) {
    if (!data.holySymbolChoiceItemIds?.background) {
      errors.push('Escolha um Holy Symbol no equipamento do antecedente.');
    }
  }

  const featureDetails = data.featureDetails ?? [];
  // A feature two classes grant is TWO pending choices, so the message names the class; without it
  // a Paladin/Fighter got the identical "Conclua as escolhas em: Weapon Mastery" twice.
  const instanceCount = new Map<string, number>();
  for (const f of featureDetails) {
    const key = f.name.trim().toLowerCase();
    instanceCount.set(key, (instanceCount.get(key) ?? 0) + 1);
  }

  for (const f of featureDetails) {
    const source = (f.source ?? 'class') as string;
    if (source === 'background') continue;
    if (source !== 'class' && source !== 'subclass' && source !== 'race') continue;

    const { hasOptions, selectedOptionLabel } = getFeatureChoiceState(f, data, featureDetails, {
      allSpells: ctx.allSpells,
      skillsList: ctx.skillsList,
    });
    if (hasOptions && !selectedOptionLabel) {
      const shared = (instanceCount.get(f.name.trim().toLowerCase()) ?? 1) > 1;
      const scope = shared && f.sourceClassName ? ` de ${f.sourceClassName}` : '';
      errors.push(`Conclua as escolhas em: “${f.name}”${scope}.`);
    }
  }

  const spellcastingFeature = findSpellcastingFeatureDetail(featureDetails);
  const spellLevel = Math.max(1, Math.min(20, Math.floor(Number(data.level) || 1)));

  // Class name for the spell-pool tag; needed to count how many spells are actually selectable.
  // Resolve from the class rule item FIRST (like the spell picker does) — `data.className` is often an
  // empty string (the class is stored by id), and `??` would keep `''` instead of falling back.
  const classItemForSpells = ctx.classes.find((c) => c.id === data.classRuleItemId) ?? null;
  const classNameForSpells = (classItemForSpells?.name || data.className || '').trim();
  // Spells already on the sheet from another source, per level bucket — excluded from "available"
  // so the requirement is capped at what the user can still add for that pool.
  const grantedNamesAtLevel = (predicate: (lvl: number) => boolean): Set<string> => {
    const out = new Set<string>();
    for (const [lvlStr, rows] of Object.entries(data.spellsByLevel ?? {})) {
      if (!predicate(Number(lvlStr))) continue;
      for (const r of rows) if (r.granted) out.add(r.name.trim().toLowerCase());
    }
    return out;
  };
  // required = min(configured max, how many are actually selectable). `cap`-only-loosens: a smaller
  // pool can never make the sheet impossible to save. Falls back to the raw max when no catalog.
  const capToAvailable = (
    max: number,
    tagKeys: string[],
    minLevel: number,
    maxLevel: number,
    exclude?: Set<string>
  ): number =>
    ctx.allSpells && classNameForSpells
      ? Math.min(max, countAvailableSpells(ctx.allSpells, tagKeys, minLevel, maxLevel, exclude))
      : max;

  // Per class, from the SAME shared resolver the editor's counters read: a Cleric 4 / Wizard 3 owes
  // 4 Cleric cantrips AND 3 Wizard ones, and one pool may never pay for the other. Summing them into
  // a single requirement would accept a sheet the editor still shows as incomplete.
  const spellByNameLower = new Map<string, RuleItemResponse>();
  for (const s of ctx.allSpells ?? []) spellByNameLower.set(s.name.trim().toLowerCase(), s);
  const castingClasses = getCastingClasses(data, ctx.classes);
  const spellOwnership = attributePickedSpells({
    spellsByLevel: data.spellsByLevel,
    castingClasses,
    resolveSpell: (name) => spellByNameLower.get(name.trim().toLowerCase()) ?? null,
  });

  /** Picks owned by ANOTHER class: they are off this class's pool, exactly as the picker shows. */
  const namesOwnedByOtherClasses = (
    classRuleItemId: string,
    predicate: (lvl: number) => boolean
  ): Set<string> => {
    const out = new Set<string>();
    for (const [rowKey, ownerId] of spellOwnership.ownerByRow) {
      if (ownerId === classRuleItemId) continue;
      const sep = rowKey.indexOf(':');
      if (!predicate(Number(rowKey.slice(0, sep)))) continue;
      out.add(rowKey.slice(sep + 1));
    }
    return out;
  };

  const spellRequirements: Array<{ label: string; picked: number; required: number }> = [];
  if (castingClasses.length > 0) {
    // With one caster the class is implied; with several the message has to name which pool is short.
    const scope = (c: (typeof castingClasses)[number]) =>
      castingClasses.length === 1 ? 'da classe' : `de ${c.className}`;
    for (const c of castingClasses) {
      if (c.maxCantrips > 0) {
        const cantripExclude = new Set([
          ...grantedNamesAtLevel((lvl) => lvl === 0),
          ...namesOwnedByOtherClasses(c.classRuleItemId, (lvl) => lvl === 0),
        ]);
        spellRequirements.push({
          label: `os truques (cantrips) ${scope(c)}`,
          picked: spellOwnership.pickedCantrips.get(c.classRuleItemId) ?? 0,
          required: capToAvailable(c.maxCantrips, [c.spellTagKey], 0, 0, cantripExclude),
        });
      }
      if (c.maxPrepared > 0) {
        const preparedExclude = new Set([
          ...grantedNamesAtLevel((lvl) => lvl >= 1),
          ...namesOwnedByOtherClasses(c.classRuleItemId, (lvl) => lvl >= 1),
        ]);
        spellRequirements.push({
          label: `as magias preparadas ${scope(c)}`,
          picked: spellOwnership.pickedPrepared.get(c.classRuleItemId) ?? 0,
          // Capped at the levels THIS class may prepare, not at the slot levels the character has.
          required: capToAvailable(
            c.maxPrepared,
            [c.spellTagKey],
            1,
            c.maxSpellLevel,
            preparedExclude
          ),
        });
      }
    }
  } else {
    // No casting class resolved (features without `sourceClassId`): the pre-multiclass behaviour.
    const maxCantrips =
      getMaxCantrips(spellcastingFeature, spellLevel) + getOptionGrantedExtraCantrips(data);
    if (maxCantrips > 0) {
      spellRequirements.push({
        label: 'os truques (cantrips) da classe',
        picked: countPickedCantrips(data.spellsByLevel),
        required: capToAvailable(
          maxCantrips,
          [spellClassTag(classNameForSpells)],
          0,
          0,
          grantedNamesAtLevel((lvl) => lvl === 0)
        ),
      });
    }
    const maxPreparedSpells = getMaxPreparedSpells(spellcastingFeature, spellLevel);
    if (maxPreparedSpells > 0) {
      spellRequirements.push({
        label: 'as magias preparadas da classe',
        picked: countPickedLeveledSpells(data.spellsByLevel),
        required: capToAvailable(
          maxPreparedSpells,
          [spellClassTag(classNameForSpells)],
          1,
          9,
          grantedNamesAtLevel((lvl) => lvl >= 1)
        ),
      });
    }
  }
  for (const req of spellRequirements) {
    if (req.picked < req.required) {
      errors.push(`Escolha ${req.label} na seção Spells (${req.picked}/${req.required}).`);
    }
  }

  // Spellbook capacity follows the WIZARD level, not the character level.
  const wizardCaster = castingClasses.find((c) => c.className.trim().toLowerCase() === 'wizard');
  const wizardLevel =
    wizardCaster?.level ??
    ((data.className ?? '').trim().toLowerCase() === 'wizard' ? spellLevel : 0);
  if (wizardLevel > 0 && spellcastingFeature) {
    const spellbookMax = capToAvailable(
      wizardSpellbookMaxByLevel(wizardLevel),
      [spellClassTag('wizard')],
      1,
      9
    );
    const spellbookCount = countWizardSpellbookSpells(data.wizardSpellbookByLevel);
    if (spellbookCount < spellbookMax) {
      errors.push(
        `Adicione as magias do grimório (Spellbook) na seção Spells (${spellbookCount}/${spellbookMax}).`
      );
    }
  }

  // Book of Shadows (Pact of the Tome) is required like the Wizard's spellbook: its picks live on
  // the Spells page, so selecting the invocation alone isn't enough to consider the sheet complete.
  const eldritchFeature = featureDetails.find(
    (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
  );
  if (eldritchFeature) {
    const tomeDescByKey = new Map(
      (eldritchFeature.options ?? []).map((o) => [o.key, o.desc ?? ''] as const)
    );
    if (isPactOfTomeSelected(data.eldritchInvocationSelections ?? [], tomeDescByKey)) {
      const cantrips = data.pactOfTomeSpellNames?.cantrips?.length ?? 0;
      const rituals = data.pactOfTomeSpellNames?.rituals?.length ?? 0;
      // Cap at what the pack can supply (any-class cantrips / level-1 rituals) so a tiny pool can't
      // leave the book impossible to fill. Pools are huge here, so this practically never triggers.
      const reqCantrips = ctx.allSpells
        ? Math.min(
            PACT_OF_TOME_MAX_CANTRIPS,
            ctx.allSpells.filter((s) => ruleItemSpellLevel(s) === 0).length
          )
        : PACT_OF_TOME_MAX_CANTRIPS;
      const reqRituals = ctx.allSpells
        ? Math.min(
            PACT_OF_TOME_MAX_RITUALS,
            ctx.allSpells.filter((s) => ruleItemSpellLevel(s) === 1 && ruleItemIsRitual(s)).length
          )
        : PACT_OF_TOME_MAX_RITUALS;
      if (cantrips < reqCantrips || rituals < reqRituals) {
        errors.push(
          `Complete o Livro das Sombras (Book of Shadows) na seção Spells: ${cantrips}/${reqCantrips} truques e ${rituals}/${reqRituals} magias rituais.`
        );
      }
    }
  }

  errors.push(...collectAdditionalFeatErrors(data, ctx.feats, ctx.allSpells));

  return errors;
}
