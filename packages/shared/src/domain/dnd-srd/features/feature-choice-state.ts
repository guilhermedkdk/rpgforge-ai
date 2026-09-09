/**
 * A feature's choice state, consumed by both the Features & Traits chips and save validation.
 *
 * Data-driven: one entry per feature in FEATURE_CHOICE_RESOLVERS. Kept out of components because the
 * React Compiler OOMs analyzing this branch volume inside a component body.
 *
 * Invariant for any resolver over a finite pool: the requirement is capped at what is still
 * selectable, or a feature whose pool ran dry makes the sheet impossible to save.
 */
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { featureClassLevel } from '../character/class-entries';
import {
  getEffectiveEpicBoonAbilityScore,
  isAbilityScoreImprovementInstanceResolved,
} from '../derivation/ability-progression';
import { countAvailableSpells, spellClassTag } from '../spells/spells';
import { getFightingStyleCantripGrant } from './feature-matchers';
import {
  isEldritchInvocationsFeature,
  isMysticArcanumFeature,
  isThievesCantFeature,
} from './feature-mechanics';
import {
  isMysticArcanumFullyChosen,
  isSignatureSpellsFullyChosen,
  isSpellMasteryFullyChosen,
} from '../character/character-factory';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageSpellNamesForCharacter,
} from '../spells/race-lineage-table-spells';
import {
  countWizardSpellbookSpells,
  getEldritchInvocationsKnown,
} from '../spells/spellcasting-limits';
import {
  BONUS_PROFICIENCIES_SKILL_PICKS,
  MAGICAL_DISCOVERIES_SPELL_LISTS,
  MAGICAL_DISCOVERIES_SPELL_PICKS,
  evocationSavantFreeSpellCount,
} from './subclass-features';
import { areEldritchInvocationsFullyChosen } from './eldritch-invocations';
import { getExpertiseMaxForFeature, getExpertisePicks } from './expertise';
import { getWeaponMasteryMaxForFeature, getWeaponMasteryPicks } from './weapon-mastery';
import { getFightingStylePick } from './fighting-style';

type FeatureDetailItem = NonNullable<CharacterFormData['featureDetails']>[number];

export interface FeatureChoiceState {
  hasOptions: boolean;
  selectedOptionLabel: string | null;
}

/**
 * Pack catalogs that let a "pick N" requirement be capped at what is still selectable. Each is
 * optional: absent → the raw requirement stands, so a missing catalog can only ever be stricter,
 * never wrongly satisfy a feature.
 */
export interface FeatureChoiceCatalogs {
  /** Full spell catalog, for the spell-pick resolvers. */
  allSpells?: RuleItemResponse[];
  /** Full skill catalog, for the skill-pick resolvers whose pool is "any skill". */
  skillsList?: Array<{ key: string }>;
}

interface ResolverCtx extends FeatureChoiceCatalogs {
  f: FeatureDetailItem;
  data: CharacterFormData;
  featureDetails: FeatureDetailItem[];
  /** The generic default state (option cards), for resolvers that only refine extra cases. */
  base: FeatureChoiceState;
}

const EVOCATION_SCHOOL_TAG = 'spell:school:evocation';

// A spell-count requirement is met when the picks reach `required`, OR when the pool can't supply
// that many (nothing left to pick). `available` unknown (no catalog) → keep the raw requirement.
const spellCountMet = (picked: number, required: number, available: number | null): boolean =>
  picked >= (available == null ? required : Math.min(required, available));

// How many of `poolKeys` this character could still pick. Every skill picker disables the skills
// already proficient from another source, so a fully-taken pool has nothing left to choose and must
// not keep the feature pending — same rule as the spell pools above.
const countPickableSkills = (data: CharacterFormData, poolKeys: string[]): number => {
  const proficient = data.skillProficiencies ?? {};
  const fromBackground = data.backgroundSkillKeys ?? [];
  return poolKeys.filter((k) => proficient[k] !== true && !fromBackground.includes(k)).length;
};

interface FeatureChoiceResolver {
  matches: (f: FeatureDetailItem, nameLower: string) => boolean;
  resolve: (ctx: ResolverCtx) => FeatureChoiceState;
}

const nameIs =
  (...names: string[]) =>
  (_f: FeatureDetailItem, nameLower: string): boolean =>
    names.includes(nameLower);

const chosenWhen = (done: boolean): FeatureChoiceState => ({
  hasOptions: true,
  selectedOptionLabel: done ? 'chosen' : null,
});

/** Lineage/legacy: label "Option (spells...)" when both the option and spellcasting ability are chosen. */
const lineageState = (
  ctx: ResolverCtx,
  spellsForCharacter: (
    desc: string,
    opts: Array<{ key: string; label: string }>,
    sel: string | null,
    level: number
  ) => string[]
): FeatureChoiceState => {
  const { f, data } = ctx;
  const opts = f.options ?? [];
  const sel = data.raceTraitSelections?.[f.name] ?? null;
  const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
  const optionLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
  const spells = spellsForCharacter(f.desc ?? '', opts, sel, data.level);
  let selectedOptionLabel: string | null = null;
  if (optionLabel && ability && spells.length > 0) {
    selectedOptionLabel = `${optionLabel} (${spells.join(', ')})`;
  } else if (optionLabel && ability) {
    selectedOptionLabel = optionLabel;
  }
  return { hasOptions: opts.length >= 2, selectedOptionLabel };
};

/** Race trait with a skill choice (Keen Senses: 1 option is enough; Skillful: any skill). */
const skillTraitState = (ctx: ResolverCtx, autoLabelSingleOption: boolean): FeatureChoiceState => {
  const { f, data, base } = ctx;
  const opts = f.options ?? [];
  if (opts.length < 1) return base;
  const sel = data.raceTraitSelections?.[f.name] ?? null;
  let selectedOptionLabel: string | null = null;
  if (sel && opts.some((o) => o.key === sel)) {
    selectedOptionLabel = opts.find((o) => o.key === sel)?.label ?? 'chosen';
  } else if (autoLabelSingleOption && opts.length === 1) {
    selectedOptionLabel = opts[0].label;
  } else if (
    countPickableSkills(
      data,
      opts.map((o) => o.key)
    ) === 0
  ) {
    // Reachable: an Elf Ranger whose 3 class skills are Insight + Perception + Survival owns every
    // Keen Senses option, so the trait has nothing left to grant.
    selectedOptionLabel = 'chosen';
  }
  return { hasOptions: true, selectedOptionLabel };
};

const FEATURE_CHOICE_RESOLVERS: FeatureChoiceResolver[] = [
  {
    matches: nameIs('primal knowledge'),
    resolve: ({ data }) => {
      if (data.primalKnowledgeSkillKey) return chosenWhen(true);
      // Pool = the class skill list (Barbarian's is only 6 entries, so other sources can take it
      // whole). With no list the picker offers every skill, which is never exhausted → stay pending.
      const poolKeys = data.classSkillOptions?.keys ?? [];
      return chosenWhen(poolKeys.length > 0 && countPickableSkills(data, poolKeys) === 0);
    },
  },
  {
    matches: nameIs('keen senses'),
    resolve: (ctx) => skillTraitState(ctx, true),
  },
  {
    matches: nameIs('skillful'),
    resolve: (ctx) => skillTraitState(ctx, false),
  },
  {
    matches: nameIs('elven lineage'),
    resolve: (ctx) => lineageState(ctx, getElvenLineageSpellsForCharacter),
  },
  {
    matches: nameIs('fiendish legacy'),
    resolve: (ctx) => lineageState(ctx, getFiendishLegacySpellsForCharacter),
  },
  {
    matches: nameIs('gnomish lineage'),
    resolve: (ctx) =>
      lineageState(ctx, (_desc, opts, sel) => getGnomishLineageSpellNamesForCharacter(sel, opts)),
  },
  {
    matches: nameIs('expertise'),
    // Per granting class: a Bard 9 / Rogue 6 owes 4 + 4, and each panel fills its own. Reading the
    // character-wide total left both instances pending once the shared list hit either budget.
    resolve: ({ f, data, base }) => {
      if (f.source !== 'class') return base;
      return chosenWhen(getExpertisePicks(data, f).length >= getExpertiseMaxForFeature(f));
    },
  },
  {
    matches: nameIs('deft explorer'),
    resolve: ({ data }) =>
      chosenWhen(
        Boolean(data.deftExplorerExpertiseSkillKey) &&
          (data.deftExplorerLanguageNames?.length ?? 0) >= 2
      ),
  },
  {
    matches: nameIs('scholar'),
    resolve: ({ data }) => chosenWhen(Boolean(data.scholarExpertiseSkillKey)),
  },
  {
    matches: (f) => isThievesCantFeature(f),
    resolve: ({ data }) =>
      chosenWhen(Boolean(String(data.thievesCantExtraLanguageName ?? '').trim())),
  },
  {
    matches: nameIs('metamagic'),
    resolve: ({ data, featureDetails }) => {
      const metamagicFeat = featureDetails.find(
        (fd) => fd.source === 'class' && fd.name.trim().toLowerCase() === 'metamagic'
      );
      const maxSelections = (metamagicFeat?.gainCount ?? 1) * 2;
      return chosenWhen((data.metamagicOptionKeys ?? []).length >= maxSelections);
    },
  },
  {
    matches: (f) => isEldritchInvocationsFeature(f),
    resolve: ({ data, featureDetails }) => {
      const eiFeat = featureDetails.find(
        (fd) => fd.source === 'class' && isEldritchInvocationsFeature(fd)
      );
      // Read at the WARLOCK's level: a Fighter 3 / Warlock 2 knows 2 invocations, not the 5 the
      // character level would give.
      const maxKnown =
        getEldritchInvocationsKnown(eiFeat, featureClassLevel(data, eiFeat)) ||
        (eiFeat?.gainCount ?? 0);
      if (maxKnown <= 0) return { hasOptions: false, selectedOptionLabel: null };
      const optionDescByKey = new Map(
        (eiFeat?.options ?? []).map((o) => [o.key, o.desc ?? ''] as const)
      );
      return chosenWhen(
        areEldritchInvocationsFullyChosen(
          data.eldritchInvocationSelections ?? [],
          optionDescByKey,
          maxKnown
        )
      );
    },
  },
  {
    matches: nameIs('ability score improvement'),
    // Each class's own gains: its chip must not read as done because another class filled its slot.
    resolve: ({ f, data }) => chosenWhen(isAbilityScoreImprovementInstanceResolved(data, f)),
  },
  {
    matches: (f) => isMysticArcanumFeature(f),
    resolve: ({ data, allSpells }) => {
      if (isMysticArcanumFullyChosen(data)) return chosenWhen(true);
      // Satisfiable when the class has no Arcanum-level spells (6+) to pick at all.
      const className = (data.className ?? '').trim();
      const available =
        allSpells && className
          ? countAvailableSpells(allSpells, [spellClassTag(className)], 6, 9)
          : null;
      return chosenWhen(available === 0);
    },
  },
  {
    matches: nameIs('signature spells'),
    resolve: ({ data, allSpells }) =>
      chosenWhen(
        isSignatureSpellsFullyChosen(data) ||
          (allSpells != null && countWizardSpellbookSpells(data.wizardSpellbookByLevel) < 2)
      ),
  },
  {
    matches: nameIs('spell mastery'),
    resolve: ({ data, allSpells }) =>
      chosenWhen(
        isSpellMasteryFullyChosen(data) ||
          (allSpells != null && countWizardSpellbookSpells(data.wizardSpellbookByLevel) < 2)
      ),
  },
  {
    matches: nameIs('epic boon'),
    resolve: ({ data }) => chosenWhen(getEffectiveEpicBoonAbilityScore(data) != null),
  },
  {
    matches: nameIs('versatile'),
    resolve: ({ data }) => chosenWhen(Boolean(data.versatileFeatId)),
  },
  {
    matches: nameIs('fighting style'),
    resolve: ({ f, data }) => {
      // Per granting class: the Fighter's pick must not mark the Paladin's as done.
      const pick = getFightingStylePick(data, f);
      if (pick.mode === 'FEAT') return chosenWhen(Boolean(pick.featId));
      if (!pick.optionKey) return chosenWhen(false);
      // Blessed/Druidic Warrior also requires the chosen cantrips before counting as complete.
      const cantripGrant = getFightingStyleCantripGrant(data, f);
      return chosenWhen(!cantripGrant || pick.cantrips.length >= cantripGrant.max);
    },
  },
  {
    matches: nameIs('weapon mastery'),
    // Per granting class: the Paladin's 2 and the Fighter's 5 are two separate choices, each with
    // its own list. Reading the character-wide total marked both done as soon as one was filled.
    resolve: ({ f, data, base }) => {
      if (f.source !== 'class') return base;
      const max = getWeaponMasteryMaxForFeature(data, f);
      const current = getWeaponMasteryPicks(data, f).length;
      return chosenWhen(current > 0 && (max === 0 || current >= max));
    },
  },
  {
    matches: (f, nameLower) => nameLower === 'bonus proficiencies' && f.source === 'subclass',
    resolve: ({ data, skillsList }) => {
      const picked = (data.bonusProficienciesSkillKeys ?? []).length;
      // Skills proficient from another source are locked in the picker, so the 3 picks are capped at
      // what is left (its own picks are proficient too, hence added back).
      const required = skillsList
        ? Math.min(
            BONUS_PROFICIENCIES_SKILL_PICKS,
            picked +
              countPickableSkills(
                data,
                skillsList.map((s) => s.key)
              )
          )
        : BONUS_PROFICIENCIES_SKILL_PICKS;
      return chosenWhen(picked >= required);
    },
  },
  {
    matches: nameIs('additional fighting style'),
    resolve: ({ data }) => chosenWhen(Boolean(data.additionalFightingStyleFeatId)),
  },
  {
    matches: nameIs('magical discoveries'),
    resolve: ({ data, allSpells }) => {
      const picked = (data.magicalDiscoveriesSpellNames ?? []).filter(
        (n) => n != null && String(n).trim().length > 0
      ).length;
      const available = allSpells
        ? countAvailableSpells(allSpells, MAGICAL_DISCOVERIES_SPELL_LISTS.map(spellClassTag), 0, 9)
        : null;
      return chosenWhen(spellCountMet(picked, MAGICAL_DISCOVERIES_SPELL_PICKS, available));
    },
  },
  {
    matches: nameIs('evocation savant'),
    resolve: ({ f, data, allSpells }) => {
      const byLevel = data.evocationSavantSpellbookByLevel ?? {};
      let picked = 0;
      for (let lvl = 1; lvl <= 9; lvl++) {
        picked += (byLevel[lvl] ?? []).filter((n) => String(n ?? '').trim().length > 0).length;
      }
      // The free spells come from the WIZARD's progression, not the character's total level.
      const required = evocationSavantFreeSpellCount(featureClassLevel(data, f));
      // Pool = Wizard spells of the Evocation school (needs both tags → count inline).
      const available = allSpells
        ? allSpells.filter(
            (s) =>
              s.tagKeys.includes(spellClassTag('Wizard')) &&
              s.tagKeys.includes(EVOCATION_SCHOOL_TAG)
          ).length
        : null;
      return chosenWhen(spellCountMet(picked, required, available));
    },
  },
];

export function getFeatureChoiceState(
  f: FeatureDetailItem,
  data: CharacterFormData,
  featureDetails: FeatureDetailItem[],
  catalogs?: FeatureChoiceCatalogs
): FeatureChoiceState {
  const nameLower = f.name.trim().toLowerCase();

  // Generic default: option cards (2+ options) with the selection in raceTraitSelections; the
  // "Improved" variants read the base feature's choice (Blessed Strikes / Elemental Fury).
  const base: FeatureChoiceState = {
    hasOptions: !!(f.options && f.options.length >= 2),
    selectedOptionLabel: null,
  };
  if (base.hasOptions && f.options) {
    const baseFeatureName =
      nameLower === 'improved blessed strikes'
        ? 'Blessed Strikes'
        : nameLower === 'improved elemental fury'
          ? 'Elemental Fury'
          : f.name;
    const selectedKey = data.raceTraitSelections?.[baseFeatureName] ?? null;
    if (selectedKey) {
      base.selectedOptionLabel = f.options.find((o) => o.key === selectedKey)?.label ?? 'chosen';
    }
  }

  const resolver = FEATURE_CHOICE_RESOLVERS.find((r) => r.matches(f, nameLower));
  return resolver ? resolver.resolve({ f, data, featureDetails, base, ...catalogs }) : base;
}
