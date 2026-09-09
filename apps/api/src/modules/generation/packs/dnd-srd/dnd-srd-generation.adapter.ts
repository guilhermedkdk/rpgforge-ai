import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  persistedCharacterDataSchema,
  extractClassChoiceOptions,
  extractBackgroundChoiceOptions,
  extractClassSpellLimits,
  extractClassFeatureChoices,
  extractAdvancedClassChoices,
  extractRaceChoiceOptions,
  resolveEquipmentBundle,
  getArmorProficiencyCategories,
  getCastingClasses,
  getItemCostGP,
  isArmorItemProficient,
  isHolySymbolItemName,
  HOLY_SYMBOL_PLACEHOLDER_LINE,
  MUSICAL_INSTRUMENT_PLACEHOLDER_LINE,
  MUSICAL_INSTRUMENT_CATEGORY_TAG,
  extractSubclassOfKey,
  isShieldItem,
  ruleItemSpellLevel,
  CLASS_MARKER_SPELLBOOK_CASTER,
  DND_ABILITY_NAMES,
  STANDARD_LANGUAGE_TAG,
  SUBCLASS_UNLOCK_LEVEL,
  getAllFightingStyleFeatIds,
  getMulticlassCombinationErrors,
  getClassPrimaryAbilities,
  mergeCharacterFormDataFromApi,
  getDerivedFromRuleItems,
  applyDerivedToCharacterData,
  applyCombatFromAttributes,
  computeGrantedSpellPlacements,
  buildSpellLookupByParsedName,
  getPendingToolProficiencyChoices,
  parseToolProficiencyChoose,
  getFeatMeta,
  evaluateFeatPrerequisite,
  featureClassLevel,
  evocationSavantFreeSpellCount,
  fullCasterMaxSpellLevel,
  BONUS_PROFICIENCIES_SKILL_PICKS,
  MAGICAL_DISCOVERIES_SPELL_LISTS,
  MAGICAL_DISCOVERIES_SPELL_PICKS,
  PERSISTED_CHARACTER_SCHEMA_VERSION,
  TOOL_CATEGORY_TAGS,
  STANDARD_ARRAY,
  attributePickedSpells,
  spellRowKey,
  spellClassTag,
} from '@rpgforce-ai/shared';
import {
  buildAiMenus,
  applyAiMenus,
  dedupe,
  MAGIC_INITIATE_SPELL_LISTS,
  type MenuBuildInput,
} from './feature-choice-menus';
import type {
  AiDecision,
  EquipmentSource,
  GenerateCharacterRequest,
  GenerateCharacterMeta,
  GenerationQuestion,
  PersistedCharacterData,
  RuleItemResponse,
  EquipmentBundleOption,
  BackgroundAbilityOption,
  CharacterFormData,
} from '@rpgforce-ai/shared';
import { RuleitemsService } from '../../../ruleitems/ruleitems.service';
import { LlmService } from '../../llm.service';
import { PackGenerationAdapter } from '../../pack-generation.adapter';

/** Slug of the pack this adapter serves (matches `Pack.slug`). */
export const DND_SRD_PACK_SLUG = 'dnd-srd-5-2';
import {
  llmQuestionsSchema,
  llmCoreSchema,
  llmLoadoutSchema,
  ALL_SKILL_KEYS,
  QUESTIONS_SYSTEM,
  CORE_SYSTEM,
  LOADOUT_SYSTEM,
  stripInlineMarkdown,
  buildConceptText,
  buildCoreUser,
  buildQuestionsUser,
  buildLoadoutUser,
  assembleDraft,
  clampLevel,
  type LlmLoadout,
  type LlmCore,
} from './internals';

const ARMOR_TAG = 'item:armor:yes';
const ADVENTURING_GEAR_TAG = 'item:category:adventuring-gear';
/**
 * An answer option that defers to the user typing something ("diga o nível", "outro: especifique").
 * Matched on the verb plus a following object so a plain "Diga não" style label is not caught.
 */
const OPTION_ASKS_FOR_INPUT =
  /\b(diga|digite|informe|escreva|especifique|defina|indique|type|tell me|specify|enter)\b[^.!?]{0,30}\b(qual|quanto|quantos|n[íi]vel|valor|nome|aqui|abaixo|which|what|level|value|name|below)\b/i;
/**
 * How much of the purse may be spent. A character that took a gear bundle keeps most of its coin
 * (spending it all is not a normal sheet); one that took the GOLD option has nothing but coin, and
 * that gold is the whole point, so almost all of it is spendable.
 */
const MAX_PURCHASE_SHARE_WITH_GEAR = 0.5;
const MAX_PURCHASE_SHARE_GOLD_ONLY = 0.9;
const MAX_PURCHASE_LINES_WITH_GEAR = 6;
const MAX_PURCHASE_LINES_GOLD_ONLY = 10;
const DEFAULT_LANGUAGES_TO_PICK = 2;

/** Clamps the LLM's bundle index to a valid selection (or null when the list is empty). */
function resolveBundleIndex(index: number, bundles: EquipmentBundleOption[]): number | null {
  if (bundles.length === 0) return null;
  return index >= 0 && index < bundles.length ? index : 0;
}

/**
 * Replaces the category placeholders a starting-equipment bundle leaves behind ("Holy Symbol") with
 * a concrete catalog item, or the editor flags a pending pick the player never made. Which items
 * qualify is the shared rule the editor's pickers use; the choice is deterministic because every
 * option is equally legal.
 */
function resolveEquipmentPlaceholders<T extends { name: string; quantity: number }>(
  items: T[],
  placeholderItems: RuleItemResponse[]
): T[] {
  const firstByName = (pool: RuleItemResponse[]): string | null =>
    [...pool].sort((a, b) => a.name.localeCompare(b.name))[0]?.name ?? null;
  const holySymbol = firstByName(placeholderItems.filter((i) => isHolySymbolItemName(i.name)));
  const instrument = firstByName(
    placeholderItems.filter((i) => i.tagKeys.includes(MUSICAL_INSTRUMENT_CATEGORY_TAG))
  );
  return items.map((item) => {
    const line = item.name.trim().toLowerCase();
    if (line === HOLY_SYMBOL_PLACEHOLDER_LINE && holySymbol) return { ...item, name: holySymbol };
    if (line === MUSICAL_INSTRUMENT_PLACEHOLDER_LINE && instrument) {
      return { ...item, name: instrument };
    }
    return item;
  });
}

/**
 * Turns the model's shopping list into real items, priced from the catalog and capped by the gold the
 * bundles left over.
 *
 * A draft that keeps every coin and buys nothing reads as unfinished: "additional equipment" is
 * exactly what that gold is for. Same discipline as every other pick: validated against the catalog,
 * never invented, and silently dropped when it does not fit the purse.
 */
function resolvePurchases(
  picks: Array<{ item: string; quantity: number }>,
  shop: Array<{ name: string; costGP: number }>,
  goldAvailable: number,
  /** False when the class bundle was the "take the gold" option: the purse IS the equipment. */
  hasStartingGear: boolean
): { items: Array<{ name: string; quantity: number; source: 'manual' }>; spentGP: number } {
  // The model shops to the last copper when left unbounded, and a starting character keeping some
  // coin is the normal state, so the spend is capped here rather than argued for in the prompt.
  const maxLines = hasStartingGear ? MAX_PURCHASE_LINES_WITH_GEAR : MAX_PURCHASE_LINES_GOLD_ONLY;
  const budget =
    goldAvailable * (hasStartingGear ? MAX_PURCHASE_SHARE_WITH_GEAR : MAX_PURCHASE_SHARE_GOLD_ONLY);
  const byName = new Map(shop.map((i) => [i.name.trim().toLowerCase(), i]));
  const items: Array<{ name: string; quantity: number; source: 'manual' }> = [];
  let spentGP = 0;
  for (const pick of picks) {
    if (items.length >= maxLines) break;
    const entry = byName.get((pick.item ?? '').trim().toLowerCase());
    if (!entry) continue;
    const wanted = Math.max(1, Math.trunc(pick.quantity || 1));
    // Buys what fits and stops there, instead of dropping the whole line for being one coin short.
    const affordable = entry.costGP > 0 ? Math.floor((budget - spentGP) / entry.costGP) : wanted;
    const quantity = Math.min(wanted, Math.max(0, affordable));
    if (quantity <= 0) continue;
    spentGP += quantity * entry.costGP;
    // Merged by name, like the manual shop: the model lists the same item twice often enough, and
    // two "Bedroll 1" rows side by side is not what the sheet shows for a manual purchase.
    const existing = items.find((i) => i.name === entry.name);
    if (existing) existing.quantity += quantity;
    else items.push({ name: entry.name, quantity, source: 'manual' });
  }
  return { items, spentGP };
}

/**
 * States what the leftover gold bought. Written from the RESULT, never asked of the model: it
 * forgets its own shopping, and the top-up buys things it never asked for.
 */
function withPurchaseNote(
  decisions: AiDecision[],
  purchased: { items: Array<{ name: string; quantity: number }>; spentGP: number }
): AiDecision[] {
  if (purchased.items.length === 0) return decisions;
  const list = purchased.items
    .map((i) => (i.quantity > 1 ? `${i.quantity}x ${i.name}` : i.name))
    .join(', ');
  // Trailing zeros off: 7.70 reads as a bug, 7.7 does not.
  const spent = Number(purchased.spentGP.toFixed(2));
  const note = `Comprado com o ouro que sobrou: ${list} (${spent} GP)`;

  const equipment = decisions.find((d) => d.area === 'equipment');
  if (equipment) {
    equipment.points.push(note);
    return decisions;
  }
  return [...decisions, { area: 'equipment', points: [note] }];
}

/**
 * Guarantees the "take the gold" build is actually armed: asked for a weapon and armor, the model
 * still ships characters with neither. Armor is limited to what the class itself grants, so a Wizard
 * is never handed Chain Mail.
 */
function topUpStartingGear(params: {
  bought: Array<{ name: string; quantity: number; source: 'manual' }>;
  spentGP: number;
  goldAvailable: number;
  shop: Array<{ name: string; costGP: number }>;
  armors: RuleItemResponse[];
  weapons: RuleItemResponse[];
  armorTraining: string;
}): { items: Array<{ name: string; quantity: number; source: 'manual' }>; spentGP: number } {
  const items = [...params.bought];
  let spentGP = params.spentGP;
  const priceOf = new Map(params.shop.map((i) => [i.name.trim().toLowerCase(), i.costGP]));
  const owned = new Set(items.map((i) => i.name.trim().toLowerCase()));
  const remaining = () => params.goldAvailable - spentGP;
  const buy = (item: RuleItemResponse | undefined) => {
    if (!item) return;
    const cost = priceOf.get(item.name.trim().toLowerCase());
    if (cost == null || cost > remaining()) return;
    spentGP += cost;
    items.push({ name: item.name, quantity: 1, source: 'manual' });
    owned.add(item.name.trim().toLowerCase());
  };
  const affordable = (pool: RuleItemResponse[]) =>
    pool
      .filter((i) => {
        const cost = priceOf.get(i.name.trim().toLowerCase());
        return cost != null && cost <= remaining();
      })
      // Best the purse allows: price is the pack's own ordering of how good a piece of gear is.
      .sort(
        (a, b) =>
          (priceOf.get(b.name.trim().toLowerCase()) ?? 0) -
          (priceOf.get(a.name.trim().toLowerCase()) ?? 0)
      );

  const hasWeapon = params.weapons.some((w) => owned.has(w.name.trim().toLowerCase()));
  if (!hasWeapon) buy(affordable(params.weapons)[0]);

  // The helper reads the proficiencies BLOCK of a sheet; here there is no sheet yet, only the class's
  // own grant, so it is fed the one line it looks for.
  const categories = getArmorProficiencyCategories({
    proficiencies: `Armor Training: ${params.armorTraining}`,
  } as CharacterFormData);
  if (categories.size > 0) {
    const bodyArmor = params.armors.filter((a) => !isShieldItem(a));
    const hasArmor = bodyArmor.some((a) => owned.has(a.name.trim().toLowerCase()));
    if (!hasArmor) {
      buy(affordable(bodyArmor).find((a) => isArmorItemProficient(a, categories)));
    }
    if (categories.has('shield')) {
      const shield = params.armors.find((a) => isShieldItem(a));
      if (shield && !owned.has(shield.name.trim().toLowerCase())) buy(shield);
    }
  }
  return { items, spentGP };
}

/** Resolves the armor + shield to equip from the character's equipment item names (by exact match). */
function resolveEquippedArmor(
  equipmentItems: { name: string; quantity: number }[],
  armors: RuleItemResponse[]
): { equippedArmorId: string | null; equippedShieldId: string | null } {
  const byName = new Map(armors.map((a) => [a.name.trim().toLowerCase(), a]));
  let equippedArmorId: string | null = null;
  let equippedShieldId: string | null = null;
  for (const item of equipmentItems) {
    const armor = byName.get(item.name.trim().toLowerCase());
    if (!armor) continue;
    if (isShieldItem(armor)) equippedShieldId ??= armor.id;
    else equippedArmorId ??= armor.id;
  }
  return { equippedArmorId, equippedShieldId };
}

/** Appends items from `pool` (in order, skipping ones already chosen) until `chosen` reaches `count`. */
function topUp(chosen: string[], pool: Iterable<string>, count: number): string[] {
  const out = [...chosen];
  if (out.length >= count) return out.slice(0, count);
  const seen = new Set(out);
  for (const candidate of pool) {
    if (out.length >= count) break;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

/**
 * Builds the validated `backgroundAbilityScoreIncrease` record from the LLM picks + the SRD budget,
 * then tops up any unspent points across the allowed abilities so the total always equals the budget
 * (a complete sheet needs the full increase spent).
 */
function resolveBackgroundAbilityIncrease(
  picks: LlmLoadout['backgroundAbilityIncrease'],
  option: BackgroundAbilityOption | null,
  /** Points the multiclass prerequisites already committed; spent before the model's own picks. */
  reserved: Record<string, number> = {}
): Record<string, number> {
  if (!option) return {};
  const allowedNames =
    option.allowedAbilityNames.length > 0 ? option.allowedAbilityNames : [...DND_ABILITY_NAMES];
  const allowed = new Set(allowedNames);
  const canonicalByLower = new Map(DND_ABILITY_NAMES.map((a) => [a.toLowerCase(), a as string]));
  const out: Record<string, number> = {};
  let spent = 0;
  const spend = (ability: string, amount: number) => {
    const room = option.totalPoints - spent;
    if (room <= 0) return;
    const headroom = option.maxPerAbility - (out[ability] ?? 0);
    const applied = Math.min(amount, room, headroom);
    if (applied <= 0) return;
    out[ability] = (out[ability] ?? 0) + applied;
    spent += applied;
  };
  // The reservation is what makes a 13 the class needs actually land: spending it after the model's
  // picks would leave nothing for it and the sheet would fail its own prerequisite.
  for (const [ability, amount] of Object.entries(reserved)) {
    if (allowed.has(ability)) spend(ability, Math.max(0, Math.trunc(amount)));
  }
  for (const { ability, amount } of picks) {
    const canonical = canonicalByLower.get(ability.trim().toLowerCase());
    if (!canonical || !allowed.has(canonical)) continue;
    spend(canonical, Math.max(0, Math.trunc(amount)));
  }
  // Distribute any leftover points deterministically across the allowed abilities.
  for (const ability of allowedNames) {
    if (spent >= option.totalPoints) break;
    spend(ability, option.maxPerAbility);
  }
  return out;
}

/**
 * How many classes one draft may combine. The SRD sets no limit, but every extra class costs another
 * 13 and the standard array runs out: three is already the point where the background increase has
 * to be spent covering prerequisites instead of the build.
 */
const MAX_MULTICLASS_CLASSES = 3;

/** How many ignored answers are worth reporting; the rest only reach the log. */
const MAX_REPORTED_IGNORED_ANSWERS = 2;
/** One line per absent thing, capped: a concept naming three of them should not bury the banner. */
const MAX_REPORTED_UNAVAILABLE = 2;

const sumOf = (values: number[]): number => values.reduce((total, v) => total + v, 0);

/**
 * The background points needed to reach the 13s the classes require, or `{}` when the array already
 * covers them (and also when the background cannot help, which the caller reads as "does not fit").
 *
 * The SRD checks the prerequisite on the FINAL score, and the background increase is part of it, so
 * a required ability sitting at 12 is one reserved point away from legal.
 */
function planPrerequisiteReserve(
  attributes: LlmCore['attributes'],
  classItems: RuleItemResponse[],
  option: BackgroundAbilityOption | null
): Record<string, number> {
  if (!option) return {};
  const allowed = new Set(
    option.allowedAbilityNames.length > 0 ? option.allowedAbilityNames : [...DND_ABILITY_NAMES]
  );
  const reserve: Record<string, number> = {};
  let spent = 0;
  for (const miss of getMulticlassCombinationErrors({ attributes, classItems })) {
    const need = miss.required - (attributes[miss.ability] ?? 0);
    if (need <= 0 || !allowed.has(miss.ability)) continue;
    if (need > option.maxPerAbility || spent + need > option.totalPoints) continue;
    reserve[miss.ability] = need;
    spent += need;
  }
  return reserve;
}

/**
 * How many core candidates the search may return per kind.
 *
 * Above every catalog it slices (this pack has 9 species, 12 classes, 4 backgrounds), so retrieval
 * only ORDERS the list, never trims it. A top-5 did trim it: asked for "um feiticeiro humano", the
 * search ranked the draconic species first, Human never reached the prompt, and the model asked for
 * Human by id AND by name while the pick fell through to Dragonborn.
 */
const CORE_CANDIDATE_LIMIT = 20;

const compareName = (value: string): string =>
  // NFD splits accented letters into letter + combining mark, and the a-z filter drops the marks.
  value
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * Matches a candidate by NAME, the second chance behind the id.
 *
 * A 36-character UUID is easy for a model to garble and the failure was silent: the whole multiclass
 * was dropped and the draft reported an illegal combination that had never been evaluated. Still
 * restricted to the candidates that were offered, so it can never introduce a class from outside the
 * prompt.
 */
function matchCandidateByName(
  name: string | undefined,
  candidates: RuleItemResponse[]
): RuleItemResponse | null {
  const wanted = compareName(name ?? '');
  if (!wanted) return null;
  return (
    candidates.find((c) => compareName(c.name) === wanted) ??
    candidates.find((c) => compareName(c.name).includes(wanted)) ??
    null
  );
}

interface GenerationCastingClass {
  classRuleItemId: string;
  maxCantrips: number;
  maxPrepared: number;
  /** Highest spell level THIS class may prepare at its own level; stated to the model in its block. */
  maxSpellLevel: number;
  pool: RuleItemResponse[];
}

/**
 * Most one spell level may hold, as a share of the prepared allowance. Left alone the model prepares
 * almost everything at the lowest levels, leaving the high slots with nothing to cast.
 */
const MAX_SHARE_PER_SPELL_LEVEL = 1 / 5;

/**
 * Every spell level the caster can reach must hold at least one prepared spell, highest first.
 *
 * Reserving only the TOP HALF fixed the empty high slots but swung the other way, producing a Wizard
 * 20 with nothing at levels 1-2 — the cheap utility is what gets cast most turns.
 */
function requiredSpellLevels(maxSpellLevel: number): number[] {
  if (maxSpellLevel < 1) return [];
  const out: number[] = [];
  for (let level = maxSpellLevel; level >= 1; level--) out.push(level);
  return out;
}

/**
 * Spends EACH class's allowance separately: one flat pool left the second class short and the draft
 * unsaveable. `excludeNames` drops the spells the character gets for free, which do not count.
 */
function fillSpellsPerClass(params: {
  castingClasses: GenerationCastingClass[];
  pickedSpells: RuleItemResponse[];
  ownerOf: (spell: RuleItemResponse, isCantrip: boolean) => string | null;
  excludeNames?: ReadonlySet<string>;
  /**
   * Spells the model wrote a reason for, lowercased.
   *
   * The floor and the cap have to drop some of its picks, and dropping them blind also threw away the
   * `spellNotes` attached to them — sheets came back with a tidy spell list and no explanation for any
   * of it. A justified pick is one the model actually cared about, so those are kept first.
   */
  notedNames?: ReadonlySet<string>;
}): Array<{ classRuleItemId: string; cantrips: RuleItemResponse[]; leveled: RuleItemResponse[] }> {
  const taken = new Set<string>();
  const excluded = (s: RuleItemResponse) =>
    params.excludeNames?.has(s.name.trim().toLowerCase()) ?? false;
  const isNoted = (s: RuleItemResponse) =>
    params.notedNames?.has(s.name.trim().toLowerCase()) ?? false;
  // Justified picks first; everything else keeps the model's own order.
  const picksByPriority = [
    ...params.pickedSpells.filter(isNoted),
    ...params.pickedSpells.filter((s) => !isNoted(s)),
  ];
  return params.castingClasses.map((c) => {
    const usableFor = (isCantrip: boolean) => (s: RuleItemResponse) =>
      (ruleItemSpellLevel(s) === 0) === isCantrip && !taken.has(s.id) && !excluded(s);

    const fillCantrips = (max: number) => {
      const out: RuleItemResponse[] = [];
      const usable = usableFor(true);
      for (const s of picksByPriority) {
        if (out.length >= max) break;
        if (!usable(s) || params.ownerOf(s, true) !== c.classRuleItemId) continue;
        taken.add(s.id);
        out.push(s);
      }
      for (const s of c.pool) {
        if (out.length >= max) break;
        if (!usable(s)) continue;
        taken.add(s.id);
        out.push(s);
      }
      return out;
    };

    const fillLeveled = (max: number) => {
      const out: RuleItemResponse[] = [];
      const usable = usableFor(false);
      const covered = new Set<number>();
      const take = (s: RuleItemResponse) => {
        taken.add(s.id);
        out.push(s);
        covered.add(ruleItemSpellLevel(s));
      };
      const availableAt = new Map<number, RuleItemResponse[]>();
      for (const s of c.pool) {
        const level = ruleItemSpellLevel(s);
        if (level < 1) continue;
        availableAt.set(level, [...(availableAt.get(level) ?? []), s]);
      }
      // Only levels the pool can actually serve: a class with nothing at level 8 owes nothing there.
      const required = requiredSpellLevels(c.maxSpellLevel).filter((l) =>
        (availableAt.get(l) ?? []).some(usable)
      );
      const perLevelCap = Math.max(1, Math.ceil(max * MAX_SHARE_PER_SPELL_LEVEL));
      const countAt = (level: number) => out.filter((x) => ruleItemSpellLevel(x) === level).length;

      // The model's picks first (justified ones ahead), stopping while there is still room for the
      // levels it skipped, and never letting one level swallow the list.
      for (const s of picksByPriority) {
        if (!usable(s) || params.ownerOf(s, false) !== c.classRuleItemId) continue;
        const level = ruleItemSpellLevel(s);
        if (countAt(level) >= perLevelCap) continue;
        const stillOwed = required.filter((l) => !covered.has(l) && l !== level).length;
        if (out.length + stillOwed >= max) break;
        take(s);
      }
      // Then the floor: one spell at each level the picks left empty, highest first.
      for (const level of required) {
        if (out.length >= max || covered.has(level)) continue;
        const candidate = (availableAt.get(level) ?? []).find(usable);
        if (candidate) take(candidate);
      }
      // Then the remaining allowance, honouring the cap first so the tail cannot rebuild the
      // staircase; a second uncapped pass only runs if a small class list left the sheet short.
      for (const capped of [true, false]) {
        for (const s of c.pool) {
          if (out.length >= max) break;
          if (!usable(s)) continue;
          if (capped && countAt(ruleItemSpellLevel(s)) >= perLevelCap) continue;
          take(s);
        }
        if (out.length >= max) break;
      }
      return out;
    };

    return {
      classRuleItemId: c.classRuleItemId,
      cantrips: fillCantrips(c.maxCantrips),
      leveled: fillLeveled(c.maxPrepared),
    };
  });
}

/**
 * Flattens the per-class picks into rows. The owner is recorded only with 2+ casters: on one class it
 * is implied, and writing it would change what a single-class sheet serializes.
 */
function flattenChosenSpells(
  byClass: Array<{
    classRuleItemId: string;
    cantrips: RuleItemResponse[];
    leveled: RuleItemResponse[];
  }>,
  multiCaster: boolean
): Array<{ spell: RuleItemResponse; classRuleItemId?: string }> {
  return byClass.flatMap((c) =>
    [...c.cantrips, ...c.leveled].map((spell) => ({
      spell,
      classRuleItemId: multiCaster ? c.classRuleItemId : undefined,
    }))
  );
}

/**
 * Stamps the canonical standard array onto the model's assignment, primary abilities first.
 *
 * The values must be exactly 15/14/13/12/10/8 or the save rejects the draft, and every class's
 * primary ability must reach 13 to multiclass. The model's own ranking survives wherever it does not
 * conflict with those two.
 */
function normalizeAbilityArray(
  attributes: LlmCore['attributes'],
  classItems: RuleItemResponse[]
): LlmCore['attributes'] {
  const required: string[] = [];
  for (const item of classItems) {
    const prereq = getClassPrimaryAbilities(item);
    // `any` means one of them is enough (Fighter: Strength OR Dexterity): keep the one the model
    // already rated highest, so its intent survives.
    const wanted =
      prereq.mode === 'any'
        ? [[...prereq.abilities].sort((a, b) => (attributes[b] ?? 0) - (attributes[a] ?? 0))[0]]
        : prereq.abilities;
    for (const ability of wanted) {
      if (ability && !required.includes(ability)) required.push(ability);
    }
  }
  const byModelPreference = (a: string, b: string) => (attributes[b] ?? 0) - (attributes[a] ?? 0);
  const ordered = [
    ...required.filter((a) => a in attributes).sort(byModelPreference),
    ...DND_ABILITY_NAMES.filter((a) => !required.includes(a)).sort(byModelPreference),
  ];
  const out: Record<string, number> = {};
  ordered.forEach((ability, index) => {
    out[ability] = STANDARD_ARRAY[index] ?? STANDARD_ARRAY[STANDARD_ARRAY.length - 1];
  });
  return out as LlmCore['attributes'];
}

/**
 * Collects what the server changed relative to what was asked. Every repair here is deliberate, but
 * a silent one reads as the app ignoring the request.
 */
class AdjustmentLog {
  private readonly entries: string[] = [];

  add(message: string): void {
    if (!this.entries.includes(message)) this.entries.push(message);
  }

  list(): string[] {
    return [...this.entries];
  }

  get count(): number {
    return this.entries.length;
  }
}

/**
 * The D&D SRD 5.2 implementation of the AI wizard: LLM schemas, prompts, choice menus, derivation
 * gap-filling and the persisted draft. The module around it stays pack-agnostic.
 */
@Injectable()
export class DndSrdGenerationAdapter implements PackGenerationAdapter {
  readonly packSlug = DND_SRD_PACK_SLUG;

  private readonly logger = new Logger(DndSrdGenerationAdapter.name);

  constructor(
    private readonly llm: LlmService,
    private readonly ruleitems: RuleitemsService
  ) {}

  async generateQuestions(input: {
    packId: string;
    prompt: string;
    userId?: string | null;
  }): Promise<{ note: string; questions: GenerationQuestion[] }> {
    const { packId, prompt, userId } = input;
    // Ground the questions in what actually exists in the pack: without this the model offers
    // options from its D&D training data (e.g. cleric domains this system does not have).
    const inventoryBlock = await this.buildPackInventoryBlock(packId);
    const result = await this.llm.structured({
      schema: llmQuestionsSchema,
      schemaName: 'clarifying_questions',
      system: QUESTIONS_SYSTEM,
      user: buildQuestionsUser(prompt, inventoryBlock),
      operation: 'generation.questions',
      userId,
    });
    // The note is rendered as Markdown; questions/options are plain labels, so strip any Markdown the
    // model added despite the instruction (keeps stray asterisks out of the buttons). No fixed question
    // count: the prompt asks for exactly as many as the concept needs.
    const note = result.note?.trim() ?? '';
    const questions = result.questions.map((q, i) => {
      const options = Array.isArray(q.options) ? q.options.map(stripInlineMarkdown) : [];
      // An option that asks the user to TYPE a value cannot work as a button: clicking it sends its
      // own label ("Não, posso ajustar (diga o nível)") and answers nothing. Only THAT option is
      // dropped, not the whole list: every question now renders a free-text row of its own, so the
      // promise it was making is already kept and the real options survive.
      const usable = options.filter((o) => !OPTION_ASKS_FOR_INPUT.test(o));
      if (usable.length !== options.length) {
        this.logger.warn(
          `Question "${q.question}" offered a type-it-yourself option; dropped it (free text is always available)`
        );
      }
      // The model repeats itself now and then, and a duplicate option is both useless to answer and
      // a duplicate React key in the list.
      const byText = new Map<string, string>();
      for (const option of usable) {
        const key = option.trim().toLowerCase();
        if (key && !byText.has(key)) byText.set(key, option);
      }
      if (byText.size !== usable.length) {
        this.logger.warn(`Question "${q.question}" repeated an option; kept one of each`);
      }
      return {
        id: q.id?.trim() || `q${i + 1}`,
        question: stripInlineMarkdown(q.question),
        options: [...byText.values()],
      };
    });
    return { note, questions };
  }

  /**
   * The core pick's id, then its NAME, then the top RAG hit.
   *
   * A 36-character UUID is easy for a model to garble, and either failure is silent without this
   * ladder: the draft just carries whatever ranked first. The name is checked only against the
   * candidates that were offered, so it can never introduce something from outside the prompt.
   */
  private resolveCandidate(
    kind: 'class' | 'species' | 'background',
    id: string,
    name: string | undefined,
    candidates: RuleItemResponse[]
  ): RuleItemResponse {
    const picked =
      candidates.find((c) => c.id === id) ??
      matchCandidateByName(name, candidates) ??
      candidates[0];
    if (picked.id !== id) {
      this.logger.warn(
        `Generation: ${kind} id "${id}" matched no candidate; using "${picked.name}" (asked for "${name ?? 'unknown'}").`
      );
    }
    return picked;
  }

  async generateCharacter(
    req: GenerateCharacterRequest & { userId?: string | null }
  ): Promise<{ draft: PersistedCharacterData; meta: GenerateCharacterMeta }> {
    const conceptText = buildConceptText(req.prompt, req.answers);

    // 1. Core candidates via RAG (semantic search over the pack) + the pack's subclasses (SRD 5.2:
    //    exactly one per class), so the core pick knows which fixed subclass each class carries.
    const [classCands, raceCands, bgCands, allSubclasses] = await Promise.all([
      ...(['CLASS', 'RACE', 'BACKGROUND'] as const).map((kind) =>
        this.ruleitems.search({
          query: conceptText,
          packId: req.packId,
          kind,
          limit: CORE_CANDIDATE_LIMIT,
        })
      ),
      this.packSubclasses(req.packId),
    ]);
    if (!classCands.length || !raceCands.length || !bgCands.length) {
      throw new BadRequestException('Não há itens suficientes no pack para gerar um personagem.');
    }
    const subclassNameByClassId = new Map<string, string>();
    for (const c of classCands) {
      const sub = allSubclasses.find((s) => extractSubclassOfKey(s.normalized) === c.sourceKey);
      if (sub) subclassNameByClassId.set(c.id, sub.name);
    }

    // 2. LLM picks race/class/background + abilities + personality from the candidates.
    const core = await this.llm.structured({
      operation: 'generation.character',
      userId: req.userId,
      schema: llmCoreSchema,
      schemaName: 'character_core',
      system: CORE_SYSTEM,
      user: buildCoreUser(conceptText, classCands, raceCands, bgCands, subclassNameByClassId),
    });
    const classItem = this.resolveCandidate(
      'class',
      core.classRuleItemId,
      core.className,
      classCands
    );
    // Species and background get the SAME id -> name -> top-hit ladder as the class. They used to
    // fall straight to the top RAG hit, which is how "um feiticeiro humano" came back Dragonborn:
    // nothing cross-checked the pick, so a thematic swap was indistinguishable from a correct one.
    const raceItem = this.resolveCandidate(
      'species',
      core.raceRuleItemId,
      core.raceName,
      raceCands
    );
    const bgItem = this.resolveCandidate(
      'background',
      core.backgroundRuleItemId,
      core.backgroundName,
      bgCands
    );
    const adjustments = new AdjustmentLog();
    // Answers are free text, so one can be off-topic or impossible here. The model reports what it
    // could not use, but it over-reports: it lists answers it plainly obeyed, and each of those
    // reads as the app ignoring the user. So a report only survives two checks — the answer was TYPED (an option the
    // model wrote itself is by construction usable) and nothing in the draft reflects it — plus the
    // dedupe and cap, since the same typed line answers every question.
    const typedAnswers = new Set(
      (req.answers ?? [])
        .filter((a) => a.typed !== false)
        .map((a) => a.answer.trim().replace(/\s+/g, ' ').toLowerCase())
        .filter(Boolean)
    );
    const ignoredCandidates: string[] = [];
    const reportedAnswers = new Set<string>();
    for (const ignored of core.ignoredAnswers ?? []) {
      const text = ignored.trim().replace(/\s+/g, ' ');
      const key = text.toLowerCase();
      if (!text || reportedAnswers.has(key)) continue;
      reportedAnswers.add(key);
      this.logger.warn(`Generation: model reported it ignored the answer "${text}"`);
      if (!typedAnswers.has(key)) continue;
      ignoredCandidates.push(text);
    }
    const level = clampLevel(core.level);
    if (core.level !== level) {
      adjustments.add(
        `Você pediu nível ${core.level}, mas o D&D SRD vai só até 20. A ficha foi criada no nível ${level}.`
      );
    }
    // The AI's multiclass pick, validated against the SRD prerequisites and the level budget. An
    // illegal combination collapses to the initial class rather than failing the request, matching
    // how every other pick in this pipeline is topped up instead of rejected.
    const multiclass = await this.resolveMulticlass({
      packId: req.packId,
      core,
      classItem,
      classCands,
      backgroundItem: bgItem,
      totalLevel: level,
      adjustments,
    });
    // The array may have been permuted so the picked classes meet their 13s; everything downstream
    // (the loadout prompt, the ASI defaults, the assembled sheet) must use the repaired values.
    const attributes = multiclass.attributes;
    // SRD 5.2 ships exactly 1 subclass per class: level 3+ assigns the only option,
    // without an LLM call (same rule as the manual editor). Each class uses ITS OWN level.
    const subclassItem = await this.packSubclassForClass(
      req.packId,
      classItem,
      multiclass.initialClassLevel
    );

    // 3. Enumerate every choice menu from the picked rule items (same parsers the editor uses),
    //    and retrieve the pools each menu needs (spells, languages, weapons, feats, spell lists).
    //    Everything class-scoped is enumerated PER CLASS at ITS OWN level: reading only the initial
    //    class left a multiclass draft with no spells and no feature choices for the second one.
    const classOptions = extractClassChoiceOptions(classItem.normalized, classItem.sourceKey);
    const bgOptions = extractBackgroundChoiceOptions(bgItem.normalized);
    const raceChoices = extractRaceChoiceOptions(raceItem.normalized);

    const [standardLanguages, armors, weapons, feats, placeholderItems, shopItems] =
      await Promise.all([
        this.standardLanguages(req.packId),
        this.packArmors(req.packId),
        this.packWeapons(req.packId),
        this.packFeats(req.packId),
        this.packEquipmentPlaceholderItems(req.packId),
        this.packShopItems(req.packId),
      ]);

    const perClass = await Promise.all(
      multiclass.entries.map(async (entry) => {
        const item = entry.classItem;
        const spells = await this.classSpellPool(req.packId, item.name);
        const byLevel = new Map<number, string[]>();
        for (const s of spells) {
          const lvl = ruleItemSpellLevel(s);
          byLevel.set(lvl, [...(byLevel.get(lvl) ?? []), s.name]);
        }
        return {
          classItem: item,
          level: entry.level,
          limits: extractClassSpellLimits(item.normalized, item.sourceKey, entry.level),
          spells,
          spellsByLevel: byLevel,
          singles: extractClassFeatureChoices(item.normalized, entry.level),
          advanced: extractAdvancedClassChoices(item.normalized, entry.level),
          options: extractClassChoiceOptions(item.normalized, item.sourceKey),
        };
      })
    );
    const spellPoolAll = perClass[0].spells;
    const classSingles = perClass.flatMap((c) => c.singles);

    // Magic Initiate–style spell lists needed by the menus (background feat, Versatile, High Elf,
    // Blessed/Druidic Warrior). Fetched only when some menu actually consumes them.
    const neededLists = new Set<string>();
    for (const fn of bgOptions.featNames) {
      if (/magic initiate/i.test(fn)) {
        const m = fn.match(/\(([^)]+)\)/);
        const list = (m?.[1] ?? 'Wizard').trim();
        neededLists.add(list.charAt(0).toUpperCase() + list.slice(1).toLowerCase());
      }
    }
    // Versatile can take Magic Initiate, whose list is a free SRD choice: all three must be offered.
    if (raceChoices.hasVersatile)
      for (const list of MAGIC_INITIATE_SPELL_LISTS) neededLists.add(list);
    if (raceChoices.selectableTraits.some((t) => t.isElvenLineage)) neededLists.add('Wizard');
    for (const single of classSingles) {
      if (single.options.some((o) => o.key === 'blessed-warrior')) neededLists.add('Cleric');
      if (single.options.some((o) => o.key === 'druidic-warrior')) neededLists.add('Druid');
    }
    const spellListPools = new Map<string, { cantrips: string[]; level1: string[] }>();
    for (const list of neededLists) {
      const pool =
        list.toLowerCase() === classItem.name.trim().toLowerCase()
          ? spellPoolAll
          : await this.classSpellPool(req.packId, list);
      spellListPools.set(list, {
        cantrips: pool.filter((s) => ruleItemSpellLevel(s) === 0).map((s) => s.name),
        level1: pool.filter((s) => ruleItemSpellLevel(s) === 1).map((s) => s.name),
      });
    }
    // Pact of the Tome pools (any-list cantrips + level-1 rituals), only for invocation classes.
    let allCantripNames: string[] = [];
    let level1RitualNames: string[] = [];
    if (perClass.some((c) => c.advanced.invocations)) {
      const [cantrips, level1] = await Promise.all([
        this.ruleitems.findMany({
          packId: req.packId,
          type: 'SPELL',
          level: 0,
          limit: 200,
          includeRaw: false,
        }),
        this.ruleitems.findMany({
          packId: req.packId,
          type: 'SPELL',
          level: 1,
          limit: 400,
          includeRaw: false,
        }),
      ]);
      allCantripNames = cantrips.items.map((s) => s.name);
      level1RitualNames = level1.items
        .filter((s) => (s.normalized as { ritual?: unknown } | undefined)?.ritual === true)
        .map((s) => s.name);
    }

    /**
     * The offer for each casting class: its OWN list, capped at the levels IT can prepare. The
     * multiclass slot table grants slots above that, and the SRD says those only upcast, so a class
     * must never be offered a spell level its own table has not reached.
     */
    const castingClasses = perClass
      .filter((c) => c.limits.isSpellcaster)
      .map((c) => ({
        classRuleItemId: c.classItem.id,
        className: c.classItem.name,
        level: c.level,
        spellTagKey: spellClassTag(c.classItem.name),
        maxCantrips: c.limits.maxCantrips,
        maxPrepared: c.limits.maxLeveledSpells,
        maxSpellLevel: c.limits.maxSpellLevel,
        pool: c.spells.filter((s) => {
          const lvl = ruleItemSpellLevel(s);
          return lvl === 0 ? c.limits.maxCantrips > 0 : lvl <= c.limits.maxSpellLevel;
        }),
      }));
    // Union of every class's offer: one flat list for the prompt, deduped by name.
    const spellPool = (() => {
      const byName = new Map<string, RuleItemResponse>();
      for (const s of castingClasses.flatMap((c) => c.pool)) {
        const key = s.name.trim().toLowerCase();
        if (!byName.has(key)) byName.set(key, s);
      }
      return [...byName.values()];
    })();
    const languageOptions = standardLanguages
      .map((l) => l.name)
      .filter((n) => n.trim().toLowerCase() !== 'common');

    // A feat is offerable only when its own prerequisite text is satisfied. Evaluated with the SAME
    // shared parser the editor's feat picker uses, including the FEATURE requirements: a Warlock has
    // Pact Magic, not Spellcasting, so "Boon of Spell Recall" is not a legal pick for it, and the
    // derivation silently drops one that is offered anyway.
    const ownedFeatureNames = new Set(
      perClass.flatMap((c) =>
        (
          ((c.classItem.normalized as { features?: Array<{ name?: string }> } | undefined)
            ?.features ?? []) as Array<{ name?: string }>
        ).map((f) => (f.name ?? '').trim().toLowerCase())
      )
    );
    const meetsFeatPrerequisites = (feat: RuleItemResponse): boolean =>
      evaluateFeatPrerequisite(
        getFeatMeta(feat).prerequisite,
        { level } as CharacterFormData,
        attributes,
        ownedFeatureNames
      ).length === 0;

    const primaryAbility =
      [...DND_ABILITY_NAMES].sort((a, b) => (attributes[b] ?? 0) - (attributes[a] ?? 0))[0] ??
      'Strength';
    // The classes' OWN primary abilities (from the pack, not the array), best-scoring first: that is
    // the one the build already committed to, and the one every ASI point owes itself to first.
    const keyAbilities = [
      ...new Set(
        multiclass.entries.flatMap(
          (entry) => getClassPrimaryAbilities(entry.classItem)?.abilities ?? []
        )
      ),
    ].sort((a, b) => (attributes[b] ?? 0) - (attributes[a] ?? 0));

    const menuInput: MenuBuildInput = {
      level,
      classes: perClass.map((c) => ({
        classRuleItemId: c.classItem.id,
        className: c.classItem.name,
        level: c.level,
        classSingles: c.singles,
        advanced: c.advanced,
        classSpellsByLevel: c.spellsByLevel,
        classSkillPoolKeys:
          c.options.skillOptions.keys.length > 0
            ? c.options.skillOptions.keys
            : [...ALL_SKILL_KEYS],
      })),
      backgroundFixedSkillKeys: bgOptions.fixedSkillKeys,
      allSkillKeys: [...ALL_SKILL_KEYS],
      standardLanguageNames: languageOptions,
      weaponNames: weapons.map((w) => w.name),
      weaponIdByName: new Map(weapons.map((w) => [w.name.trim().toLowerCase(), w.id])),
      featsByType: {
        origin: feats.filter((f) => f.tagKeys.includes('feat:type:origin')),
        // Only feats this character actually qualifies for. Offering the rest let the ASI land on
        // e.g. Grappler with Strength 8, which the sheet then reads as an unmade choice.
        general: feats.filter(
          (f) => f.tagKeys.includes('feat:type:general') && meetsFeatPrerequisites(f)
        ),
        epicBoon: feats.filter(
          (f) => f.tagKeys.includes('feat:type:epic-boon') && meetsFeatPrerequisites(f)
        ),
        fightingStyle: feats.filter((f) => f.tagKeys.includes('feat:type:fighting-style')),
      },
      featIdByName: new Map(feats.map((f) => [f.name.trim().toLowerCase(), f.id])),
      race: raceChoices,
      backgroundFeatNames: bgOptions.featNames,
      spellListPools,
      allCantripNames,
      level1RitualNames,
      primaryAbility,
      keyAbilities,
    };
    const aiMenus = buildAiMenus(menuInput);

    // The shop is offered at the MOST gold any bundle pair could leave, because which bundle is taken
    // is decided by this very call. Whatever the model picks is re-priced against the gold it actually
    // ends up with, so an over-optimistic list simply buys less.
    const maxBundleGold = (bundles: EquipmentBundleOption[]) =>
      bundles.reduce((max, b) => Math.max(max, resolveEquipmentBundle(b.text).gold), 0);
    const shopBudget =
      maxBundleGold(classOptions.startingEquipment) + maxBundleGold(bgOptions.equipment);
    const shop = {
      goldAvailable: shopBudget,
      items: shopItems
        .map((i) => ({
          name: i.name,
          costGP: getItemCostGP(i.normalized as Record<string, unknown>),
        }))
        .filter((i): i is { name: string; costGP: number } => i.costGP != null && i.costGP > 0)
        .filter((i) => i.costGP <= shopBudget)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };

    // 4. LLM picks spells + every remaining build choice from those menus.
    const loadout = await this.llm.structured({
      operation: 'generation.character',
      userId: req.userId,
      schema: llmLoadoutSchema,
      schemaName: 'character_loadout',
      system: LOADOUT_SYSTEM,
      user: buildLoadoutUser(conceptText, {
        className: perClass.map((c) => `${c.classItem.name} ${c.level}`).join(' / '),
        level,
        attributes,
        spellPool,
        spellBudgets: castingClasses.map((c) => ({
          className: c.className,
          level: c.level,
          maxCantrips: c.maxCantrips,
          maxLeveledSpells: c.maxPrepared,
          maxSpellLevel: c.maxSpellLevel,
          spellNamesByLevel: (() => {
            const byLevel = new Map<number, string[]>();
            for (const spell of c.pool) {
              const level = ruleItemSpellLevel(spell);
              if (level < 1) continue;
              byLevel.set(level, [...(byLevel.get(level) ?? []), spell.name]);
            }
            return [...byLevel.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([level, names]) => ({ level, names }));
          })(),
        })),
        classSkill: classOptions.skillOptions,
        shop,
        classEquipment: classOptions.startingEquipment,
        backgroundEquipment: bgOptions.equipment,
        backgroundAbility: bgOptions.abilityScore,
        languageOptions,
        languagesToPick: DEFAULT_LANGUAGES_TO_PICK,
        aiMenus: aiMenus.map(({ id, prompt, options, pick }) => ({ id, prompt, options, pick })),
      }),
    });

    // 5. Validate every pick against its menu and resolve into persisted fields.
    const spellByName = new Map(spellPool.map((s) => [s.name.trim().toLowerCase(), s]));
    const pickedSpells = dedupe(
      loadout.spells
        .map((n) => spellByName.get(n.trim().toLowerCase()))
        .filter((s): s is RuleItemResponse => !!s)
    );
    // Place each pick with the SAME shared resolver the sheet and the save validation use (most
    // constrained first), then top up EACH class to its own table counts. Filling one flat pool left
    // the second class at 0/n and the draft unsaveable.
    const ownership = attributePickedSpells({
      spellsByLevel: {
        0: pickedSpells.filter((s) => ruleItemSpellLevel(s) === 0).map((s) => ({ name: s.name })),
        1: pickedSpells.filter((s) => ruleItemSpellLevel(s) >= 1).map((s) => ({ name: s.name })),
      },
      castingClasses,
      resolveSpell: (name) => spellByName.get(name.trim().toLowerCase()) ?? null,
    });
    const ownerOf = (spell: RuleItemResponse, isCantrip: boolean) =>
      ownership.ownerByRow.get(spellRowKey(isCantrip ? 0 : 1, spell.name)) ?? null;

    // The spells the model bothered to justify. Handed to the fill so that, when the per-level cap
    // has to drop some of its picks, the explained ones are the ones that stay on the sheet.
    const notedNames = new Set(
      loadout.spellNotes.map((n) => n.spell.trim().toLowerCase()).filter(Boolean)
    );
    const chosenByClass = fillSpellsPerClass({
      castingClasses,
      pickedSpells,
      ownerOf,
      notedNames,
    });
    const chosenSpells = flattenChosenSpells(chosenByClass, castingClasses.length > 1);
    const chosenCantrips = chosenByClass.flatMap((c) => c.cantrips);

    // Class skills PER CLASS: multiclassing gives each its own "choose N" from its own list (a
    // Barbarian 5 / Druid 2 owes 2 Barbarian skills AND 1 from the Druid's multiclass grant), and
    // filling only the initial class's budget left the sheet incomplete.
    const fixedSet = new Set(bgOptions.fixedSkillKeys);
    // Keen Senses offers only 3 skills, so it picks BEFORE the class does: the class list is far
    // wider, and letting it go first left an Elf Ranger with all three taken, which makes the race
    // grant duplicate a skill and the class end one short (a duplicate is exempt from its budget).
    const reservedRaceSkill = raceChoices.keenSensesSkillKeys.find((k) => !fixedSet.has(k)) ?? null;
    const modelSkillKeys = dedupe(loadout.classSkillKeys.map((k) => k.trim().toLowerCase()));
    const classSkillKeys: string[] = [];
    for (const cls of perClass) {
      const chooseN = cls.options.skillOptions.chooseN ?? 0;
      if (chooseN <= 0) continue;
      // Filtered against the canonical keys: the pack carries Open5e OCR typos ("In sight"), and a
      // skill key nothing recognises is picked but never counted, leaving the class one short.
      const offered = cls.options.skillOptions.keys.filter((k) =>
        (ALL_SKILL_KEYS as readonly string[]).includes(k)
      );
      const allowed = offered.length > 0 ? offered : [...ALL_SKILL_KEYS];
      const free = (k: string) =>
        !fixedSet.has(k) && !classSkillKeys.includes(k) && k !== reservedRaceSkill;
      classSkillKeys.push(
        ...topUp(
          modelSkillKeys.filter((k) => allowed.includes(k) && free(k)).slice(0, chooseN),
          allowed.filter(free),
          chooseN
        )
      );
    }
    const skills = dedupe([...bgOptions.fixedSkillKeys, ...classSkillKeys]);

    const backgroundAbilityScoreIncrease = resolveBackgroundAbilityIncrease(
      loadout.backgroundAbilityIncrease,
      bgOptions.abilityScore,
      multiclass.reservedBackgroundIncrease
    );

    const startingEquipmentSelectedIndex = resolveBundleIndex(
      loadout.startingEquipmentIndex,
      classOptions.startingEquipment
    );
    const backgroundEquipmentSelectedIndex = resolveBundleIndex(
      loadout.backgroundEquipmentIndex,
      bgOptions.equipment
    );
    const classBundle =
      startingEquipmentSelectedIndex != null
        ? resolveEquipmentBundle(
            classOptions.startingEquipment[startingEquipmentSelectedIndex].text
          )
        : { items: [], gold: 0 };
    const bgBundle =
      backgroundEquipmentSelectedIndex != null
        ? resolveEquipmentBundle(bgOptions.equipment[backgroundEquipmentSelectedIndex].text)
        : { items: [], gold: 0 };
    // The bundle each item came from is RECORDED here, at the only moment it is known for sure.
    // Re-deriving it later from the text cannot attribute a resolved placeholder (the bundle says
    // "Musical Instrument of your choice", the item says "Musical Instrument, Lute"), so those rows
    // used to land under "Additional equipment" instead of inside their own bundle.
    // Gear bought with the leftover coin, so a draft arrives outfitted instead of sitting on a purse.
    // The spend comes off the bundles in order, keeping `goldBySource` equal to the wallet: each block
    // then shows the coin that source still has, which is what the sheet is displaying.
    const purse = classBundle.gold + bgBundle.gold;
    const tookTheGold = classBundle.items.length === 0;
    const bought = resolvePurchases(loadout.purchases, shop.items, purse, !tookTheGold);
    const purchased = tookTheGold
      ? topUpStartingGear({
          bought: bought.items,
          spentGP: bought.spentGP,
          goldAvailable: purse * MAX_PURCHASE_SHARE_GOLD_ONLY,
          shop: shop.items,
          armors,
          weapons,
          armorTraining:
            (classItem.normalized as { multiclassing?: { grants?: { armorTraining?: string } } })
              ?.multiclassing?.grants?.armorTraining ?? '',
        })
      : bought;
    const equipmentItems: Array<{ name: string; quantity: number; source: EquipmentSource }> = [
      ...resolveEquipmentPlaceholders(
        [
          ...classBundle.items.map((i) => ({ ...i, source: 'class' as EquipmentSource })),
          ...bgBundle.items.map((i) => ({ ...i, source: 'background' as EquipmentSource })),
        ],
        placeholderItems
      ),
      ...purchased.items,
    ];
    // Each bundle keeps the gold it granted; the purchase shows up in the TOTAL, never by eating a
    // bundle's line. That is how manual creation behaves: the "9 GP" the class gave stays 9 GP, and
    // the amount actually available drops. Rounded to copper so a fractional price cannot leave
    // 0.30000000000000004 on the sheet.
    const roundToCopper = (gp: number) => Math.round(gp * 100) / 100;
    const gold = roundToCopper(purse - purchased.spentGP);
    const goldBySource = { class: classBundle.gold, background: bgBundle.gold };
    const { equippedArmorId, equippedShieldId } = resolveEquippedArmor(equipmentItems, armors);

    const langByName = new Map(standardLanguages.map((l) => [l.name.trim().toLowerCase(), l]));
    const common = langByName.get('common');
    const pickedNames = dedupe(
      loadout.languageNames
        .map((n) => langByName.get(n.trim().toLowerCase())?.name)
        .filter((n): n is string => !!n && n.trim().toLowerCase() !== 'common')
    ).slice(0, DEFAULT_LANGUAGES_TO_PICK);
    // Top up to the target count from the offered standard languages so the choice is complete.
    const languageNames = topUp(pickedNames, languageOptions, DEFAULT_LANGUAGES_TO_PICK);
    const languages = [
      { ruleItemId: common?.id ?? null, name: common?.name ?? 'Common' },
      ...languageNames.map((n) => ({
        ruleItemId: langByName.get(n.toLowerCase())?.id ?? null,
        name: n,
      })),
    ];

    // 6. Validate + apply every feature-choice menu (feats, lineages, Expertise, Metamagic, ASI, …)
    //    into the persisted `featureChoices` shape. Invalid picks fall back to the menu's own options.
    const featureChoices = applyAiMenus(aiMenus, loadout.menuSelections, {
      finalSkills: skills,
      knownLanguages: languages.map((l) => l.name),
      chosenCantripNames: chosenCantrips.map((s) => s.name),
      // Includes the background increase: the ASI cap of 20 counts it, so routing points without it
      // would still overshoot.
      baseAttributes: Object.fromEntries(
        DND_ABILITY_NAMES.map((a) => [
          a,
          (attributes[a] ?? 10) + (backgroundAbilityScoreIncrease[a] ?? 0),
        ])
      ),
    });

    // Spellbook caster (Wizard): its prepared spells must live in the spellbook, so persist a book
    // holding at least those, topped up to the known-spells count. Capacity follows the WIZARD's
    // level, not the character's, and the book is stocked from the WIZARD's own list.
    let wizardSpellbookByLevel: Record<number, string[]> | undefined;
    const spellbookClass = perClass.find((c) => {
      const markers =
        ((c.classItem.normalized as { mechanics?: { markers?: unknown } } | undefined)?.mechanics
          ?.markers as string[] | undefined) ?? [];
      return markers.includes(CLASS_MARKER_SPELLBOOK_CASTER);
    });
    if (spellbookClass) {
      const own = chosenByClass.find((c) => c.classRuleItemId === spellbookClass.classItem.id);
      const bookMax = 6 + (spellbookClass.level - 1) * 2;
      const bookSpells = [...(own?.leveled ?? [])];
      const seen = new Set(bookSpells.map((s) => s.id));
      for (const s of spellbookClass.spells) {
        if (bookSpells.length >= bookMax) break;
        const lvl = ruleItemSpellLevel(s);
        if (lvl < 1 || lvl > spellbookClass.limits.maxSpellLevel || seen.has(s.id)) continue;
        seen.add(s.id);
        bookSpells.push(s);
      }
      wizardSpellbookByLevel = {};
      for (const s of bookSpells) {
        const lvl = ruleItemSpellLevel(s);
        if (lvl < 1) continue;
        (wizardSpellbookByLevel[lvl] ??= []).push(s.name);
      }
    }

    // Each class reaches its own subclass at ITS level 3, so a short dip has none.
    const subclassIdByIndex = await Promise.all(
      multiclass.entries.map(async (entry, index) =>
        index === 0
          ? (subclassItem?.id ?? null)
          : ((await this.packSubclassForClass(req.packId, entry.classItem, entry.level))?.id ??
            null)
      )
    );
    const persistedClasses = multiclass.entries.map((entry, index) => ({
      classRuleItemId: entry.classItem.id,
      subclassRuleItemId: subclassIdByIndex[index],
      level: entry.level,
    }));

    // 7. Fill what only a real derivation can see: the tool slots the class/background open, and the
    //    spells that arrive AUTO-GRANTED (subclass tables, Magic Initiate, lineages). Granted rows do
    //    not count toward a class allowance, so a pick that duplicates one silently leaves the sheet
    //    short and unsaveable. Runs the SAME shared pipeline the backend save runs.
    const classEntries = multiclass.entries.map((entry, index) => ({
      classItem: entry.classItem,
      subclassItem: subclassIdByIndex[index]
        ? (allSubclasses.find((s) => s.id === subclassIdByIndex[index]) ?? null)
        : null,
      level: entry.level,
    }));
    const derivedGaps = await this.resolveDerivedGaps({
      packId: req.packId,
      classEntries,
      raceItem,
      backgroundItem: bgItem,
      feats,
      fightingStyleFeats: feats.filter((f) => f.tagKeys.includes('feat:type:fighting-style')),
      draftBase: {
        core,
        attributes,
        level,
        raceId: raceItem.id,
        classId: classItem.id,
        subclassId: subclassItem?.id ?? null,
        classes: persistedClasses,
        backgroundId: bgItem.id,
        spells: chosenSpells,
        skills,
        backgroundAbilityScoreIncrease,
        languages,
        tools: [],
        equipmentItems,
        goldBySource,
        gold,
        startingEquipmentSelectedIndex,
        backgroundEquipmentSelectedIndex,
        equippedArmorId,
        equippedShieldId,
        featureChoices,
        wizardSpellbookByLevel,
      },
    });
    // Everything the derivation filled lands in `featureChoices`, like every other feature choice.
    if (derivedGaps.evocationSavantSpellbookByLevel) {
      featureChoices['Evocation Savant'] = {
        ...(featureChoices['Evocation Savant'] ?? {}),
        spellbookByLevel: derivedGaps.evocationSavantSpellbookByLevel,
      };
    }
    for (const [featureName, option] of Object.entries(derivedGaps.subclassOptionPicks ?? {})) {
      if (featureChoices[featureName]?.option) continue;
      featureChoices[featureName] = { ...(featureChoices[featureName] ?? {}), option };
    }
    if (derivedGaps.bonusProficienciesSkillKeys?.length) {
      featureChoices['Bonus Proficiencies'] = {
        ...(featureChoices['Bonus Proficiencies'] ?? {}),
        skillKeys: derivedGaps.bonusProficienciesSkillKeys,
      };
    }
    if (derivedGaps.additionalFightingStyleFeatId) {
      featureChoices['Additional Fighting Style'] = {
        ...(featureChoices['Additional Fighting Style'] ?? {}),
        featId: derivedGaps.additionalFightingStyleFeatId,
      };
    }
    if (derivedGaps.magicalDiscoveriesSpellNames?.length) {
      featureChoices['Magical Discoveries'] = {
        ...(featureChoices['Magical Discoveries'] ?? {}),
        spellNames: derivedGaps.magicalDiscoveriesSpellNames,
      };
    }

    // Re-fill each class's allowance, now skipping the names it receives for free.
    const finalSpells = flattenChosenSpells(
      fillSpellsPerClass({
        castingClasses: castingClasses.map((c) => ({
          ...c,
          maxCantrips: Math.max(
            c.maxCantrips,
            derivedGaps.maxCantripsByClass?.[c.classRuleItemId] ?? 0
          ),
        })),
        pickedSpells,
        ownerOf,
        notedNames,
        excludeNames: derivedGaps.grantedSpellNames,
      }),
      castingClasses.length > 1
    );

    // 8. Assemble + validate against the persisted schema.
    const draft = assembleDraft({
      core,
      attributes,
      level,
      raceId: raceItem.id,
      classId: classItem.id,
      subclassId: subclassItem?.id ?? null,
      classes: persistedClasses,
      backgroundId: bgItem.id,
      spells: finalSpells,
      skills,
      backgroundAbilityScoreIncrease,
      languages,
      tools: derivedGaps.tools,
      equipmentItems,
      goldBySource,
      gold,
      startingEquipmentSelectedIndex,
      backgroundEquipmentSelectedIndex,
      equippedArmorId,
      equippedShieldId,
      featureChoices,
      wizardSpellbookByLevel,
    });
    const parsed = persistedCharacterDataSchema.safeParse(draft);
    if (!parsed.success) {
      this.logger.error(
        `assembled draft invalid: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`
      );
      throw new Error('O rascunho gerado ficou inválido. Tente novamente.');
    }

    // Last check on the "I could not use this" notes: an answer the sheet visibly reflects (a class,
    // the species, the background or the level it names) WAS used, whatever the model claims.
    {
      const shown = [
        raceItem.name,
        bgItem.name,
        ...multiclass.entries.map((e) => e.classItem.name),
      ].map((n) => n.trim().toLowerCase());
      const levels = multiclass.entries.map((e) => String(e.level));
      levels.push(String(level));
      for (const text of ignoredCandidates) {
        const lower = text.toLowerCase();
        const reflected =
          shown.some((n) => n && lower.includes(n)) ||
          levels.some((n) => new RegExp(`\b${n}\b`).test(lower));
        if (reflected) {
          this.logger.warn(
            `Generation: dropped the "ignored answer" note for "${text}" (the sheet reflects it)`
          );
          continue;
        }
        if (adjustments.count >= MAX_REPORTED_IGNORED_ANSWERS + 2) break;
        adjustments.add(
          `Não consegui usar a resposta “${text.length > 120 ? `${text.slice(0, 117)}…` : text}”, então segui pelo conceito que você descreveu.`
        );
      }
    }

    // What the concept asked for that this pack does not have. Same two guards as the ignored
    // answers, for the same reason: the model over-reports, and a note naming something the sheet
    // actually carries reads worse than no note at all.
    {
      const onSheet = [
        raceItem.name,
        bgItem.name,
        ...multiclass.entries.map((e) => e.classItem.name),
      ].map((n) => n.trim().toLowerCase());
      let reported = 0;
      const seen = new Set<string>();
      for (const raw of core.unavailableRequests ?? []) {
        const text = raw.trim();
        if (!text || reported >= MAX_REPORTED_UNAVAILABLE) continue;
        const lower = text.toLowerCase();
        // The model reported the same name twice, differing only in case ("Artificer"/"artificer").
        if (seen.has(lower)) continue;
        seen.add(lower);
        if (onSheet.some((n) => n && (lower.includes(n) || n.includes(lower)))) {
          this.logger.warn(
            `Generation: dropped the "unavailable" note for "${text}" (the sheet carries it)`
          );
          continue;
        }
        reported += 1;
        adjustments.add(
          // States the identity actually built instead of guessing WHICH slot the request was for:
          // the model reports a bare name ("Tabaxi"), not the category it belongs to.
          `Este sistema não tem “${text.length > 60 ? `${text.slice(0, 57)}…` : text}”, então a ficha ficou com ${raceItem.name} / ${classItem.name} / ${bgItem.name}.`
        );
      }
    }

    const meta = {
      name: core.name,
      raceName: raceItem.name,
      className: classItem.name,
      backgroundName: bgItem.name,
      // The loadout call knows every final pick (spells, features, feats), so its summary can
      // justify each choice; the core summary is only a fallback.
      summary: loadout.summary?.trim() || core.summary,
      // Reasons render inside plain tooltips: strip any Markdown the model added anyway.
      decisions: withPurchaseNote(
        loadout.decisions
          .map((d) => ({
            area: d.area,
            points: d.points.map((p) => stripInlineMarkdown(p)).filter((p) => p.length > 0),
          }))
          .filter((d) => d.points.length > 0),
        purchased
      ),
      // Only keep notes anchored to a spell actually on the sheet (dedupe by spell name).
      spellNotes: (() => {
        const onSheet = new Set(finalSpells.map((s) => s.spell.name.trim().toLowerCase()));
        const seen = new Set<string>();
        const out: { spell: string; reason: string }[] = [];
        let dropped = 0;
        for (const n of loadout.spellNotes) {
          const key = n.spell.trim().toLowerCase();
          if (!onSheet.has(key)) dropped += 1;
          const reason = stripInlineMarkdown(n.reason);
          if (!onSheet.has(key) || seen.has(key) || !reason) continue;
          seen.add(key);
          out.push({ spell: n.spell.trim(), reason });
        }
        if (dropped > 0) {
          // The model justified spells it did not end up picking. Worth seeing: it means the prompt
          // and the final list disagree, which is how a sheet ends up with no explanations at all.
          this.logger.warn(
            `Generation: ${dropped} spell note(s) referenced spells not on the sheet`
          );
        }
        return out;
      })(),
      adjustments: adjustments.list(),
    };

    return {
      draft: this.withDerivedCombat(parsed.data, {
        classEntries,
        raceItem,
        backgroundItem: bgItem,
        feats,
      }),
      meta,
    };
  }

  /**
   * Fills the draft's deterministic combat block through the same shared read-path the editor and
   * the save use. Without it the endpoint answered `maxHp: 0` for a character whose class, level and
   * armor were already decided.
   */
  private withDerivedCombat(
    draft: PersistedCharacterData,
    params: {
      classEntries: Array<{
        classItem: RuleItemResponse;
        subclassItem: RuleItemResponse | null;
        level: number;
      }>;
      raceItem: RuleItemResponse;
      backgroundItem: RuleItemResponse;
      feats: RuleItemResponse[];
    }
  ): PersistedCharacterData {
    try {
      const form = mergeCharacterFormDataFromApi(draft, PERSISTED_CHARACTER_SCHEMA_VERSION);
      const derived = getDerivedFromRuleItems({
        classes: params.classEntries,
        raceItem: params.raceItem,
        backgroundItem: params.backgroundItem,
        feats: params.feats,
      });
      const withDerived = applyDerivedToCharacterData(form, derived, params.feats);
      // A brand-new character starts at full health, like the editor's creation mode.
      const withCombat = applyCombatFromAttributes(withDerived, params.feats, {
        fillCurrentHpToMax: true,
      });
      return {
        ...draft,
        combat: {
          ...draft.combat,
          maxHp: withCombat.maxHp,
          currentHp: withCombat.currentHp,
          // The UNARMORED base (10 + Dex) on purpose: `assembleArmorClass` reads this field back as
          // the base, so the final AC here would corrupt it the moment armor is unequipped.
          armorClass: withCombat.armorClass,
          initiative: withCombat.initiative,
          speed: withCombat.speed,
        },
      };
    } catch (err) {
      // Best-effort like every derivation step here: the editor still derives on load.
      this.logger.warn(
        `Generation: combat derivation failed for the draft: ${err instanceof Error ? err.message : String(err)}`
      );
      return draft;
    }
  }

  /**
   * Runs the draft through the same shared read-path the save runs, to report what only a derivation
   * knows: which spells arrive auto-granted (they never count toward a class allowance, so a
   * duplicate pick leaves the sheet short) and which tool slots are still open.
   *
   * Best effort: a failure returns empty gaps rather than failing the request.
   */
  private async resolveDerivedGaps(params: {
    packId: string;
    classEntries: Array<{
      classItem: RuleItemResponse;
      subclassItem: RuleItemResponse | null;
      level: number;
    }>;
    raceItem: RuleItemResponse;
    backgroundItem: RuleItemResponse;
    feats: RuleItemResponse[];
    /** Fighting Style feats, for the Champion's SECOND style. */
    fightingStyleFeats: RuleItemResponse[];
    draftBase: Parameters<typeof assembleDraft>[0];
  }): Promise<{
    grantedSpellNames: Set<string>;
    tools: Array<{ ruleItemId: string | null; name: string }>;
    evocationSavantSpellbookByLevel?: Record<number, string[]>;
    /** Subclass option cards, by feature display name (persisted as `{ option }`). */
    subclassOptionPicks?: Record<string, string>;
    bonusProficienciesSkillKeys?: string[];
    magicalDiscoveriesSpellNames?: string[];
    additionalFightingStyleFeatId?: string | null;
    /** Per-class cantrip allowance AFTER the feature choices, keyed by class rule-item id. */
    maxCantripsByClass?: Record<string, number>;
  }> {
    const empty = { grantedSpellNames: new Set<string>(), tools: [] };
    try {
      const [allSpells, toolItems] = await Promise.all([
        this.allPackSpells(params.packId),
        this.packToolItems(params.packId),
      ]);
      const provisional = assembleDraft(params.draftBase);
      const form = mergeCharacterFormDataFromApi(provisional, PERSISTED_CHARACTER_SCHEMA_VERSION);
      const derived = getDerivedFromRuleItems({
        classes: params.classEntries,
        raceItem: params.raceItem,
        backgroundItem: params.backgroundItem,
        feats: params.feats,
      });
      const withDerived = applyDerivedToCharacterData(form, derived, params.feats);

      // Subclass option cards (Circle of the Land, Hunter's Prey, Fiendish Resilience, …). The AI
      // menus cover CLASS features; a subclass one would otherwise arrive pending on every draft
      // that reaches level 3. Deterministic first option, same policy as every other top-up.
      const subclassOptionPicks: Record<string, string> = {};
      for (const feature of withDerived.featureDetails ?? []) {
        if (feature.source !== 'subclass') continue;
        const options = feature.options ?? [];
        if (options.length < 2) continue;
        if (withDerived.raceTraitSelections?.[feature.name]) continue;
        const key = options[0]?.key;
        if (key) subclassOptionPicks[feature.name] = key;
      }

      // AFTER the option cards: a land choice decides which always-prepared spells the subclass
      // grants, so computing the granted set first left the Druid's picks colliding with them.
      const withChoices = {
        ...withDerived,
        raceTraitSelections: { ...(withDerived.raceTraitSelections ?? {}), ...subclassOptionPicks },
      };
      const grantedSpellNames = new Set(
        computeGrantedSpellPlacements(
          withChoices,
          buildSpellLookupByParsedName(allSpells),
          allSpells.length > 0
        ).map((p) => p.name.trim().toLowerCase())
      );

      // Additional Fighting Style (Champion 10): a SECOND Fighting Style feat, never the base pick.
      let additionalFightingStyleFeatId: string | null = null;
      if (
        (withDerived.featureDetails ?? []).some(
          (f) => f.name.trim().toLowerCase() === 'additional fighting style'
        )
      ) {
        additionalFightingStyleFeatId =
          params.fightingStyleFeats.find(
            (f) => !getAllFightingStyleFeatIds(withDerived).includes(f.id)
          )?.id ?? null;
      }

      // Magical Discoveries (Lore Bard): 2 spells from the Cleric/Druid/Wizard lists, castable now.
      // Skips anything already on the sheet, and its picks JOIN the granted set below: these are
      // always-prepared rows, so a class pick that duplicates one stops counting toward its budget.
      const magicalDiscoveriesSpellNames: string[] = [];
      if (
        (withDerived.featureDetails ?? []).some(
          (f) => f.name.trim().toLowerCase() === 'magical discoveries'
        )
      ) {
        const tags = MAGICAL_DISCOVERIES_SPELL_LISTS.map(spellClassTag);
        const maxLevel = fullCasterMaxSpellLevel(withDerived.level ?? 1);
        for (const spell of allSpells) {
          if (magicalDiscoveriesSpellNames.length >= MAGICAL_DISCOVERIES_SPELL_PICKS) break;
          if (!spell.tagKeys.some((t) => tags.includes(t))) continue;
          if (ruleItemSpellLevel(spell) > maxLevel) continue;
          if (grantedSpellNames.has(spell.name.trim().toLowerCase())) continue;
          magicalDiscoveriesSpellNames.push(spell.name);
        }
      }

      // Bonus Proficiencies (Lore Bard): 3 skills the character is not already proficient in.
      const bonusProficienciesSkillKeys: string[] = [];
      if (
        (withDerived.featureDetails ?? []).some(
          (f) => f.name.trim().toLowerCase() === 'bonus proficiencies'
        )
      ) {
        for (const key of ALL_SKILL_KEYS) {
          if (bonusProficienciesSkillKeys.length >= BONUS_PROFICIENCIES_SKILL_PICKS) break;
          if (withDerived.skillProficiencies?.[key]) continue;
          bonusProficienciesSkillKeys.push(key);
        }
      }

      // Evocation Savant (Evoker): free Evocation spells in their own spellbook bucket. Not an LLM
      // menu (a subclass choice), but a fixed count from a fixed pool, so it is filled here rather
      // than shipped as a pending choice on every Wizard 3+ draft.
      const savantFeature = (withDerived.featureDetails ?? []).find(
        (f) => f.name.trim().toLowerCase() === 'evocation savant'
      );
      let evocationSavantSpellbookByLevel: Record<number, string[]> | undefined;
      if (savantFeature) {
        const wizardLevel = featureClassLevel(withDerived, savantFeature);
        const wanted = evocationSavantFreeSpellCount(wizardLevel);
        const maxLevel = fullCasterMaxSpellLevel(wizardLevel);
        const already = new Set(
          Object.values(withDerived.wizardSpellbookByLevel ?? {})
            .flat()
            .map((n) => String(n).trim().toLowerCase())
        );
        const picks = allSpells
          .filter(
            (s) =>
              s.tagKeys.includes(spellClassTag('Wizard')) &&
              s.tagKeys.includes('spell:school:evocation') &&
              ruleItemSpellLevel(s) >= 1 &&
              ruleItemSpellLevel(s) <= maxLevel &&
              !already.has(s.name.trim().toLowerCase())
          )
          .slice(0, wanted);
        if (picks.length > 0) {
          evocationSavantSpellbookByLevel = {};
          for (const s of picks) {
            (evocationSavantSpellbookByLevel[ruleItemSpellLevel(s)] ??= []).push(s.name);
          }
        }
      }

      // A "Choose N <category>" slot is satisfied by naming a real tool: the save path seeds the
      // persisted flat list back into its slot.
      const tools: Array<{ ruleItemId: string | null; name: string }> = [];
      for (const pending of getPendingToolProficiencyChoices(withDerived)) {
        // Matched by the parsed category TAG, not the label: the pack names instruments "Bagpipes",
        // "Drum", "Lute", so a "Musical Instruments" name match finds nothing.
        const tags = parseToolProficiencyChoose(pending.segment)?.categoryTags ?? [];
        const matches = toolItems.filter((t) => t.tagKeys.some((k) => tags.includes(k)));
        const pool = matches.length > 0 ? matches : toolItems;
        let added = 0;
        for (const item of pool) {
          if (added >= pending.chooseN) break;
          if (tools.some((t) => t.ruleItemId === item.id)) continue;
          tools.push({ ruleItemId: item.id, name: item.name });
          added += 1;
        }
      }
      // Both fills above are ALWAYS-PREPARED rows, so they join the granted set: a class pick that
      // duplicates one stops counting toward its budget.
      for (const name of [
        ...magicalDiscoveriesSpellNames,
        ...Object.values(evocationSavantSpellbookByLevel ?? {}).flat(),
      ]) {
        grantedSpellNames.add(String(name).trim().toLowerCase());
      }

      // A class-feature OPTION can raise the cantrip allowance (Cleric Divine Order -> Thaumaturge,
      // Druid Primal Order -> Magician). The class table cannot know the pick and the pick is made in
      // this same loadout call, so the extra is only visible once the sheet is derived: a Thaumaturge
      // Cleric 17 shipped 5 of the 6 cantrips it owed and was rejected. Read from the SAME shared
      // function the save validation reads it from, never from a local feature-name list.
      const maxCantripsByClass: Record<string, number> = {};
      for (const c of getCastingClasses(
        withDerived,
        params.classEntries.map((e) => e.classItem)
      )) {
        maxCantripsByClass[c.classRuleItemId] = c.maxCantrips;
      }

      return {
        grantedSpellNames,
        tools,
        maxCantripsByClass,
        evocationSavantSpellbookByLevel,
        subclassOptionPicks,
        bonusProficienciesSkillKeys,
        magicalDiscoveriesSpellNames,
        additionalFightingStyleFeatId,
      };
    } catch (error) {
      this.logger.warn(
        `Generation: could not derive the draft to fill its gaps (${error instanceof Error ? error.message : String(error)}).`
      );
      return empty;
    }
  }

  /**
   * Validates the AI's multiclass pick and returns the final class list plus the attributes to use.
   *
   * Prerequisites are REPAIRED, not punished: the standard array is a fixed multiset, so its values
   * are permuted to give every required primary ability the highest ones. Only a pick that cannot be
   * repaired (unknown id, levels that do not add up) degrades to the single initial class.
   */
  private async resolveMulticlass(params: {
    packId: string;
    core: LlmCore;
    classItem: RuleItemResponse;
    classCands: RuleItemResponse[];
    backgroundItem: RuleItemResponse;
    totalLevel: number;
    adjustments: AdjustmentLog;
  }): Promise<{
    initialClassLevel: number;
    entries: Array<{ classItem: RuleItemResponse; level: number }>;
    attributes: LlmCore['attributes'];
    /** Background points already promised to a class prerequisite (see `planPrerequisiteReserve`). */
    reservedBackgroundIncrease: Record<string, number>;
  }> {
    const single = {
      initialClassLevel: params.totalLevel,
      entries: [{ classItem: params.classItem, level: params.totalLevel }],
      attributes: normalizeAbilityArray(params.core.attributes, [params.classItem]),
      reservedBackgroundIncrease: {},
    };
    // Resolved by id first, by NAME second. Every drop below states its own reason: a collapsed
    // multiclass that reports "the combination is illegal" when the real cause was an unmatched id
    // tells the user something false about their concept.
    const resolved = (params.core.additionalClasses ?? []).map((entry) => {
      const byId = params.classCands.find((c) => c.id === entry.classRuleItemId) ?? null;
      const classItem = byId ?? matchCandidateByName(entry.className, params.classCands);
      return {
        entry,
        classItem,
        matchedByName: !byId && classItem !== null,
        level: Math.max(1, Math.floor(entry.level || 0)),
      };
    });
    for (const r of resolved) {
      if (!r.classItem) {
        this.logger.warn(
          `Generation: additional class "${r.entry.className}" (id "${r.entry.classRuleItemId}") is not among the candidates; dropped.`
        );
        params.adjustments.add(
          `Não consegui incluir ${r.entry.className || 'a segunda classe'} na multiclasse, então a ficha ficou só com ${params.classItem.name}.`
        );
        continue;
      }
      // Not an adjustment: the class the model asked for IS on the sheet, as the initial one.
      if (r.classItem.id === params.classItem.id) {
        this.logger.warn(
          `Generation: additional class "${r.classItem.name}" repeats the initial class; dropped.`
        );
        continue;
      }
      if (r.matchedByName) {
        this.logger.warn(
          `Generation: additional class id "${r.entry.classRuleItemId}" matched no candidate; resolved "${r.entry.className}" by name.`
        );
      }
    }
    const usable = resolved.filter(
      (r): r is typeof r & { classItem: RuleItemResponse } =>
        r.classItem !== null && r.classItem.id !== params.classItem.id
    );
    const extras = usable
      .slice(0, MAX_MULTICLASS_CLASSES - 1)
      .map((r) => ({ classItem: r.classItem, level: r.level }));
    for (const dropped of usable.slice(MAX_MULTICLASS_CLASSES - 1)) {
      params.adjustments.add(
        `A ficha combina no máximo ${MAX_MULTICLASS_CLASSES} classes, então ${dropped.classItem.name} ficou de fora.`
      );
    }
    if (extras.length === 0) return single;

    // The split is REPAIRED, never used as a reason to throw the multiclass away: a third class made
    // the model's levels stop adding up, and collapsing on that returned a single-class sheet to
    // someone who had asked for three. The initial class absorbs the remainder; when the extras
    // alone overflow the total, the last ones give levels back until everyone has at least 1.
    const stated = Math.floor(params.core.initialClassLevel || 0);
    const requested = extras.map((e) => e.level);
    let initialLevel = stated > 0 ? stated : params.totalLevel - sumOf(requested);
    if (initialLevel + sumOf(extras.map((e) => e.level)) !== params.totalLevel) {
      initialLevel = params.totalLevel - sumOf(extras.map((e) => e.level));
    }
    for (let i = extras.length - 1; i >= 0 && initialLevel < 1; i -= 1) {
      const giveBack = Math.min(extras[i].level - 1, 1 - initialLevel);
      extras[i].level -= giveBack;
      initialLevel += giveBack;
    }
    // Not enough levels for one per class (level 2 with three classes): the tail is dropped.
    while (initialLevel < 1 && extras.length > 0) {
      const dropped = extras.pop();
      if (!dropped) break;
      initialLevel += dropped.level;
      params.adjustments.add(
        `O nível ${params.totalLevel} não dá para dividir entre todas as classes pedidas, então ${dropped.classItem.name} ficou de fora.`
      );
    }
    if (extras.length === 0) return single;
    if (
      stated > 0 &&
      (initialLevel !== stated || extras.some((e, i) => e.level !== requested[i]))
    ) {
      params.adjustments.add(
        `A divisão de níveis não fechava com o nível ${params.totalLevel}, então ajustei para ${[
          `${params.classItem.name} ${initialLevel}`,
          ...extras.map((e) => `${e.classItem.name} ${e.level}`),
        ].join(' / ')}.`
      );
    }

    // Prerequisites: the 13s are checked on the FINAL scores, so the background increase counts.
    // Three classes need four 13s and the array alone tops out at 15/14/13/12, so without this a
    // legal Fighter + Paladin + Ranger was rejected by one point.
    const backgroundOption = extractBackgroundChoiceOptions(
      params.backgroundItem.normalized
    ).abilityScore;
    while (extras.length > 0) {
      const classItems = [params.classItem, ...extras.map((e) => e.classItem)];
      const attributes = normalizeAbilityArray(params.core.attributes, classItems);
      const reservedBackgroundIncrease = planPrerequisiteReserve(
        attributes,
        classItems,
        backgroundOption
      );
      const withReserve = { ...attributes } as LlmCore['attributes'];
      for (const [ability, amount] of Object.entries(reservedBackgroundIncrease)) {
        withReserve[ability as keyof LlmCore['attributes']] =
          (withReserve[ability as keyof LlmCore['attributes']] ?? 10) + amount;
      }
      if (getMulticlassCombinationErrors({ attributes: withReserve, classItems }).length === 0) {
        return {
          initialClassLevel: initialLevel,
          entries: [{ classItem: params.classItem, level: initialLevel }, ...extras],
          attributes,
          reservedBackgroundIncrease,
        };
      }
      // Drop the LAST class asked for, not the whole multiclass: two of the three still fit.
      const dropped = extras.pop();
      if (!dropped) break;
      initialLevel += dropped.level;
      this.logger.warn(
        `Generation: prerequisites of ${classItems.map((c) => c.name).join(' + ')} do not fit the standard array; dropping ${dropped.classItem.name}.`
      );
      params.adjustments.add(
        `${classItems.map((c) => c.name).join(' + ')} exigiriam 13 em atributos demais ao mesmo tempo, então ${dropped.classItem.name} ficou de fora.`
      );
    }
    return single;
  }

  /** The class's subclass in the pack (`subclassOf.key`); null below the unlock level (3). */
  private async packSubclassForClass(
    packId: string,
    classItem: RuleItemResponse,
    level: number
  ): Promise<RuleItemResponse | null> {
    if (level < SUBCLASS_UNLOCK_LEVEL) return null;
    const subclasses = await this.packSubclasses(packId);
    return (
      subclasses.find((s) => extractSubclassOfKey(s.normalized) === classItem.sourceKey) ?? null
    );
  }

  /** All SUBCLASS rows in the pack (SRD 5.2: exactly one per class). */
  private async packSubclasses(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'SUBCLASS',
      limit: 100,
      includeRaw: false,
    });
    return res.items;
  }

  /**
   * Compact inventory of the pack's real content (classes with their single subclass, species,
   * backgrounds) — grounds the clarifying questions so they never offer non-existent options.
   */
  private async buildPackInventoryBlock(packId: string): Promise<string> {
    const list = (type: 'CLASS' | 'RACE' | 'BACKGROUND') =>
      this.ruleitems.findMany({ packId, type, limit: 100, includeRaw: false });
    const [classesRes, racesRes, bgsRes, subclasses] = await Promise.all([
      list('CLASS'),
      list('RACE'),
      list('BACKGROUND'),
      this.packSubclasses(packId),
    ]);
    const subclassByClassKey = new Map(
      subclasses.map((s) => [extractSubclassOfKey(s.normalized), s.name])
    );
    const classLines = classesRes.items
      .map((c) => {
        const sub = subclassByClassKey.get(c.sourceKey);
        return `${c.name}${sub ? ` (single subclass: ${sub})` : ''}`;
      })
      .join('; ');
    return [
      `Classes (each with its ONLY subclass, auto-assigned at level 3): ${classLines}`,
      `Species: ${racesRes.items.map((r) => r.name).join('; ')}`,
      `Backgrounds: ${bgsRes.items.map((b) => b.name).join('; ')}`,
    ].join('\n');
  }

  /** Base (non-magic) weapons for the pack — Weapon Mastery picks. */
  private async packWeapons(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'ITEM',
      tags: ['item:weapon:yes', 'item:magic:no'],
      limit: 100,
      includeRaw: false,
    });
    return res.items;
  }

  /** All feats in the pack (17 rows) — Versatile / ASI / Epic Boon / invocation sub-choices. */
  private async packFeats(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'FEAT',
      limit: 100,
      includeRaw: false,
    });
    return res.items;
  }

  /** All spells the SRD makes available to a class (via SPELL_AVAILABLE_TO_CLASS relations). */
  private async classSpellPool(packId: string, className: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'SPELL',
      class: className,
      limit: 400,
      includeRaw: false,
    });
    return res.items;
  }

  /** Every spell in the pack: the granted-spell derivation resolves names against the full catalog. */
  private async allPackSpells(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'SPELL',
      limit: 1000,
      includeRaw: false,
    });
    return res.items;
  }

  /**
   * Everything the starting gold can buy: gear, weapons AND armor.
   *
   * Weapons and armor were excluded at first, on the assumption that the bundles already outfit the
   * character. They do not: every class also offers a "take the gold instead" bundle, and a draft
   * that took it ended with gold but no weapon, no armor and no pack, because the shop had nothing
   * to arm it with.
   */
  private async packShopItems(packId: string): Promise<RuleItemResponse[]> {
    const [gear, weapons, armor] = await Promise.all(
      [ADVENTURING_GEAR_TAG, 'item:weapon:yes', ARMOR_TAG].map((tag) =>
        this.ruleitems.findMany({
          packId,
          type: 'ITEM',
          tags: [tag, 'item:magic:no'],
          limit: 400,
          includeRaw: false,
        })
      )
    );
    const byId = new Map<string, RuleItemResponse>();
    for (const item of [...gear.items, ...weapons.items, ...armor.items]) byId.set(item.id, item);
    return [...byId.values()];
  }

  /** Items that can satisfy a starting-equipment category placeholder (holy symbols, instruments). */
  private async packEquipmentPlaceholderItems(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'ITEM',
      limit: 1000,
      includeRaw: false,
    });
    return res.items.filter(
      (i) => isHolySymbolItemName(i.name) || i.tagKeys.includes(MUSICAL_INSTRUMENT_CATEGORY_TAG)
    );
  }

  /** Tool items, for filling a "Choose N <category>" proficiency slot with a real tool. */
  private async packToolItems(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'ITEM',
      limit: 1000,
      includeRaw: false,
    });
    return res.items.filter((i) => i.tagKeys.some((t) => TOOL_CATEGORY_TAGS.includes(t)));
  }

  /** Standard (non-rare) languages for the pack, used to offer language choices. */
  private async standardLanguages(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'OTHER',
      tags: [STANDARD_LANGUAGE_TAG],
      limit: 100,
      includeRaw: false,
    });
    return res.items;
  }

  /** Armor + shield items for the pack, used to auto-equip from the chosen starting equipment. */
  private async packArmors(packId: string): Promise<RuleItemResponse[]> {
    const res = await this.ruleitems.findMany({
      packId,
      type: 'ITEM',
      tags: [ARMOR_TAG],
      limit: 300,
      includeRaw: false,
    });
    return res.items;
  }
}
