import type { RuleItemResponse } from '@rpgforce-ai/shared';
import {
  getEffectiveEpicBoonAbilityScore,
  getFightingStyleCantripGrant,
  getOptionGrantedExtraCantrips,
  isAbilityScoreImprovementFullyResolved,
  isBackgroundAbilityBonusDistributionComplete,
  isCharacterBackgroundSelected,
  isMagicInitiateFeatureName,
  isMagicInitiateFullyChosen,
  isMysticArcanumFullyChosen,
  isPointBuyAbilityDistributionComplete,
  isSignatureSpellsFullyChosen,
  isSpellMasteryFullyChosen,
  isStandardArrayAbilityDistributionComplete,
  isThievesCantFeatureName,
  type CharacterFormData,
} from '@/lib/dnd-srd/character-state';
import {
  dedupeProficiencyLabelsPreserveOrder,
  getBonusClassSkillBudgetExemptKeys,
  getClassExpertiseSkillKeys,
  normalizeStandardLanguageNames,
  parseToolProficiencyChoose,
} from '@/components/systems/dnd-srd/character-sheet/helpers';
import { MAX_STANDARD_LANGUAGES_TOTAL } from '@/components/systems/dnd-srd/character-sheet/constants';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageSpellNamesForCharacter,
} from '@/lib/dnd-srd/race-lineage-table-spells';
import { splitEquipmentBySource } from '@/lib/dnd-srd/equipment-utils';
import { isSkilledFullyChosen } from '@/lib/dnd-srd/derived-character-stats';
import { computeWeaponMasteryMaxSelections } from '@/lib/dnd-srd/weapon-mastery';
import {
  areEldritchInvocationsFullyChosen,
  isPactOfTomeBookComplete,
  isPactOfTomeSelected,
  PACT_OF_TOME_MAX_CANTRIPS,
  PACT_OF_TOME_MAX_RITUALS,
} from '@/lib/dnd-srd/eldritch-invocations';
import {
  countPickedCantrips,
  countPickedLeveledSpells,
  countWizardSpellbookSpells,
  findSpellcastingFeatureDetail,
  getEldritchInvocationsKnown,
  getMaxCantrips,
  getMaxPreparedSpells,
  wizardSpellbookMaxByLevel,
} from '@/lib/dnd-srd/spellcasting-limits';

type FeatureDetail = NonNullable<CharacterFormData['featureDetails']>[number];

export function computeWeaponMasteryMetaForSave(
  data: CharacterFormData,
  featureDetails: CharacterFormData['featureDetails']
): {
  hasWeaponMasteryFeature: boolean;
  maxSelections: number;
  currentSelections: string[];
} {
  const currentLevel = Math.max(1, Math.min(20, data.level ?? 1));
  const feature = featureDetails.find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'weapon mastery'
  );

  return {
    hasWeaponMasteryFeature: !!feature,
    maxSelections: computeWeaponMasteryMaxSelections(feature, currentLevel),
    currentSelections: data.weaponMasteryWeaponIds ?? [],
  };
}

function getFeatureChoiceUiState(
  f: FeatureDetail,
  data: CharacterFormData,
  featureDetails: CharacterFormData['featureDetails'],
  weaponMasteryMeta: ReturnType<typeof computeWeaponMasteryMetaForSave>
): { hasOptions: boolean; selectedOptionLabel: string | null } {
  const nameLower = f.name.trim().toLowerCase();
  let hasOptions = !!(f.options && f.options.length >= 2);
  let selectedOptionLabel: string | null = null;

  if (hasOptions && f.options) {
    const isImprovedBlessed = nameLower === 'improved blessed strikes';
    const isImprovedElemental = nameLower === 'improved elemental fury';
    const baseFeatureName = isImprovedBlessed
      ? 'Blessed Strikes'
      : isImprovedElemental
        ? 'Elemental Fury'
        : f.name;
    const selectedKey = data.raceTraitSelections?.[baseFeatureName] ?? null;
    if (selectedKey) {
      selectedOptionLabel = f.options.find((o) => o.key === selectedKey)?.label ?? 'chosen';
    }
  }

  if (nameLower === 'primal knowledge') {
    hasOptions = true;
    if (data.primalKnowledgeSkillKey) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'keen senses') {
    const opts = f.options ?? [];
    if (opts.length >= 1) {
      hasOptions = true;
      const sel = data.raceTraitSelections?.[f.name] ?? null;
      if (sel && opts.some((o) => o.key === sel)) {
        selectedOptionLabel = opts.find((o) => o.key === sel)?.label ?? 'chosen';
      } else if (opts.length === 1) {
        selectedOptionLabel = opts[0].label;
      }
    }
  }
  if (nameLower === 'elven lineage') {
    const opts = f.options ?? [];
    if (opts.length >= 2) {
      hasOptions = true;
    }
    const sel = data.raceTraitSelections?.[f.name] ?? null;
    const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
    const lineageLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
    const spells = getElvenLineageSpellsForCharacter(f.desc ?? '', opts, sel, data.level);
    if (lineageLabel && ability && spells.length > 0) {
      selectedOptionLabel = `${lineageLabel} (${spells.join(', ')})`;
    } else if (lineageLabel && ability) {
      selectedOptionLabel = lineageLabel;
    } else {
      selectedOptionLabel = null;
    }
  }
  if (nameLower === 'fiendish legacy') {
    const opts = f.options ?? [];
    if (opts.length >= 2) {
      hasOptions = true;
    }
    const sel = data.raceTraitSelections?.[f.name] ?? null;
    const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
    const legacyLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
    const spells = getFiendishLegacySpellsForCharacter(f.desc ?? '', opts, sel, data.level);
    if (legacyLabel && ability && spells.length > 0) {
      selectedOptionLabel = `${legacyLabel} (${spells.join(', ')})`;
    } else if (legacyLabel && ability) {
      selectedOptionLabel = legacyLabel;
    } else {
      selectedOptionLabel = null;
    }
  }
  if (nameLower === 'gnomish lineage') {
    const opts = f.options ?? [];
    if (opts.length >= 2) {
      hasOptions = true;
    }
    const sel = data.raceTraitSelections?.[f.name] ?? null;
    const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
    const lineageLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
    const spells = getGnomishLineageSpellNamesForCharacter(sel, opts);
    if (lineageLabel && ability && spells.length > 0) {
      selectedOptionLabel = `${lineageLabel} (${spells.join(', ')})`;
    } else if (lineageLabel && ability) {
      selectedOptionLabel = lineageLabel;
    } else {
      selectedOptionLabel = null;
    }
  }
  if (nameLower === 'skillful') {
    const opts = f.options ?? [];
    if (opts.length >= 1) {
      hasOptions = true;
      const sel = data.raceTraitSelections?.[f.name] ?? null;
      if (sel && opts.some((o) => o.key === sel)) {
        selectedOptionLabel = opts.find((o) => o.key === sel)?.label ?? 'chosen';
      }
    }
  }
  if (nameLower === 'expertise') {
    hasOptions = true;
    const expertiseFeat = featureDetails.find(
      (fd) => fd.source === 'class' && fd.name.trim().toLowerCase() === 'expertise'
    );
    const gainCount = expertiseFeat?.gainCount ?? 1;
    const maxSelections = gainCount * 2;
    const classExKeys = getClassExpertiseSkillKeys(data);
    if (classExKeys.length >= maxSelections) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'deft explorer') {
    hasOptions = true;
    if (
      data.deftExplorerExpertiseSkillKey &&
      (data.deftExplorerLanguageNames?.length ?? 0) >= 2
    ) {
      selectedOptionLabel = 'chosen';
    }
  }
  if (nameLower === 'scholar') {
    hasOptions = true;
    if (data.scholarExpertiseSkillKey) selectedOptionLabel = 'chosen';
  }
  if (isThievesCantFeatureName(f.name)) {
    hasOptions = true;
    if (String(data.thievesCantExtraLanguageName ?? '').trim()) {
      selectedOptionLabel = 'chosen';
    }
  }
  if (nameLower === 'metamagic') {
    hasOptions = true;
    const metamagicFeat = featureDetails.find(
      (fd) => fd.source === 'class' && fd.name.trim().toLowerCase() === 'metamagic'
    );
    const gainCount = metamagicFeat?.gainCount ?? 1;
    const maxSelections = gainCount * 2;
    const selected = data.metamagicOptionKeys ?? [];
    if (selected.length >= maxSelections) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'eldritch invocations' || nameLower === 'eldritch invocation') {
    const eiFeat = featureDetails.find(
      (fd) =>
        fd.source === 'class' &&
        (fd.name.trim().toLowerCase() === 'eldritch invocations' ||
          fd.name.trim().toLowerCase() === 'eldritch invocation')
    );
    const maxSelections =
      getEldritchInvocationsKnown(eiFeat, data.level) || (eiFeat?.gainCount ?? 0);
    const optionDescByKey = new Map(
      (eiFeat?.options ?? []).map((o) => [o.key, o.desc ?? ''] as const)
    );
    if (maxSelections <= 0) {
      hasOptions = false;
      selectedOptionLabel = null;
    } else {
      hasOptions = true;
      if (
        areEldritchInvocationsFullyChosen(
          data.eldritchInvocationSelections ?? [],
          optionDescByKey,
          maxSelections
        )
      ) {
        selectedOptionLabel = 'chosen';
      }
    }
  }
  if (nameLower === 'ability score improvement') {
    hasOptions = true;
    if (isAbilityScoreImprovementFullyResolved(data)) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'mystic arcanum') {
    hasOptions = true;
    if (isMysticArcanumFullyChosen(data)) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'signature spells') {
    hasOptions = true;
    if (isSignatureSpellsFullyChosen(data)) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'spell mastery') {
    hasOptions = true;
    if (isSpellMasteryFullyChosen(data)) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'epic boon') {
    hasOptions = true;
    if (getEffectiveEpicBoonAbilityScore(data) != null) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'versatile') {
    hasOptions = true;
    if (data.versatileFeatId) selectedOptionLabel = 'chosen';
  }
  if (nameLower === 'fighting style') {
    hasOptions = true;
    const fsMode = data.fightingStyleMode ?? 'OPTION';
    if (fsMode === 'FEAT' && data.fightingStyleFeatId) selectedOptionLabel = 'chosen';
    else if (fsMode === 'OPTION' && data.raceTraitSelections?.['Fighting Style']) {
      // Blessed/Druidic Warrior also requires its cantrips to be chosen before it counts as done.
      const cantripGrant = getFightingStyleCantripGrant(data);
      if (!cantripGrant || (data.fightingStyleCantrips?.length ?? 0) >= cantripGrant.max) {
        selectedOptionLabel = 'chosen';
      }
    }
  }
  if (nameLower === 'weapon mastery' && weaponMasteryMeta.hasWeaponMasteryFeature) {
    hasOptions = true;
    const current = weaponMasteryMeta.currentSelections.length;
    const max = weaponMasteryMeta.maxSelections;
    if (current > 0 && (max === 0 || current >= max)) selectedOptionLabel = 'chosen';
  }

  return { hasOptions, selectedOptionLabel };
}

function normalizeFeatName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectToolProficiencyErrors(data: CharacterFormData): string[] {
  const errors: string[] = [];
  const lines = (data.proficiencies ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    const label = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : line;
    const valueStr = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : '';
    if (!/tool/i.test(label) || !valueStr) continue;
    const segments = dedupeProficiencyLabelsPreserveOrder(
      valueStr
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const segment of segments) {
      const parsed = parseToolProficiencyChoose(segment);
      if (!parsed || parsed.chooseN <= 0) continue;
      const chosen = data.toolProficiencyChoices?.[segment] ?? [];
      if (chosen.length < parsed.chooseN) {
        errors.push(
          `Escolha proficiências em ferramentas: ${parsed.categoryLabel} (${chosen.length}/${parsed.chooseN}).`
        );
      }
    }
  }
  return errors;
}

function collectAdditionalFeatErrors(
  data: CharacterFormData,
  featsList: RuleItemResponse[]
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
    ...(data.fightingStyleFeatId ? [data.fightingStyleFeatId] : []),
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
    const featNameLower = feat.name.trim().toLowerCase();
    if (featNameLower === 'grappler' && !data.grapplerAbilityScore) {
      errors.push('Escolha Força ou Destreza para o talento Grappler.');
    }
    if (isMagicInitiateFeatureName(feat.name) && !isMagicInitiateFullyChosen(data)) {
      errors.push(`Conclua as escolhas em: “${feat.name}”.`);
    }
  }
  return errors;
}

export type CharacterSheetSaveValidationContext = {
  standardLanguageOptions: RuleItemResponse[];
  skillsList: Array<{ key: string; name: string }>;
  feats: RuleItemResponse[];
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
    errors.push('Distribua todos os pontos de atributo do antecedente (Background Ability Bonuses).');
  }

  if (ctx.standardLanguageOptions.length > 0) {
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      ctx.standardLanguageOptions
    );
    if (normalized.length < MAX_STANDARD_LANGUAGES_TOTAL) {
      errors.push(
        `Escolha ${MAX_STANDARD_LANGUAGES_TOTAL} idiomas padrão (incluindo Common quando disponível).`
      );
    }
  }

  const hasClass =
    data.classRuleItemId != null || (data.className ?? '').trim().length > 0;
  if (hasClass && isCharacterBackgroundSelected(data)) {
    const classOptions = data.classSkillOptions ?? { keys: [], chooseN: null };
    const optionKeysRaw =
      classOptions.keys.length > 0 ? classOptions.keys : ctx.skillsList.map((s) => s.key);
    const optionKeys = [...new Set(optionKeysRaw)];
    if (optionKeys.length > 0) {
      const backgroundSkillKeys = data.backgroundSkillKeys ?? [];
      const budgetExemptKeys = getBonusClassSkillBudgetExemptKeys(data);
      const proficientMap = data.skillProficiencies ?? {};
      const chooseN = classOptions.chooseN ?? optionKeys.length;
      const selectedCount = optionKeys.filter(
        (k) =>
          proficientMap[k] && !backgroundSkillKeys.includes(k) && !budgetExemptKeys.includes(k)
      ).length;
      if (selectedCount < chooseN) {
        errors.push('Complete todas as perícias obrigatórias da classe na seção Skills (Class Skills).');
      }
    }
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
      ? (data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]?.text ?? null)
      : null;
  const bgOptText =
    data.backgroundEquipmentSelectedIndex != null
      ? (data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]?.text ?? null)
      : null;
  const { classLines: classEquip, backgroundLines: bgEquip, manualLines: manualEquip } =
    splitEquipmentBySource(data.equipment ?? '', classOptText, bgOptText);
  const hasPlaceholder = (lines: string[], placeholder: string) =>
    lines.some((l) => l.trim().toLowerCase() === placeholder);

  if (hasPlaceholder(classEquip, 'musical instrument of your choice') || hasPlaceholder(manualEquip, 'musical instrument of your choice')) {
    if (!data.toolProficiencyChoices?.['Musical Instrument of your choice']?.length) {
      errors.push('Escolha um instrumento musical no equipamento inicial da classe.');
    }
  }
  if (hasPlaceholder(bgEquip, 'musical instrument of your choice')) {
    if (!data.toolProficiencyChoices?.['Musical Instrument of your choice (Background)']?.length) {
      errors.push('Escolha um instrumento musical no equipamento do antecedente.');
    }
  }

  if (hasPlaceholder(classEquip, 'holy symbol') || hasPlaceholder(manualEquip, 'holy symbol')) {
    if (!data.holySymbolChoiceItemIds?.class) {
      errors.push('Escolha um Holy Symbol no equipamento inicial da classe.');
    }
  }
  if (hasPlaceholder(bgEquip, 'holy symbol')) {
    if (!data.holySymbolChoiceItemIds?.background) {
      errors.push('Escolha um Holy Symbol no equipamento do antecedente.');
    }
  }

  const featureDetails = data.featureDetails ?? [];
  const weaponMasteryMeta = computeWeaponMasteryMetaForSave(data, featureDetails);

  for (const f of featureDetails) {
    const source = (f.source ?? 'class') as string;
    if (source === 'background') continue;
    if (source !== 'class' && source !== 'race') continue;

    const { hasOptions, selectedOptionLabel } = getFeatureChoiceUiState(
      f,
      data,
      featureDetails,
      weaponMasteryMeta
    );
    if (hasOptions && !selectedOptionLabel) {
      errors.push(`Conclua as escolhas em: “${f.name}”.`);
    }
  }

  const spellcastingFeature = findSpellcastingFeatureDetail(featureDetails);
  const spellLevel = Math.max(1, Math.min(20, Math.floor(Number(data.level) || 1)));

  const maxCantrips =
    getMaxCantrips(spellcastingFeature, spellLevel) + getOptionGrantedExtraCantrips(data);
  if (maxCantrips > 0) {
    const picked = countPickedCantrips(data.spellsByLevel);
    if (picked < maxCantrips) {
      errors.push(
        `Escolha os truques (cantrips) da classe na seção Spells (${picked}/${maxCantrips}).`
      );
    }
  }

  const maxPreparedSpells = getMaxPreparedSpells(spellcastingFeature, spellLevel);
  if (maxPreparedSpells > 0) {
    const picked = countPickedLeveledSpells(data.spellsByLevel);
    if (picked < maxPreparedSpells) {
      errors.push(
        `Escolha as magias preparadas da classe na seção Spells (${picked}/${maxPreparedSpells}).`
      );
    }
  }

  const isWizardClass = (data.className ?? '').trim().toLowerCase() === 'wizard';
  if (isWizardClass && spellcastingFeature) {
    const spellbookMax = wizardSpellbookMaxByLevel(spellLevel);
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
    (f) =>
      f.source === 'class' &&
      (f.name.trim().toLowerCase() === 'eldritch invocations' ||
        f.name.trim().toLowerCase() === 'eldritch invocation')
  );
  if (eldritchFeature) {
    const tomeDescByKey = new Map(
      (eldritchFeature.options ?? []).map((o) => [o.key, o.desc ?? ''] as const)
    );
    if (
      isPactOfTomeSelected(data.eldritchInvocationSelections ?? [], tomeDescByKey) &&
      !isPactOfTomeBookComplete(data.pactOfTomeSpellNames)
    ) {
      const cantrips = data.pactOfTomeSpellNames?.cantrips?.length ?? 0;
      const rituals = data.pactOfTomeSpellNames?.rituals?.length ?? 0;
      errors.push(
        `Complete o Livro das Sombras (Book of Shadows) na seção Spells: ${cantrips}/${PACT_OF_TOME_MAX_CANTRIPS} truques e ${rituals}/${PACT_OF_TOME_MAX_RITUALS} magias rituais.`
      );
    }
  }

  errors.push(...collectAdditionalFeatErrors(data, ctx.feats));

  return errors;
}
