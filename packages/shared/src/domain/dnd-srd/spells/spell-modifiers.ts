/**
 * Which features modify which spells, resolved to the character's real numbers (+4 damage,
 * 120 ft to 480 ft): the sheet shows the EFFECT, not the source feature's name.
 *
 * Effects are read from the SRD option text, never invented from a feature name, so a rewording
 * keeps producing correct numbers. A modifier is only emitted when the spell genuinely qualifies,
 * decided from its own normalized fields; a rule whose condition cannot be decided from data is left
 * out, because a wrong badge is worse than a missing one. `cost` marks opt-in modifiers (Metamagic
 * spends Sorcery Points), which the UI labels as such.
 */
import { getCharacterAbilityModifier } from '../derivation/ability-progression';
import {
  isBlessedStrikesPotentSpellcasting,
  isElementalFuryPotentSpellcasting,
  isImprovedElementalFuryPotentSpellcasting,
  BLESSED_STRIKES_DISPLAY_NAME,
  ELEMENTAL_FURY_DISPLAY_NAME,
} from '../features/feature-matchers';
import { isEldritchInvocationsFeature } from '../features/feature-mechanics';
import { normalizeName } from '../util/text-utils';
import { ruleItemDealsDamage, ruleItemRangeFeet, ruleItemSpellLevel } from './spells';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

/** What a modifier changes, driving badge order so rows read consistently. */
export type SpellModifierKind = 'damage' | 'healing' | 'range' | 'casting' | 'effect';

export interface SpellModifier {
  /** Full feature (or option) name, never abbreviated (e.g. 'Agonizing Blast'). */
  featureName: string;
  /** Where it comes from, shown beside the name ('Eldritch Invocation', 'Evoker'). */
  sourceLabel: string;
  kind: SpellModifierKind;
  /** Compact delta for the spell-row badge ('+4 dmg'); null renders the UI's generic marker. */
  badge: string | null;
  /** One-line effect with the character's numbers already resolved. */
  detail: string;
  /** Resource spent to apply it (Metamagic). Absent = always on. */
  cost?: string;
}

export interface SpellModifierInput {
  data: CharacterFormData;
  /** Resolves a spell name on the sheet to its rule item; feeds every eligibility test. */
  resolveSpell: (name: string) => RuleItemResponse | null;
}

const KIND_ORDER: Record<SpellModifierKind, number> = {
  damage: 0,
  healing: 1,
  range: 2,
  casting: 3,
  effect: 4,
};

const INVOCATION_SOURCE = 'Eldritch Invocation';
// Doubles as the feature name looked up on the sheet and the source label shown on the card.
const METAMAGIC_NAME = 'Metamagic';
const POTENT_SPELLCASTING_NAME = 'Potent Spellcasting';
const IMPROVED_ELEMENTAL_FURY_NAME = 'Improved Elemental Fury';
const ELEMENTAL_AFFINITY_NAME = 'Elemental Affinity';
const MAGIC_INITIATE_NAME = 'Magic Initiate';

// Improved Elemental Fury (Potent Spellcasting): Druid cantrips with a range of 10+ ft gain 300 ft.
const IMPROVED_ELEMENTAL_FURY_RANGE_BONUS_FT = 300;
const IMPROVED_ELEMENTAL_FURY_MIN_RANGE_FT = 10;

// Overchannel only applies to spells cast from a slot of level 1-5.
const OVERCHANNEL_MIN_LEVEL = 1;
const OVERCHANNEL_MAX_LEVEL = 5;

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

const rangeDetail = (baseFeet: number | null, bonusFeet: number, note: string): string =>
  baseFeet == null
    ? `Range increased by ${bonusFeet} ft (${note})`
    : `Range ${baseFeet} ft → ${baseFeet + bonusFeet} ft (${note})`;

// Matched on the SRD wording, not a list of feature names, so every feature phrased this way is
// covered. The subject is either a back-reference ("it", "the spell") or the spell named in italics,
// which is how the invocations write it ("You can cast *Mage Armor* on yourself without expending").
const FREE_CAST_RE =
  /You can (?:also )?cast (?:it|them|the spell|that spell|\*[^*]+\*)[^.]{0,140}?without (?:expending )?(?:a |any )?spell slot[^.]*\./i;

// Returns the matched sentence, which becomes the detail: never invent the uses-per-rest.
function freeCastSentence(text: string | undefined): string | null {
  const m = FREE_CAST_RE.exec(text ?? '');
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

// Where a granted feature comes from, for the card's source line.
function featureSourceLabel(data: CharacterFormData, feature: FeatureDetail | null): string {
  switch (feature?.source) {
    case 'race':
      return data.race?.trim() || 'Species';
    case 'subclass':
      return data.subclass?.trim() || 'Subclass';
    case 'background':
      return data.background?.trim() || 'Background';
    default:
      return data.className?.trim() || 'Class';
  }
}

/** First sentence of a rule text, for modifiers with no dedicated formatter. */
function firstSentence(desc: string): string {
  const flat = desc.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  const end = flat.search(/\.\s|\.$/);
  return end === -1 ? flat : flat.slice(0, end + 1);
}

// ---------------------------------------------------------------------------
// Spell facts: every eligibility test reads these, computed once per spell row.
// ---------------------------------------------------------------------------

interface SpellFacts {
  level: number;
  school: string;
  damageTypes: string[];
  dealsDamage: boolean;
  heals: boolean;
  rangeFeet: number | null;
  isTouch: boolean;
  hasSave: boolean;
  hasAttackRoll: boolean;
  castingTimeIsAction: boolean;
  /** Duration in minutes; null when instantaneous or not a measured duration. */
  durationMinutes: number | null;
  /** "You can target one additional creature …" in the higher-level text (Twinned Spell). */
  targetsExtraAtHigherLevel: boolean;
}

/** Minutes for the SRD `duration` strings ("1 minute", "8 hours", "instantaneous"). */
function parseDurationMinutes(raw: string): number | null {
  const m = /(\d+)\s*(minute|hour|day|round)/i.exec(raw);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'round') return n / 10;
  if (unit === 'hour') return n * 60;
  if (unit === 'day') return n * 1440;
  return n;
}

function readSpellFacts(spell: RuleItemResponse): SpellFacts {
  const n = (spell.normalized ?? {}) as Record<string, unknown>;
  const rangeText = typeof n.rangeText === 'string' ? n.rangeText : '';
  const desc = typeof n.desc === 'string' ? n.desc : '';
  const higherLevel = typeof n.higherLevel === 'string' ? n.higherLevel : '';
  const damageTypes = Array.isArray(n.damageTypes)
    ? n.damageTypes.map((t) => String(t).toLowerCase())
    : [];
  const school = ((n.school as { key?: string; name?: string } | undefined)?.key ?? '')
    .toString()
    .toLowerCase();

  return {
    level: ruleItemSpellLevel(spell),
    school,
    damageTypes,
    dealsDamage: ruleItemDealsDamage(spell),
    // Healing spells roll dice with no damage type, so the desc is the reliable signal.
    heals: /(regains?|restores?)[^.]{0,60}Hit Points/i.test(desc),
    rangeFeet: ruleItemRangeFeet(spell),
    isTouch: /^\s*touch\b/i.test(rangeText),
    hasSave: Boolean(typeof n.savingThrowAbility === 'string' && n.savingThrowAbility.trim()),
    hasAttackRoll: n.attackRoll === true,
    castingTimeIsAction: normalizeName(String(n.castingTime ?? '')) === 'action',
    durationMinutes: parseDurationMinutes(typeof n.duration === 'string' ? n.duration : ''),
    targetsExtraAtHigherLevel: /target\s+(?:one|an)\s+additional\s+creature/i.test(higherLevel),
  };
}

// ---------------------------------------------------------------------------
// Feature lookup helpers
// ---------------------------------------------------------------------------

// Apostrophes differ between the SRD text (Hunter’s) and our literals (Hunter's), so drop them.
const featureKeyName = (name: string | null | undefined): string =>
  normalizeName(name).replace(/['’]/g, '');

const featureByName = (data: CharacterFormData, name: string): FeatureDetail | null =>
  (data.featureDetails ?? []).find((f) => featureKeyName(f.name) === featureKeyName(name)) ?? null;

const hasFeature = (data: CharacterFormData, name: string): boolean =>
  featureByName(data, name) != null;

/** Display source for a subclass-granted modifier: the subclass name when the sheet knows it. */
const subclassSource = (data: CharacterFormData, fallback: string): string =>
  data.subclass?.trim() || fallback;

// ---------------------------------------------------------------------------
// Eldritch Invocations
// ---------------------------------------------------------------------------

interface OptionLike {
  key: string;
  label: string;
  desc?: string;
}

function buildInvocationModifier(
  option: OptionLike,
  data: CharacterFormData,
  facts: SpellFacts | null
): SpellModifier {
  const desc = option.desc ?? '';
  const base = { featureName: option.label, sourceLabel: INVOCATION_SOURCE };

  const damageAbility = desc.match(
    /add your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier to that spell's damage/i
  );
  if (damageAbility) {
    const ability = damageAbility[1];
    const mod = getCharacterAbilityModifier(data, ability);
    return {
      ...base,
      kind: 'damage',
      badge: `${signed(mod)} dmg`,
      detail: `${signed(mod)} damage (${ability} modifier) on this spell's damage rolls`,
    };
  }

  const rangePerLevel = desc.match(
    /range increases by a number of feet equal to (\d+) times your (\w+) level/i
  );
  if (rangePerLevel) {
    const perLevel = parseInt(rangePerLevel[1], 10);
    const className = rangePerLevel[2];
    const bonus = perLevel * Math.max(1, data.level ?? 1);
    return {
      ...base,
      kind: 'range',
      badge: `+${bonus}ft`,
      detail: rangeDetail(facts?.rangeFeet ?? null, bonus, `${perLevel} ft per ${className} level`),
    };
  }

  const push = desc.match(/push the creature up to (\d+) feet/i);
  if (push) {
    const feet = parseInt(push[1], 10);
    return {
      ...base,
      kind: 'effect',
      badge: 'push',
      detail: `Push a Large or smaller creature up to ${feet} ft straight away from you on a hit`,
    };
  }

  return { ...base, kind: 'effect', badge: null, detail: firstSentence(desc) };
}

// ---------------------------------------------------------------------------
// Metamagic: eligibility + effect read from each option's own rule text
// ---------------------------------------------------------------------------

interface MetamagicRule {
  label: string;
  cost: string;
  kind: SpellModifierKind;
  badge: string | null;
  detail: string;
  applies: (f: SpellFacts) => boolean;
}

/** Sorcery-point cost stated in the option text ("*Cost: 2 Sorcery Points*"). */
function parseCost(desc: string): string {
  const m = /Cost:\s*([^*\n]+)/i.exec(desc);
  return m ? m[1].trim() : '';
}

/**
 * Classifies one Metamagic option from its SRD text. Returns null when the option's condition
 * cannot be decided from the spell data (better no badge than a wrong one).
 */
function classifyMetamagicOption(
  option: OptionLike,
  data: CharacterFormData
): MetamagicRule | null {
  const desc = option.desc ?? '';
  const cost = parseCost(desc);
  const base = { label: option.label, cost };

  if (/double the spell's range/i.test(desc)) {
    return {
      ...base,
      kind: 'range',
      badge: '×2 rng',
      detail: "Double the spell's range, or make a range of Touch 30 ft",
      applies: (f) => f.isTouch || (f.rangeFeet != null && f.rangeFeet >= 5),
    };
  }
  if (/reroll a number of the damage dice/i.test(desc)) {
    const cha = getCharacterAbilityModifier(data, 'Charisma');
    const dice = Math.max(1, cha);
    return {
      ...base,
      kind: 'damage',
      badge: 'reroll',
      detail: `Reroll up to ${dice} damage ${dice === 1 ? 'die' : 'dice'} (Charisma modifier, min 1)`,
      applies: (f) => f.dealsDamage,
    };
  }
  if (/give one target of the spell Disadvantage on saves/i.test(desc)) {
    return {
      ...base,
      kind: 'effect',
      badge: 'save −',
      detail: 'One target has Disadvantage on its saving throw against the spell',
      applies: (f) => f.hasSave,
    };
  }
  if (/automatically succeeds on its saving throw against the spell/i.test(desc)) {
    const cha = getCharacterAbilityModifier(data, 'Charisma');
    const count = Math.max(1, cha);
    return {
      ...base,
      kind: 'effect',
      badge: 'spare',
      detail: `${count} chosen ${count === 1 ? 'creature' : 'creatures'} (Charisma modifier, min 1) automatically succeed on the save and take no damage`,
      applies: (f) => f.hasSave,
    };
  }
  if (/double its duration/i.test(desc)) {
    return {
      ...base,
      kind: 'casting',
      badge: '×2 dur',
      detail: 'Double the duration (max 24 hours); Advantage on Concentration saves for it',
      // "a duration of 1 minute or longer"
      applies: (f) => f.durationMinutes != null && f.durationMinutes >= 1,
    };
  }
  if (/change the casting time to a Bonus Action/i.test(desc)) {
    return {
      ...base,
      kind: 'casting',
      badge: 'bonus',
      detail: 'Cast it as a Bonus Action instead of an action',
      applies: (f) => f.castingTimeIsAction,
    };
  }
  if (/If you make an attack roll for a spell and miss/i.test(desc)) {
    return {
      ...base,
      kind: 'effect',
      badge: 're-aim',
      detail: 'Reroll the d20 when you miss with this spell’s attack roll',
      applies: (f) => f.hasAttackRoll,
    };
  }
  if (/without any Verbal, Somatic, or Material components/i.test(desc)) {
    return {
      ...base,
      kind: 'casting',
      badge: 'no V/S/M',
      detail: 'Cast it with no Verbal, Somatic, or Material components',
      applies: () => true,
    };
  }
  const transmute = desc.match(
    /change that damage type to one of the other listed types:\s*([^.\n]+)/i
  );
  if (transmute) {
    const types = transmute[1]
      .split(/,| or /)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return {
      ...base,
      kind: 'damage',
      badge: 'retype',
      detail: `Change its damage type to another of: ${types.join(', ')}`,
      applies: (f) => f.damageTypes.some((t) => types.includes(t)),
    };
  }
  if (/increase the spell's effective level by 1/i.test(desc)) {
    return {
      ...base,
      kind: 'effect',
      badge: '+target',
      detail: "Raise the spell's effective level by 1 to target one additional creature",
      applies: (f) => f.targetsExtraAtHigherLevel,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------

/**
 * Every spell/cantrip on the sheet that a feature modifies, keyed by lowercase spell name.
 * Modifiers are ordered damage → healing → range → casting → other so badges read consistently.
 */
export function computeSpellModifiers({
  data,
  resolveSpell,
}: SpellModifierInput): Map<string, SpellModifier[]> {
  // Names actually on the sheet, taken from the rows rather than from the catalog: a spell whose
  // rule item has not loaded yet still shows its badges instead of flickering them away.
  const onSheet = new Set<string>();
  for (let lvl = 0; lvl <= 9; lvl++) {
    for (const row of data.spellsByLevel?.[lvl] ?? []) onSheet.add(row.name.trim().toLowerCase());
  }

  const out = new Map<string, SpellModifier[]>();
  const add = (spellName: string, modifier: SpellModifier) => {
    const key = spellName.trim().toLowerCase();
    // A feature naming a spell the character doesn't have modifies nothing.
    if (!key || !onSheet.has(key)) return;
    const list = out.get(key) ?? [];
    // A repeatable invocation must pick a different cantrip each time, so one feature never lands
    // on the same spell twice; guard anyway so a stale selection can't duplicate a badge.
    if (list.some((m) => m.featureName === modifier.featureName)) return;
    list.push(modifier);
    out.set(key, list);
  };

  // Every spell row on the sheet, with its rule item + facts resolved once.
  const rows: Array<{ name: string; level: number; grantSource: string; facts: SpellFacts }> = [];
  for (let lvl = 0; lvl <= 9; lvl++) {
    for (const row of data.spellsByLevel?.[lvl] ?? []) {
      const rule = resolveSpell(row.name);
      if (!rule) continue;
      rows.push({
        name: row.name,
        level: lvl,
        grantSource: row.grantSource ?? '',
        facts: readSpellFacts(rule),
      });
    }
  }
  const factsFor = (name: string): SpellFacts | null =>
    rows.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())?.facts ?? null;

  // --- Eldritch Invocations (Agonizing Blast / Eldritch Spear / Repelling Blast) ---
  const invocationFeature = (data.featureDetails ?? []).find(
    (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
  );
  const invocationByKey = new Map((invocationFeature?.options ?? []).map((o) => [o.key, o]));
  for (const selection of data.eldritchInvocationSelections ?? []) {
    const spellName = selection.spellName?.trim();
    if (!spellName) continue;
    const option = invocationByKey.get(selection.key);
    if (!option) continue;
    add(spellName, buildInvocationModifier(option, data, factsFor(spellName)));
  }

  // --- Potent Spellcasting (Cleric Blessed Strikes / Druid Elemental Fury) + its upgrade ---
  const potentSpellcastingSource = isBlessedStrikesPotentSpellcasting(data)
    ? BLESSED_STRIKES_DISPLAY_NAME
    : isElementalFuryPotentSpellcasting(data)
      ? ELEMENTAL_FURY_DISPLAY_NAME
      : null;
  const improvedElementalFury = isImprovedElementalFuryPotentSpellcasting(data);

  // --- Subclass features, all gated on being present in featureDetails (derivation applies level) ---
  const elementalAffinityType = hasFeature(data, ELEMENTAL_AFFINITY_NAME)
    ? (data.raceTraitSelections?.[ELEMENTAL_AFFINITY_NAME] ?? '').trim().toLowerCase()
    : '';
  const hasEmpoweredEvocation = hasFeature(data, 'Empowered Evocation');
  const hasPotentCantrip = hasFeature(data, 'Potent Cantrip');
  const hasSculptSpells = hasFeature(data, 'Sculpt Spells');
  const hasOverchannel = hasFeature(data, 'Overchannel');
  const hasDiscipleOfLife = hasFeature(data, 'Disciple of Life');
  const hasBlessedHealer = hasFeature(data, 'Blessed Healer');
  const hasSupremeHealing = hasFeature(data, 'Supreme Healing');
  // Natural Recovery frees one level 1+ spell granted by the SAME subclass's Circle Spells feature.
  const naturalRecoverySourceName = hasFeature(data, 'Natural Recovery')
    ? ((data.featureDetails ?? []).find((f) => /circle .*spells/i.test(f.name))?.name ?? '')
    : '';

  const wisMod = getCharacterAbilityModifier(data, 'Wisdom');
  const intMod = getCharacterAbilityModifier(data, 'Intelligence');
  const chaMod = getCharacterAbilityModifier(data, 'Charisma');

  for (const { name, level, grantSource, facts } of rows) {
    if (
      naturalRecoverySourceName &&
      level >= 1 &&
      featureKeyName(grantSource) === featureKeyName(naturalRecoverySourceName)
    ) {
      add(name, {
        featureName: 'Natural Recovery',
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'casting',
        badge: 'free',
        detail: 'Cast it once without a spell slot, then finish a Long Rest',
      });
    }
    if (level === 0 && potentSpellcastingSource && facts.dealsDamage) {
      add(name, {
        featureName: POTENT_SPELLCASTING_NAME,
        sourceLabel: potentSpellcastingSource,
        kind: 'damage',
        badge: `${signed(wisMod)} dmg`,
        detail: `${signed(wisMod)} damage (Wisdom modifier) on this cantrip's damage rolls`,
      });
    }
    if (
      level === 0 &&
      improvedElementalFury &&
      facts.rangeFeet != null &&
      facts.rangeFeet >= IMPROVED_ELEMENTAL_FURY_MIN_RANGE_FT
    ) {
      add(name, {
        featureName: IMPROVED_ELEMENTAL_FURY_NAME,
        sourceLabel: ELEMENTAL_FURY_DISPLAY_NAME,
        kind: 'range',
        badge: `+${IMPROVED_ELEMENTAL_FURY_RANGE_BONUS_FT}ft`,
        detail: rangeDetail(
          facts.rangeFeet,
          IMPROVED_ELEMENTAL_FURY_RANGE_BONUS_FT,
          IMPROVED_ELEMENTAL_FURY_NAME
        ),
      });
    }
    if (elementalAffinityType && facts.damageTypes.includes(elementalAffinityType)) {
      add(name, {
        featureName: ELEMENTAL_AFFINITY_NAME,
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'damage',
        badge: `${signed(chaMod)} dmg`,
        detail: `${signed(chaMod)} damage (Charisma modifier) on one damage roll, for its ${elementalAffinityType} damage`,
      });
    }
    if (hasEmpoweredEvocation && facts.school === 'evocation' && facts.dealsDamage) {
      add(name, {
        featureName: 'Empowered Evocation',
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'damage',
        badge: `${signed(intMod)} dmg`,
        detail: `${signed(intMod)} damage (Intelligence modifier) on one damage roll of this Evocation spell`,
      });
    }
    if (hasPotentCantrip && level === 0 && facts.dealsDamage) {
      add(name, {
        featureName: 'Potent Cantrip',
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'damage',
        badge: '½ miss',
        detail: 'On a miss or a successful save, the target still takes half this cantrip’s damage',
      });
    }
    if (hasSculptSpells && facts.school === 'evocation') {
      add(name, {
        featureName: 'Sculpt Spells',
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'effect',
        badge: 'spare',
        detail: `${1 + level} chosen creatures automatically succeed on their save and take no damage`,
      });
    }
    if (
      hasOverchannel &&
      facts.dealsDamage &&
      level >= OVERCHANNEL_MIN_LEVEL &&
      level <= OVERCHANNEL_MAX_LEVEL
    ) {
      add(name, {
        featureName: 'Overchannel',
        sourceLabel: subclassSource(data, 'Subclass'),
        kind: 'damage',
        badge: 'max dmg',
        detail:
          'Deal maximum damage with it (free once per Long Rest, then costs you Necrotic damage)',
      });
    }
    if (facts.heals) {
      if (hasDiscipleOfLife) {
        add(name, {
          featureName: 'Disciple of Life',
          sourceLabel: subclassSource(data, 'Subclass'),
          kind: 'healing',
          badge: '+hp',
          detail: "Restores an extra 2 + the spell slot's level Hit Points",
        });
      }
      if (hasBlessedHealer) {
        add(name, {
          featureName: 'Blessed Healer',
          sourceLabel: subclassSource(data, 'Subclass'),
          kind: 'healing',
          badge: 'self hp',
          detail:
            "Healing another creature also restores 2 + the spell slot's level Hit Points to you",
        });
      }
      if (hasSupremeHealing) {
        add(name, {
          featureName: 'Supreme Healing',
          sourceLabel: subclassSource(data, 'Subclass'),
          kind: 'healing',
          badge: 'max heal',
          detail: 'Its healing dice are not rolled: each one restores its maximum',
        });
      }
    }
  }

  // --- Features that name one specific spell in their rule text ---
  for (const rule of NAMED_SPELL_FEATURE_RULES) {
    const feature = featureByName(data, rule.featureName);
    if (!feature) continue;
    const spellName = matchNamedSpell(feature.desc ?? '', rule.spellNamePattern);
    if (!spellName) continue;
    add(spellName, {
      featureName: rule.featureName,
      sourceLabel: subclassSource(data, 'Subclass'),
      kind: rule.kind,
      badge: rule.badge,
      detail: rule.detail,
    });
  }

  // --- Chosen spells that can be cast without expending a slot ---
  for (const name of data.spellMasterySpellNamesByLevel
    ? Object.values(data.spellMasterySpellNamesByLevel)
    : []) {
    if (typeof name === 'string' && name.trim()) {
      add(name, {
        featureName: 'Spell Mastery',
        sourceLabel: 'Wizard',
        kind: 'casting',
        badge: 'at will',
        detail: 'Cast it at its lowest level at will, without expending a spell slot',
      });
    }
  }
  for (const name of data.signatureSpellsSpellNames ?? []) {
    if (name && name.trim()) {
      add(name, {
        featureName: 'Signature Spells',
        sourceLabel: 'Wizard',
        kind: 'casting',
        badge: 'free',
        detail: 'Cast it once at level 3 without a spell slot, then finish a Short or Long Rest',
      });
    }
  }
  for (const name of data.mysticArcanumSpellNamesByGain ?? []) {
    if (name && name.trim()) {
      add(name, {
        featureName: 'Mystic Arcanum',
        sourceLabel: 'Warlock',
        kind: 'casting',
        badge: 'free',
        detail: 'Cast it once without a spell slot, then finish a Long Rest',
      });
    }
  }
  // Magic Initiate's level 1 pick only: the feat's two cantrips never cost a slot, so a free-cast
  // badge on them would say nothing. The feat text lives in `benefits`, not `desc`, which is why the
  // generic rule below cannot see it.
  for (const gain of data.magicInitiateChoicesByGain ?? []) {
    const spellName = gain?.spellName?.trim();
    if (!spellName) continue;
    add(spellName, {
      featureName: MAGIC_INITIATE_NAME,
      sourceLabel: 'Feat',
      kind: 'casting',
      badge: 'free',
      detail: 'Cast it once without a spell slot, then finish a Long Rest',
    });
  }

  // Any granted row whose own source feature says it can be cast without a slot. Level 1+ only:
  // cantrips never cost a slot, and several of these features grant a cantrip alongside the spell.
  // Runs after the blocks above so their hand-worded details win the per-feature dedupe in `add`.
  const invocationTextByLabel = new Map(
    (invocationFeature?.options ?? []).map((o) => [featureKeyName(o.label), o.desc ?? ''])
  );
  for (const { name, level, grantSource } of rows) {
    if (level < 1 || !grantSource) continue;
    const sourceFeature = featureByName(data, grantSource);
    const sentence = freeCastSentence(
      sourceFeature?.desc ?? invocationTextByLabel.get(featureKeyName(grantSource))
    );
    if (!sentence) continue;
    add(name, {
      featureName: grantSource,
      sourceLabel: sourceFeature ? featureSourceLabel(data, sourceFeature) : INVOCATION_SOURCE,
      kind: 'casting',
      badge: 'free',
      detail: sentence,
    });
  }

  // --- Metamagic: opt-in, one entry per chosen option the spell qualifies for ---
  const metamagicFeature = featureByName(data, METAMAGIC_NAME);
  const chosenKeys = new Set(data.metamagicOptionKeys ?? []);
  if (metamagicFeature && chosenKeys.size > 0) {
    const rules = (metamagicFeature.options ?? [])
      .filter((o) => chosenKeys.has(o.key))
      .map((o) => classifyMetamagicOption(o, data))
      .filter((r): r is MetamagicRule => r != null);
    for (const { name, facts } of rows) {
      for (const rule of rules) {
        if (!rule.applies(facts)) continue;
        add(name, {
          featureName: rule.label,
          sourceLabel: METAMAGIC_NAME,
          kind: rule.kind,
          badge: rule.badge,
          detail: rule.detail,
          ...(rule.cost ? { cost: rule.cost } : {}),
        });
      }
    }
  }

  for (const list of out.values()) list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return out;
}

// ---------------------------------------------------------------------------
// Features whose text calls out one spell by name (*Divine Smite*, *Hunter's Mark*, …).
// The spell NAME is read from the feature's own text, so a pack rewording still resolves.
// ---------------------------------------------------------------------------

interface NamedSpellFeatureRule {
  featureName: string;
  /** Matches the sentence that names the spell; group 1 is the spell name. */
  spellNamePattern: RegExp;
  kind: SpellModifierKind;
  badge: string | null;
  detail: string;
}

function matchNamedSpell(desc: string, pattern: RegExp): string | null {
  const m = pattern.exec(desc);
  return m ? m[1].trim() : null;
}

const NAMED_SPELL_FEATURE_RULES: NamedSpellFeatureRule[] = [
  {
    featureName: 'Smite of Protection',
    spellNamePattern: /Whenever you cast \*([^*]+)\*/i,
    kind: 'effect',
    badge: 'cover',
    detail: 'You and your allies gain Half Cover while in your Aura of Protection',
  },
  {
    featureName: "Superior Hunter's Prey",
    spellNamePattern: /marked by your \*([^*]+)\*/i,
    kind: 'damage',
    badge: '+target',
    detail: "Once per turn, deal the spell's extra damage to a second creature within 30 ft",
  },
  {
    featureName: "Hunter's Lore",
    spellNamePattern: /marked by your \*([^*]+)\*/i,
    kind: 'effect',
    badge: 'reveals',
    detail: "Reveals the marked creature's Immunities, Resistances and Vulnerabilities",
  },
  {
    featureName: 'Dragon Companion',
    spellNamePattern: /You can cast \*([^*]+)\* without a Material component/i,
    kind: 'casting',
    badge: 'free',
    detail: 'Cast it without a Material component, and once per Long Rest without a spell slot',
  },
];
