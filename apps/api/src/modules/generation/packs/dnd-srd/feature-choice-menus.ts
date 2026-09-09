import {
  ABILITY_SCORE_CAP_FROM_ASI,
  DND_ABILITY_NAMES,
  buildMiFdKey,
  featureChoiceKey,
  parseFeatureChoiceKey,
  invocationRequiresCantrip,
  invocationRequiresOriginFeat,
  extractAdvancedClassChoices,
  extractRaceChoiceOptions,
  type AdvancedClassChoices,
  type ClassFeatureChoice,
  type RaceChoiceOptions,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';

/**
 * Generic AI choice menus for every remaining feature selection (feats, lineages, Expertise,
 * Metamagic, Invocations, ASI, Magic Initiate, …). Each menu is presented to the loadout LLM as
 * `{ id, prompt, options, pick }`; its `apply` writes the validated picks into the persisted
 * `featureChoices` grouped shape (shared `character/feature-choices.ts` reads it back).
 */

export interface AiMenu {
  id: string;
  prompt: string;
  options: string[];
  pick: number;
  /** ASI gains may repeat an ability token (+2). Everything else dedupes. */
  allowDuplicates?: boolean;
  apply: (selections: string[], ctx: MenuApplyContext) => void;
}

export interface MenuApplyContext {
  fc: Record<string, Record<string, unknown>>;
  /** Validated selections of another menu (for conditional menus). */
  selected: (menuId: string) => string[];
  /** Final proficient skill keys (background fixed + chosen class skills). */
  finalSkills: string[];
  /** Language names the character already knows (Common + chosen standard languages). */
  knownLanguages: string[];
  /** Cantrip names the character picked for its own class list. */
  chosenCantripNames: string[];
  /** Base scores INCLUDING the background increase, for the ASI cap of 20. */
  baseAttributes: Record<string, number>;
}

/**
 * One class's menu inputs, read at ITS OWN level.
 *
 * Multiclassing makes every class-scoped feature per class: a Paladin 3 / Warlock 3 owes the
 * Paladin's Fighting Style AND the Warlock's Eldritch Invocations, and the invocation level
 * prerequisites are checked against the WARLOCK level, not the character's.
 */
export interface ClassMenuInput {
  classRuleItemId: string;
  className: string;
  level: number;
  /** Single-choice class features (Fighting Style, Divine Order, …). */
  classSingles: ClassFeatureChoice[];
  advanced: AdvancedClassChoices;
  /** This class's full spell pool (uncapped) — Mystic Arcanum / Signature / Mastery pull from here. */
  classSpellsByLevel: Map<number, string[]>;
  /** This class's skill-choice pool (keys); empty = any skill. */
  classSkillPoolKeys: string[];
}

export interface MenuBuildInput {
  /** TOTAL character level: race, background and the ASI/Epic Boon menus are character-scoped. */
  level: number;
  /** Every class the character has, in sheet order (index 0 = initial). */
  classes: ClassMenuInput[];
  backgroundFixedSkillKeys: string[];
  allSkillKeys: string[];
  /** Standard language names, excluding Common. */
  standardLanguageNames: string[];
  /** Base (non-magic) weapons: display names + id lookup. */
  weaponNames: string[];
  weaponIdByName: Map<string, string>;
  featsByType: {
    origin: RuleItemResponse[];
    general: RuleItemResponse[];
    epicBoon: RuleItemResponse[];
    fightingStyle: RuleItemResponse[];
  };
  featIdByName: Map<string, string>;
  race: RaceChoiceOptions;
  /** Background-granted feat names (e.g. "Magic Initiate (Cleric)"). */
  backgroundFeatNames: string[];
  /** Cantrip + level-1 spell names per Magic Initiate list (fetched on demand by the service). */
  spellListPools: Map<string, { cantrips: string[]; level1: string[] }>;
  /** All cantrip names in the pack (Pact of the Tome). */
  allCantripNames: string[];
  /** Level-1 ritual spell names (Pact of the Tome). */
  level1RitualNames: string[];
  /** Ability with the highest base score (ASI top-up default). */
  primaryAbility: string;
  /**
   * The classes' primary abilities from the pack, best-scoring first. Every ASI point goes here
   * until they hit 20: a level-20 sheet whose key ability stopped at 18 is a worse character than
   * anything the spread could buy, and the model cannot see the running total across gains.
   */
  keyAbilities: string[];
}

const ABILITIES: string[] = [...DND_ABILITY_NAMES];
const CASTING_ABILITIES = ['Intelligence', 'Wisdom', 'Charisma'];
/** The three lists Magic Initiate offers ("cantrips from the Cleric, Druid, or Wizard spell list"). */
export const MAGIC_INITIATE_SPELL_LISTS = ['Cleric', 'Druid', 'Wizard'];
// Only breaks a tie between equal scores: the ability is chosen from the character's own numbers.
const MI_TIEBREAK_ABILITY: Record<string, string> = {
  Cleric: 'Wisdom',
  Druid: 'Wisdom',
  Wizard: 'Intelligence',
};
const PACT_OF_TOME_KEY = 'pact-of-the-tome';
const FIGHTING_STYLE_FEATURE = 'Fighting Style';
const EXPERTISE_FEATURE = 'Expertise';

/**
 * The Fighting Style feat ids the OTHER classes already hold.
 *
 * Each menu is answered blind to the others, so both classes of a Fighter/Paladin picked the same
 * feat; a feat cannot be taken twice, so the second class moves to the next one that is free.
 */
function pickFreeFightingStyleFeat(
  wanted: string,
  input: MenuBuildInput,
  fc: Record<string, Record<string, unknown>>,
  ownKey: string
): string {
  const taken = fightingStyleFeatIdsTaken(fc, ownKey);
  if (!taken.has(wanted)) return wanted;
  return input.featsByType.fightingStyle.find((f) => !taken.has(f.id))?.id ?? wanted;
}

function fightingStyleFeatIdsTaken(
  fc: Record<string, Record<string, unknown>>,
  ownKey: string
): Set<string> {
  const taken = new Set<string>();
  for (const [key, entry] of Object.entries(fc)) {
    if (key === ownKey) continue;
    if (parseFeatureChoiceKey(key).featureName !== FIGHTING_STYLE_FEATURE) continue;
    const id = entry?.featId;
    if (typeof id === 'string' && id) taken.add(id);
  }
  return taken;
}

export const dedupe = <T>(arr: T[]): T[] => [...new Set(arr)];

const lockedMiList = (featName: string): string => {
  const m = featName.match(/\(([^)]+)\)/);
  const v = (m?.[1] ?? '').trim();
  const canonical = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
  return MAGIC_INITIATE_SPELL_LISTS.includes(canonical) ? canonical : 'Wizard';
};

/** The first skill the character is not already proficient in; null when they all are. */
function firstUnusedSkill(candidates: string[], ctx: MenuApplyContext): string | null {
  return candidates.find((k) => !ctx.finalSkills.includes(k)) ?? null;
}

/**
 * Where an ASI point can still go, counting the base score plus everything the earlier gains already
 * spent.
 *
 * Needed for BOTH directions: a gain the model left blank, and a gain whose pick would break the cap
 * of 20, where the clamp drops the points and the gain then reads as unmade on an unsaveable
 * sheet.
 */
function abilityPointRouter(
  byGain: unknown[],
  ctx: MenuApplyContext,
  primaryAbility: string,
  keyAbilities: string[] = []
) {
  const spent: Record<string, number> = {};
  for (const gain of byGain) {
    const entry = gain as { kind?: string; byAbility?: Record<string, number> } | null;
    if (entry?.kind !== 'increase_scores') continue;
    for (const [ability, amount] of Object.entries(entry.byAbility ?? {})) {
      spent[ability] = (spent[ability] ?? 0) + amount;
    }
  }
  // The Grappler feat adds +1 to the ability it names, and it is picked in an ASI gain like any
  // other feat. Left out of the total, a later point overshot the cap of 20 by exactly that +1 and
  // the derivation's clamp then dropped it, leaving the gain reading as unmade ("falta 1 escolha").
  const grapplerAbility = (ctx.fc['Grappler']?.abilityScore as string | undefined) ?? null;
  const total = (ability: string) =>
    (ctx.baseAttributes[ability] ?? 10) +
    (spent[ability] ?? 0) +
    (grapplerAbility === ability ? 1 : 0);
  const hasRoom = (ability: string) => total(ability) < ABILITY_SCORE_CAP_FROM_ASI;
  return {
    hasRoom,
    total,
    /** The highest ability still under the cap; the primary when everything is maxed. */
    next: () => ABILITIES.filter(hasRoom).sort((a, b) => total(b) - total(a))[0] ?? primaryAbility,
    /**
     * Where ONE point buys the most: a key ability under 20, then an ODD score (where one point is a
     * whole modifier), then the model's own pick, then anything with room. `isLastPoint` flips the
     * first two, since a lone point on an even score buys no modifier at all.
     */
    bestFor: (preferred: string | undefined, isLastPoint = false) => {
      const key = keyAbilities.find(hasRoom);
      const odd = [preferred, ...keyAbilities, ...ABILITIES]
        .filter((a): a is string => !!a && hasRoom(a) && total(a) % 2 === 1)
        .sort((a, b) => total(b) - total(a))[0];
      if (isLastPoint && odd) return odd;
      if (key) return key;
      if (odd) return odd;
      if (preferred && hasRoom(preferred)) return preferred;
      return ABILITIES.filter(hasRoom).sort((a, b) => total(b) - total(a))[0] ?? primaryAbility;
    },
    take: (ability: string) => {
      spent[ability] = (spent[ability] ?? 0) + 1;
    },
  };
}

/** One ability's score after the ASI gains and the Grappler +1 recorded in `fc`. */
function abilityTotal(
  fc: Record<string, Record<string, unknown>>,
  baseAttributes: Record<string, number>,
  ability: string
): number {
  const byGain = fc['Ability Score Improvement']?.byGain as
    | Array<{ kind?: string; byAbility?: Record<string, number> } | null>
    | undefined;
  const spent = Array.isArray(byGain)
    ? byGain.reduce(
        (sum, gain) =>
          gain?.kind === 'increase_scores' ? sum + (gain.byAbility?.[ability] ?? 0) : sum,
        0
      )
    : 0;
  const grappler = (fc['Grappler']?.abilityScore as string | undefined) === ability ? 1 : 0;
  return (baseAttributes[ability] ?? 10) + spent + grappler;
}

/**
 * Final pass over the Ability Score Improvement points, once every menu has been applied.
 *
 * Some ability bonuses are decided later (a feat arriving through a background), and a point that
 * ends up over 20 is dropped by the derivation's clamp, leaving the gain reading as unmade on a
 * sheet the player cannot fix. Totals are final here, so overflow is trimmed and short gains refill.
 */
function rebalanceAbilityScoreImprovements(
  fc: Record<string, Record<string, unknown>>,
  baseAttributes: Record<string, number>
): void {
  const byGain = fc['Ability Score Improvement']?.byGain as
    | Array<{ kind?: string; byAbility?: Record<string, number> } | null>
    | undefined;
  if (!Array.isArray(byGain)) return;
  const total = (ability: string) => abilityTotal(fc, baseAttributes, ability);

  // 1. Give back whatever exceeds the cap, from the last gain that spent on that ability.
  for (const ability of ABILITIES) {
    while (total(ability) > ABILITY_SCORE_CAP_FROM_ASI) {
      const gain = [...byGain]
        .reverse()
        .find((g) => g?.kind === 'increase_scores' && (g.byAbility?.[ability] ?? 0) > 0);
      if (!gain?.byAbility) break;
      gain.byAbility[ability] -= 1;
      if (gain.byAbility[ability] <= 0) delete gain.byAbility[ability];
    }
  }

  // 2. Top every increase back to its 2 points: an odd score first (a whole modifier for one point),
  //    then the highest ability that still has room.
  for (const gain of byGain) {
    if (gain?.kind !== 'increase_scores') continue;
    gain.byAbility ??= {};
    let sum = Object.values(gain.byAbility).reduce((a, b) => a + b, 0);
    while (sum < 2) {
      const withRoom = ABILITIES.filter(
        (a) => total(a) < ABILITY_SCORE_CAP_FROM_ASI && (gain.byAbility?.[a] ?? 0) < 2
      );
      if (withRoom.length === 0) break;
      const odd = withRoom.filter((a) => total(a) % 2 === 1).sort((a, b) => total(b) - total(a))[0];
      const target = odd ?? withRoom.sort((a, b) => total(b) - total(a))[0];
      gain.byAbility[target] = (gain.byAbility[target] ?? 0) + 1;
      sum += 1;
    }
  }
}

/**
 * Picks every Magic Initiate's spellcasting ability from the character's own scores: that ability
 * sets the DC and attack bonus of those spells. Hardcoding it per list meant Charisma was never
 * chosen. Runs after `rebalanceAbilityScoreImprovements`; ties keep the list's traditional ability.
 */
function assignMagicInitiateAbilities(
  fc: Record<string, Record<string, unknown>>,
  baseAttributes: Record<string, number>
): void {
  const bySource = fc['Magic Initiate']?.bySource as Record<string, unknown> | undefined;
  if (!bySource) return;
  for (const value of Object.values(bySource)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as { spellList?: unknown; spellcastingAbility?: string };
    const list = typeof entry.spellList === 'string' ? entry.spellList : '';
    let best = MI_TIEBREAK_ABILITY[list] ?? 'Intelligence';
    for (const ability of CASTING_ABILITIES) {
      if (abilityTotal(fc, baseAttributes, ability) > abilityTotal(fc, baseAttributes, best)) {
        best = ability;
      }
    }
    entry.spellcastingAbility = best;
  }
}

/** Level-N prerequisite ("Level 5+ Warlock") parsed from an invocation's prerequisite text. */
const prereqLevel = (prerequisite: string | undefined): number => {
  const m = (prerequisite ?? '').match(/level\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
};

/**
 * Adds Magic Initiate menus for one gain (background feat / Versatile) under `sourceKey`.
 *
 * `lists` is the SRD choice: the feat learns its cantrips "from the Cleric, Druid, or Wizard spell
 * list", so a free gain (Versatile) offers all three and the model picks one. A background LOCKS it
 * instead ("Magic Initiate (Cleric)" on the Acolyte), so it passes a single list and no list menu is
 * built. The spell menus offer every list's options, since the pick menus are answered in the same
 * call as the list one; `write` then keeps only what belongs to the chosen list and tops up from it.
 */
function pushMagicInitiateMenus(
  menus: AiMenu[],
  idPrefix: string,
  sourceKey: string,
  lists: string[],
  input: MenuBuildInput,
  condition?: (ctx: MenuApplyContext) => boolean
): void {
  const pools = lists
    .map((list) => ({ list, pool: input.spellListPools.get(list) }))
    .filter((e): e is { list: string; pool: { cantrips: string[]; level1: string[] } } =>
      Boolean(e.pool && (e.pool.cantrips.length > 0 || e.pool.level1.length > 0))
    );
  if (pools.length === 0) return;
  const listNames = pools.map((e) => e.list);
  const label = listNames.join('/');
  const allCantrips = dedupe(pools.flatMap((e) => e.pool.cantrips));
  const allLevel1 = dedupe(pools.flatMap((e) => e.pool.level1));

  // Keeps the picks that belong to the chosen list, then tops up deterministically from it.
  const fromChosenList = (picks: string[], pool: string[], count: number): string[] => {
    const out = picks.filter((p) => pool.includes(p)).slice(0, count);
    for (const name of pool) {
      if (out.length >= count) break;
      if (!out.includes(name)) out.push(name);
    }
    return out;
  };

  const write = (ctx: MenuApplyContext) => {
    const chosen =
      listNames.length === 1 ? listNames[0] : (ctx.selected(`${idPrefix}-list`)[0] ?? listNames[0]);
    const { list: spellList, pool } = pools.find((e) => e.list === chosen) ?? pools[0];
    const bySource =
      (ctx.fc['Magic Initiate']?.bySource as Record<string, unknown> | undefined) ?? {};
    bySource[sourceKey] = {
      spellList,
      cantripNames: fromChosenList(ctx.selected(`${idPrefix}-cantrips`), pool.cantrips, 2),
      spellName: fromChosenList(ctx.selected(`${idPrefix}-spell`), pool.level1, 1)[0] ?? null,
      // Replaced by `assignMagicInitiateAbilities` once every menu has run and the scores are final.
      spellcastingAbility: MI_TIEBREAK_ABILITY[spellList] ?? 'Intelligence',
    };
    (ctx.fc['Magic Initiate'] ??= {}).bySource = bySource;
  };

  if (listNames.length > 1) {
    menus.push({
      id: `${idPrefix}-list`,
      prompt: `Magic Initiate: pick the spell list this feat draws from (${label}). Your cantrips and level-1 spell must all come from it.`,
      options: listNames,
      pick: 1,
      apply: () => {
        // written together with the cantrips menu
      },
    });
  }
  menus.push({
    id: `${idPrefix}-cantrips`,
    prompt: `Magic Initiate (${label}): pick 2 cantrips from the spell list you chose`,
    options: allCantrips,
    pick: 2,
    apply: (sel, ctx) => {
      if (condition && !condition(ctx)) return;
      write(ctx);
    },
  });
  menus.push({
    id: `${idPrefix}-spell`,
    prompt: `Magic Initiate (${label}): pick 1 level-1 spell from the spell list you chose`,
    options: allLevel1,
    pick: 1,
    apply: () => {
      // written together with the cantrips menu
    },
  });
}

/**
 * Menus for ONE class, read at its own level.
 *
 * `scope` namespaces the ids so two classes offering the same feature (Fighting Style) do not
 * collapse into one menu; a single class passes an empty scope and keeps the pre-multiclass ids.
 * `namespaceFightingStyle` does the same for the persisted key, which the last class used to
 * overwrite.
 */
function buildClassMenus(
  cls: ClassMenuInput,
  input: MenuBuildInput,
  scope: string,
  namespaceFightingStyle = false,
  namespaceExpertise = false
): AiMenu[] {
  const menus: AiMenu[] = [];
  const { advanced, classSingles, classSpellsByLevel, classSkillPoolKeys } = cls;
  const mid = (id: string) => `${scope}${id}`;
  const fightingStyleKey = () =>
    featureChoiceKey(FIGHTING_STYLE_FEATURE, namespaceFightingStyle ? cls.classRuleItemId : null);

  // --- Single-choice class features (Fighting Style, Divine Order, Primal Order, …) ---
  for (const single of classSingles) {
    if (single.options.length === 0) continue;
    const id = mid(`feature:${single.feature.toLowerCase().replace(/\s+/g, '-')}`);
    const isFightingStyle =
      single.feature.trim().toLowerCase() === FIGHTING_STYLE_FEATURE.toLowerCase();
    // The Paladin and the Ranger may take their own option (Blessed/Druidic Warrior) OR any Fighting
    // Style feat; offering only the option meant the alternative was never even considered.
    const featNames = isFightingStyle ? input.featsByType.fightingStyle.map((f) => f.name) : [];
    // Blessed/Druidic Warrior grant 2 cantrips from the Cleric/Druid list.
    const grantList = single.options.some((o) => o.key === 'blessed-warrior')
      ? 'Cleric'
      : single.options.some((o) => o.key === 'druidic-warrior')
        ? 'Druid'
        : null;
    const grantOptionLabel = grantList
      ? (single.options.find(
          (o) => o.key === (grantList === 'Cleric' ? 'blessed-warrior' : 'druidic-warrior')
        )?.label ?? '')
      : '';
    menus.push({
      id,
      prompt: isFightingStyle
        ? `Fighting Style (${cls.className}): pick ONE, either a Fighting Style feat or the class's ` +
          `own option${grantList ? ` "${grantOptionLabel}", which grants 2 ${grantList} cantrips instead of a combat feat` : ''}` +
          `. Pick the option when the concept wants magic over weapon technique.`
        : `Class feature "${single.feature}": pick one option`,
      // Fighting Style shows the option by its LABEL ("Blessed Warrior") next to the feat names: a
      // slug among readable names reads like noise and the model skipped it every time.
      options: isFightingStyle
        ? [...single.options.map((o) => o.label), ...featNames]
        : single.options.map((o) => o.key),
      pick: 1,
      apply: (sel, ctx) => {
        if (!sel[0]) return;
        if (!isFightingStyle) {
          (ctx.fc[single.feature] ??= {}).option = sel[0];
          return;
        }
        const key = fightingStyleKey();
        const answer = sel[0].trim().toLowerCase();
        const option = single.options.find(
          (o) => o.label.trim().toLowerCase() === answer || o.key.toLowerCase() === answer
        );
        const entry = (ctx.fc[key] ??= {});
        if (!option) {
          const featId = input.featIdByName.get(answer);
          if (!featId) return;
          entry.featId = pickFreeFightingStyleFeat(featId, input, ctx.fc, key);
          entry.mode = 'FEAT';
          return;
        }
        entry.option = option.key;
        entry.mode = 'OPTION';
      },
    });
    const grantKey = grantList === 'Cleric' ? 'blessed-warrior' : 'druidic-warrior';
    const grantPool = grantList ? (input.spellListPools.get(grantList)?.cantrips ?? []) : [];
    if (grantList && grantPool.length > 0) {
      menus.push({
        id: `${id}-cantrips`,
        prompt: `Only used if you picked "${grantKey}" for ${single.feature}: pick 2 ${grantList} cantrips`,
        options: grantPool,
        pick: 2,
        apply: (sel, ctx) => {
          // The answer may be the option's label or its key; both mean the same pick.
          const answer = (ctx.selected(id)[0] ?? '').trim().toLowerCase();
          const chosen = single.options.find(
            (o) => o.label.trim().toLowerCase() === answer || o.key.toLowerCase() === answer
          );
          if (chosen?.key !== grantKey) return;
          (ctx.fc[fightingStyleKey()] ??= {}).cantrips = sel.slice(0, 2);
        },
      });
    }
  }

  // --- Fighting Style as a feat (Fighter-style classes: no inline options, pick a feat) ---
  const hasInlineFightingStyle = classSingles.some(
    (s) => s.feature.trim().toLowerCase() === 'fighting style'
  );
  if (
    advanced.hasFightingStyle &&
    !hasInlineFightingStyle &&
    input.featsByType.fightingStyle.length > 0
  ) {
    menus.push({
      id: mid('fighting-style-feat'),
      prompt: 'Fighting Style: pick 1 Fighting Style feat',
      options: input.featsByType.fightingStyle.map((f) => f.name),
      pick: 1,
      apply: (sel, ctx) => {
        const featId = sel[0] ? input.featIdByName.get(sel[0].toLowerCase()) : null;
        if (featId) {
          const key = fightingStyleKey();
          const entry = (ctx.fc[key] ??= {});
          entry.featId = pickFreeFightingStyleFeat(featId, input, ctx.fc, key);
          entry.mode = 'FEAT';
        }
      },
    });
  }

  // --- Expertise (must be among the character's proficient skills), PER granting class ---
  // Bard 9 + Rogue 6 owe 4 + 4 and the sheet keeps one list per class. Written under the bare name
  // the second class overwrote the first, so the draft carried 4 of the 8 and BOTH panels stayed
  // pending, which is what made the sheet unsaveable.
  if (advanced.expertiseCount > 0) {
    const pool = dedupe([...input.backgroundFixedSkillKeys, ...classSkillPoolKeys]);
    menus.push({
      id: mid('expertise'),
      prompt: `Expertise (${cls.className}): pick ${advanced.expertiseCount} skills you are proficient in (must match your chosen class/background skills)`,
      options: pool.length ? pool : input.allSkillKeys,
      pick: advanced.expertiseCount,
      apply: (sel, ctx) => {
        const key = featureChoiceKey(
          EXPERTISE_FEATURE,
          namespaceExpertise ? cls.classRuleItemId : null
        );
        // Doubling the same skill twice buys nothing, so a class only keeps what the others left.
        const taken = new Set(
          Object.entries(ctx.fc)
            .filter(
              ([k]) => k !== key && parseFeatureChoiceKey(k).featureName === EXPERTISE_FEATURE
            )
            .flatMap(([, entry]) => (entry?.skillKeys as string[] | undefined) ?? [])
        );
        const valid = sel.filter((k) => ctx.finalSkills.includes(k) && !taken.has(k));
        const topped = dedupe([
          ...valid,
          ...ctx.finalSkills.filter((k) => !valid.includes(k) && !taken.has(k)),
        ]).slice(0, advanced.expertiseCount);
        if (topped.length) (ctx.fc[key] ??= {}).skillKeys = topped;
      },
    });
  }

  // --- Primal Knowledge (one more skill from the class list) ---
  if (advanced.hasPrimalKnowledge && classSkillPoolKeys.length > 0) {
    menus.push({
      id: mid('primal-knowledge'),
      prompt: 'Primal Knowledge: pick 1 more skill from your class skill list',
      options: classSkillPoolKeys,
      pick: 1,
      apply: (sel, ctx) => {
        const pick = sel.find((k) => !ctx.finalSkills.includes(k)) ?? sel[0];
        if (pick) (ctx.fc['Primal Knowledge'] ??= {}).skillKey = pick;
      },
    });
  }

  // --- Scholar (expertise in one listed skill you are proficient in) ---
  if (advanced.scholarSkillKeys.length > 0) {
    menus.push({
      id: mid('scholar'),
      prompt: 'Scholar: pick 1 listed skill (you must be proficient in it) to gain Expertise',
      options: advanced.scholarSkillKeys,
      pick: 1,
      apply: (sel, ctx) => {
        const pick =
          sel.find((k) => ctx.finalSkills.includes(k)) ??
          advanced.scholarSkillKeys.find((k) => ctx.finalSkills.includes(k)) ??
          null;
        if (pick) (ctx.fc['Scholar'] ??= {}).expertiseSkillKey = pick;
      },
    });
  }

  // --- Deft Explorer (expertise + 2 languages) ---
  if (advanced.hasDeftExplorer) {
    const pool = dedupe([...input.backgroundFixedSkillKeys, ...classSkillPoolKeys]);
    menus.push({
      id: mid('deft-explorer-skill'),
      prompt: 'Deft Explorer: pick 1 skill you are proficient in for Expertise',
      options: pool.length ? pool : input.allSkillKeys,
      pick: 1,
      apply: (sel, ctx) => {
        const expertise = (ctx.fc['Expertise']?.skillKeys as string[] | undefined) ?? [];
        const pick =
          sel.find((k) => ctx.finalSkills.includes(k) && !expertise.includes(k)) ??
          ctx.finalSkills.find((k) => !expertise.includes(k)) ??
          null;
        if (pick) (ctx.fc['Deft Explorer'] ??= {}).expertiseSkillKey = pick;
      },
    });
    menus.push({
      id: mid('deft-explorer-languages'),
      prompt: 'Deft Explorer: pick 2 languages you do not know yet',
      options: input.standardLanguageNames,
      pick: 2,
      apply: (sel, ctx) => {
        const known = new Set(ctx.knownLanguages.map((n) => n.toLowerCase()));
        const picks = dedupe([
          ...sel.filter((n) => !known.has(n.toLowerCase())),
          ...input.standardLanguageNames.filter((n) => !known.has(n.toLowerCase())),
        ]).slice(0, 2);
        if (picks.length) (ctx.fc['Deft Explorer'] ??= {}).languageNames = picks;
      },
    });
  }

  // --- Thieves' Cant (1 extra language) ---
  if (advanced.hasThievesCant) {
    menus.push({
      id: mid('thieves-cant-language'),
      prompt: "Thieves' Cant: pick 1 extra language you do not know yet",
      options: input.standardLanguageNames,
      pick: 1,
      apply: (sel, ctx) => {
        const known = new Set(ctx.knownLanguages.map((n) => n.toLowerCase()));
        const pick =
          sel.find((n) => !known.has(n.toLowerCase())) ??
          input.standardLanguageNames.find((n) => !known.has(n.toLowerCase())) ??
          null;
        if (pick) (ctx.fc["Thieves' Cant"] ??= {}).extraLanguageName = pick;
      },
    });
  }

  // --- Metamagic ---
  if (advanced.metamagic) {
    const { options, count } = advanced.metamagic;
    menus.push({
      id: mid('metamagic'),
      prompt: `Metamagic: pick ${count} options`,
      options: options.map((o) => o.key),
      pick: count,
      apply: (sel, ctx) => {
        if (sel.length) (ctx.fc['Metamagic'] ??= {}).optionKeys = sel;
      },
    });
  }

  // --- Eldritch Invocations ---
  if (advanced.invocations) {
    const eligible = advanced.invocations.options.filter(
      (o) => prereqLevel(o.prerequisite) <= cls.level && !/pact of the/i.test(o.prerequisite ?? '')
    );
    const count = Math.min(advanced.invocations.count, eligible.length);
    if (count > 0) {
      menus.push({
        id: mid('eldritch-invocations'),
        prompt: `Eldritch Invocations: pick ${count} invocations`,
        options: eligible.map((o) => o.key),
        pick: count,
        apply: (sel, ctx) => {
          const firstSafeOrigin =
            input.featsByType.origin.find((f) => !/magic initiate|skilled/i.test(f.name))?.id ??
            null;
          // Which sub-choice an invocation owes is read from its own SRD text, exactly like the
          // editor and the save validation do. A hardcoded key list here silently missed any
          // invocation outside it, and the sheet came back "Conclua as escolhas em: Eldritch
          // Invocations" with no way to tell which row was short.
          const descByKey = new Map(eligible.map((o) => [o.key, o.desc ?? '']));
          const selections = sel.map((key) => {
            const desc = descByKey.get(key) ?? '';
            if (invocationRequiresCantrip(desc)) {
              const cantrip =
                ctx.chosenCantripNames.find((n) => n.toLowerCase() === 'eldritch blast') ??
                ctx.chosenCantripNames[0] ??
                null;
              return { key, spellName: cantrip };
            }
            if (invocationRequiresOriginFeat(desc)) return { key, featId: firstSafeOrigin };
            return { key };
          });
          if (selections.length) {
            (ctx.fc['Eldritch Invocations'] ??= {}).selections = selections;
          }
        },
      });
      if (eligible.some((o) => o.key === PACT_OF_TOME_KEY) && input.allCantripNames.length > 0) {
        menus.push({
          id: mid('pact-tome-cantrips'),
          prompt: `Only used if you picked "${PACT_OF_TOME_KEY}": pick 3 cantrips from any class list`,
          options: input.allCantripNames,
          pick: 3,
          apply: (sel, ctx) => {
            if (!ctx.selected(mid('eldritch-invocations')).includes(PACT_OF_TOME_KEY)) return;
            (ctx.fc['Pact of the Tome'] ??= {}).cantrips = sel.slice(0, 3);
            (ctx.fc['Pact of the Tome'] ??= {}).rituals = ctx
              .selected(mid('pact-tome-rituals'))
              .slice(0, 2);
          },
        });
        menus.push({
          id: mid('pact-tome-rituals'),
          prompt: `Only used if you picked "${PACT_OF_TOME_KEY}": pick 2 level-1 ritual spells`,
          options: input.level1RitualNames,
          pick: Math.min(2, input.level1RitualNames.length),
          apply: () => {
            // written together with pact-tome-cantrips
          },
        });
      }
    }
  }

  // --- Mystic Arcanum (one spell per gain) ---
  advanced.mysticArcanumSpellLevels.forEach((spellLevel, i) => {
    const pool = classSpellsByLevel.get(spellLevel) ?? [];
    if (pool.length === 0) return;
    menus.push({
      id: mid(`mystic-arcanum-${i}`),
      prompt: `Mystic Arcanum (gain ${i + 1}): pick 1 level-${spellLevel} spell`,
      options: pool,
      pick: 1,
      apply: (sel, ctx) => {
        if (!sel[0]) return;
        const arr =
          (ctx.fc['Mystic Arcanum']?.spellNamesByGain as (string | null)[] | undefined) ??
          advanced.mysticArcanumSpellLevels.map(() => null);
        arr[i] = sel[0];
        (ctx.fc['Mystic Arcanum'] ??= {}).spellNamesByGain = arr;
      },
    });
  });

  // --- Spell Mastery (wizard 18) ---
  if (advanced.hasSpellMastery) {
    for (const lvl of [1, 2]) {
      const pool = classSpellsByLevel.get(lvl) ?? [];
      if (pool.length === 0) continue;
      menus.push({
        id: mid(`spell-mastery-${lvl}`),
        prompt: `Spell Mastery: pick 1 level-${lvl} spell to master`,
        options: pool,
        pick: 1,
        apply: (sel, ctx) => {
          if (!sel[0]) return;
          const map =
            (ctx.fc['Spell Mastery']?.spellNamesByLevel as Record<number, string> | undefined) ??
            {};
          map[lvl] = sel[0];
          (ctx.fc['Spell Mastery'] ??= {}).spellNamesByLevel = map;
        },
      });
    }
  }

  // --- Signature Spells (wizard 20) ---
  if (advanced.hasSignatureSpells) {
    const pool = classSpellsByLevel.get(3) ?? [];
    if (pool.length > 0) {
      menus.push({
        id: mid('signature-spells'),
        prompt: 'Signature Spells: pick 2 level-3 spells',
        options: pool,
        pick: 2,
        apply: (sel, ctx) => {
          if (sel.length) (ctx.fc['Signature Spells'] ??= {}).spellNames = sel.slice(0, 2);
        },
      });
    }
  }

  return menus;
}

export function buildAiMenus(input: MenuBuildInput): AiMenu[] {
  const menus: AiMenu[] = [];
  const { race } = input;
  const multiclass = input.classes.length > 1;
  // Two classes granting Fighting Style means two independent picks in the persisted shape.
  const fightingStyleClasses = input.classes.filter(
    (c) =>
      c.advanced.hasFightingStyle ||
      c.classSingles.some(
        (single) => single.feature.trim().toLowerCase() === FIGHTING_STYLE_FEATURE.toLowerCase()
      )
  ).length;
  const expertiseClasses = input.classes.filter((c) => c.advanced.expertiseCount > 0).length;
  for (const cls of input.classes) {
    // The class name is a stable, readable namespace; the LLM sees these ids and echoes them back.
    const scope = multiclass ? `${cls.className.toLowerCase().replace(/\s+/g, '-')}/` : '';
    menus.push(
      ...buildClassMenus(cls, input, scope, fightingStyleClasses > 1, expertiseClasses > 1)
    );
  }

  // --- Weapon Mastery: one menu per granting class ---
  // Each class grants its own count off its own table and the sheet keeps one list per class, so a
  // Paladin 14 / Fighter 6 owes 2 + 5 and picks them separately. Built once for the character (the
  // old shape) it filled only the largest count and the save then reported the rest as missing.
  const weaponMasteryClasses = input.classes.filter((c) => c.advanced.weaponMasteryCount > 0);
  const namespacedMastery = weaponMasteryClasses.length > 1;
  for (const cls of weaponMasteryClasses) {
    if (input.weaponNames.length === 0) break;
    const count = cls.advanced.weaponMasteryCount;
    const scope = namespacedMastery ? `${cls.className.toLowerCase().replace(/\s+/g, '-')}/` : '';
    menus.push({
      id: `${scope}weapon-mastery`,
      prompt: `Weapon Mastery (${cls.className}): pick ${count} weapons to master`,
      options: input.weaponNames,
      pick: count,
      apply: (sel, ctx) => {
        const key = featureChoiceKey(
          'Weapon Mastery',
          namespacedMastery ? cls.classRuleItemId : null
        );
        // Mastering the same weapon twice buys nothing, so a class only keeps what the others left
        // and is topped up from the remaining pool.
        const taken = new Set(
          Object.entries(ctx.fc)
            .filter(([k]) => parseFeatureChoiceKey(k).featureName === 'Weapon Mastery')
            .flatMap(([, entry]) => (entry?.weaponIds as string[] | undefined) ?? [])
        );
        const ids = dedupe(
          sel.map((n) => input.weaponIdByName.get(n.toLowerCase())).filter((v): v is string => !!v)
        ).filter((id) => !taken.has(id));
        for (const name of input.weaponNames) {
          if (ids.length >= count) break;
          const id = input.weaponIdByName.get(name.toLowerCase());
          if (id && !taken.has(id) && !ids.includes(id)) ids.push(id);
        }
        if (ids.length) (ctx.fc[key] ??= {}).weaponIds = ids.slice(0, count);
      },
    });
  }

  // --- Ability Score Improvement (one menu per gain: 2 ability points OR one General feat) ---
  // Summed across classes: each grants ASIs on its own schedule, but they land in ONE flat list on
  // the sheet. Counting only the initial class silently dropped the other class's gains.
  const asiGainCount = input.classes.reduce((sum, c) => sum + c.advanced.asiGainCount, 0);
  const hasEpicBoon = input.classes.some((c) => c.advanced.hasEpicBoon);
  const generalFeats = input.featsByType.general.filter(
    (f) => f.name.trim().toLowerCase() !== 'ability score improvement'
  );
  for (let i = 0; i < asiGainCount; i++) {
    menus.push({
      id: `asi-gain-${i}`,
      prompt:
        `Ability Score Improvement (gain ${i + 1}): return TWO ability names (repeat one for +2, ` +
        `or two different for +1/+1) OR exactly ONE feat name. The class's key ability (` +
        `${input.keyAbilities.join(' / ') || 'the highest one'}) comes first and is taken to 20 ` +
        `before anything else; only then spread, and always onto EVEN final scores`,
      options: [...ABILITIES, ...generalFeats.map((f) => f.name)],
      pick: 2,
      allowDuplicates: true,
      apply: (sel, ctx) => {
        const byGain =
          (ctx.fc['Ability Score Improvement']?.byGain as unknown[] | undefined) ??
          Array.from({ length: asiGainCount }, () => null);
        const featName = sel.find((s) => generalFeats.some((f) => f.name === s));
        if (featName) {
          const featId = input.featIdByName.get(featName.toLowerCase());
          if (featId) {
            byGain[i] = { kind: 'feat', featId };
            if (/grappler/i.test(featName)) {
              (ctx.fc['Grappler'] ??= {}).abilityScore = 'Strength';
            }
          }
        } else {
          // Two points, placed one at a time against the running total (see `bestFor`): the key
          // ability first, then whatever the point actually improves. Each menu is answered blind to
          // the other gains, so the arithmetic has to happen here.
          const router = abilityPointRouter(byGain, ctx, input.primaryAbility, input.keyAbilities);
          const wanted = sel.filter((s) => ABILITIES.includes(s)).slice(0, 2);
          const byAbility: Record<string, number> = {};
          const isFinalGain = i === asiGainCount - 1;
          for (let point = 0; point < 2; point += 1) {
            const ability = router.bestFor(wanted[point], isFinalGain && point === 1);
            router.take(ability);
            byAbility[ability] = (byAbility[ability] ?? 0) + 1;
          }
          byGain[i] = { kind: 'increase_scores', byAbility };
        }
        (ctx.fc['Ability Score Improvement'] ??= {}).byGain = byGain;
      },
    });
  }

  // --- Epic Boon (level 19+) ---
  if (hasEpicBoon && input.featsByType.epicBoon.length > 0) {
    menus.push({
      id: 'epic-boon',
      prompt: 'Epic Boon: pick 1 Epic Boon feat',
      options: input.featsByType.epicBoon.map((f) => f.name),
      pick: 1,
      apply: (sel, ctx) => {
        const featId = sel[0] ? input.featIdByName.get(sel[0].toLowerCase()) : null;
        if (featId) (ctx.fc['Epic Boon'] ??= {}).featId = featId;
        // Epic Boon raises an ability by 1 past the normal cap, but only up to 30 and never one
        // already at its own limit: a level-20 Warlock has its casting ability at 20, and picking it
        // again made the clamp drop the point, leaving the boon reading as unmade.
        const byGain = (ctx.fc['Ability Score Improvement']?.byGain as unknown[]) ?? [];
        const router = abilityPointRouter(byGain, ctx, input.primaryAbility, input.keyAbilities);
        // A single point, so it follows the last-point rule: an odd score first, where +1 is a whole
        // modifier. Landing it on an even one is the +1 nobody notices.
        const ability = router.bestFor(ctx.selected('epic-boon-ability')[0], true);
        if (ability) (ctx.fc['Epic Boon'] ??= {}).abilityScore = ability;
      },
    });
    menus.push({
      id: 'epic-boon-ability',
      prompt: 'Epic Boon: pick the ability score that receives +1',
      options: [...ABILITIES],
      pick: 1,
      apply: () => {
        // written together with the epic-boon menu
      },
    });
  }

  // --- Race traits (lineages/ancestries/legacies, Keen Senses, Skillful, Versatile) ---
  for (const trait of race.selectableTraits) {
    const id = `trait:${trait.trait.toLowerCase().replace(/\s+/g, '-')}`;
    menus.push({
      id,
      prompt: `Race trait "${trait.trait}": pick one option`,
      options: trait.options.map((o) => o.key),
      pick: 1,
      apply: (sel, ctx) => {
        if (sel[0]) (ctx.fc[trait.trait] ??= {}).option = sel[0];
      },
    });
    if (trait.needsSpellcastingAbility) {
      menus.push({
        id: `${id}-ability`,
        prompt: `Race trait "${trait.trait}": pick the spellcasting ability for its spells`,
        options: [...CASTING_ABILITIES],
        pick: 1,
        apply: (sel, ctx) => {
          if (sel[0]) (ctx.fc[trait.trait] ??= {}).spellcastingAbility = sel[0];
        },
      });
    }
    if (trait.isElvenLineage) {
      const wizardCantrips = input.spellListPools.get('Wizard')?.cantrips ?? [];
      if (wizardCantrips.length > 0) {
        menus.push({
          id: `${id}-cantrip`,
          prompt: `Only used if you picked "high-elf" for ${trait.trait}: pick 1 Wizard cantrip`,
          options: wizardCantrips,
          pick: 1,
          apply: (sel, ctx) => {
            if (ctx.selected(id)[0] !== 'high-elf') return;
            if (sel[0]) (ctx.fc[trait.trait] ??= {}).highElfCantrip = sel[0];
          },
        });
      }
    }
  }

  if (race.keenSensesSkillKeys.length > 0) {
    menus.push({
      id: 'keen-senses',
      prompt: 'Keen Senses: pick 1 skill proficiency (prefer one you do not already have)',
      options: race.keenSensesSkillKeys,
      pick: 1,
      apply: (sel, ctx) => {
        // Falls back to the OPTION LIST, not just the model's pick: a bonus skill that duplicates one
        // the character already has is exempt from the class budget, so the class silently ends a
        // skill short when a granted skill collides with the class pick.
        const pick = firstUnusedSkill([...sel, ...race.keenSensesSkillKeys], ctx) ?? sel[0];
        if (pick) (ctx.fc['Keen Senses'] ??= {}).option = pick;
      },
    });
  }

  if (race.hasSkillful) {
    menus.push({
      id: 'skillful',
      prompt: 'Skillful: pick 1 skill proficiency (prefer one you do not already have)',
      options: input.allSkillKeys,
      pick: 1,
      apply: (sel, ctx) => {
        const pick = firstUnusedSkill([...sel, ...input.allSkillKeys], ctx) ?? sel[0];
        if (pick) (ctx.fc['Skillful'] ??= {}).option = pick;
      },
    });
  }

  if (race.hasVersatile && input.featsByType.origin.length > 0) {
    menus.push({
      id: 'versatile',
      prompt: 'Versatile: pick 1 Origin feat',
      options: input.featsByType.origin.map((f) => f.name),
      pick: 1,
      apply: (sel, ctx) => {
        const featId = sel[0] ? input.featIdByName.get(sel[0].toLowerCase()) : null;
        if (featId) (ctx.fc['Versatile'] ??= {}).featId = featId;
        if (/skilled/i.test(sel[0] ?? '')) {
          const skills = ctx.selected('versatile-skilled').slice(0, 3);
          if (skills.length) {
            const bySource =
              (ctx.fc['Skilled']?.bySource as Record<string, unknown> | undefined) ?? {};
            bySource['versatile'] = skills.map((k) => `skill:${k}`);
            (ctx.fc['Skilled'] ??= {}).bySource = bySource;
          }
        }
      },
    });
    menus.push({
      id: 'versatile-skilled',
      prompt: 'Only used if you picked "Skilled" for Versatile: pick 3 skill proficiencies',
      options: input.allSkillKeys,
      pick: 3,
      apply: () => {
        // written together with the versatile menu
      },
    });
    pushMagicInitiateMenus(
      menus,
      'versatile-mi',
      'versatile',
      MAGIC_INITIATE_SPELL_LISTS,
      input,
      (ctx) => /magic initiate/i.test(ctx.selected('versatile')[0] ?? '')
    );
  }

  // --- Background origin feat sub-choices (Magic Initiate (X) / Skilled) ---
  input.backgroundFeatNames.forEach((featName) => {
    if (/magic initiate/i.test(featName)) {
      pushMagicInitiateMenus(
        menus,
        'bg-mi',
        buildMiFdKey('background', featName, 0),
        [lockedMiList(featName)],
        input
      );
    } else if (/skilled/i.test(featName)) {
      menus.push({
        id: 'bg-skilled',
        prompt: `Background feat "${featName}": pick 3 skill proficiencies`,
        options: input.allSkillKeys,
        pick: 3,
        apply: (sel, ctx) => {
          if (sel.length === 0) return;
          const bySource =
            (ctx.fc['Skilled']?.bySource as Record<string, unknown> | undefined) ?? {};
          bySource[buildMiFdKey('background', featName, 0)] = sel
            .slice(0, 3)
            .map((k) => `skill:${k}`);
          (ctx.fc['Skilled'] ??= {}).bySource = bySource;
        },
      });
    }
  });

  return menus;
}

/**
 * Validates the LLM's selections against each menu (keeps valid picks in order, tops up from the
 * menu's own options) and applies every menu into a fresh `featureChoices` record.
 */
export function applyAiMenus(
  menus: AiMenu[],
  rawSelections: Array<{ id: string; selections: string[] }>,
  ctxBase: Omit<MenuApplyContext, 'fc' | 'selected'>
): Record<string, Record<string, unknown>> {
  const rawById = new Map(rawSelections.map((s) => [s.id, s.selections]));
  const validated = new Map<string, string[]>();

  for (const menu of menus) {
    const optionByLower = new Map(menu.options.map((o) => [o.toLowerCase(), o]));
    const raw = (rawById.get(menu.id) ?? [])
      .map((s) => optionByLower.get(s.trim().toLowerCase()))
      .filter((s): s is string => !!s);
    const picks = menu.allowDuplicates ? raw : dedupe(raw);
    const topped = [...picks];
    if (!menu.allowDuplicates) {
      for (const opt of menu.options) {
        if (topped.length >= menu.pick) break;
        if (!topped.includes(opt)) topped.push(opt);
      }
    }
    validated.set(menu.id, topped.slice(0, menu.pick));
  }

  const fc: Record<string, Record<string, unknown>> = {};
  const ctx: MenuApplyContext = {
    ...ctxBase,
    fc,
    selected: (menuId) => validated.get(menuId) ?? [],
  };
  for (const menu of menus) {
    menu.apply(validated.get(menu.id) ?? [], ctx);
  }
  // Run last on purpose: only here are the ability totals final (see each function's note).
  rebalanceAbilityScoreImprovements(fc, ctxBase.baseAttributes);
  assignMagicInitiateAbilities(fc, ctxBase.baseAttributes);
  return fc;
}

export { extractAdvancedClassChoices, extractRaceChoiceOptions };
