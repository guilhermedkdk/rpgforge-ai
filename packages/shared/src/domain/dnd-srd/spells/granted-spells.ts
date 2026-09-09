/**
 * Every spell a character's features place on the sheet: lineages, fixed grants, Magic Initiate,
 * subclass tables, invocations and the rest.
 *
 * Granted rows are NOT persisted, only the player's own picks, so the server must re-derive them
 * before validating a save or it rejects a sheet the editor considers complete. Hence shared code,
 * not the web hook that used to own it.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';
import {
  CONTACT_PATRON_DISPLAY_NAME,
  DRUIDIC_DISPLAY_NAME,
  FAITHFUL_STEED_DISPLAY_NAME,
  FAVORED_ENEMY_DISPLAY_NAME,
  MYSTIC_ARCANUM_DISPLAY_NAME,
  PALADINS_SMITE_DISPLAY_NAME,
  SIGNATURE_SPELLS_DISPLAY_NAME,
  SPELL_MASTERY_DISPLAY_NAME,
  WORDS_OF_CREATION_DISPLAY_NAME,
  getFightingStyleCantripGrant,
  resolveMysticArcanumSpellLevel,
} from '../features/feature-matchers';
import { getFightingStylePick } from '../features/fighting-style';
import {
  isContactPatronFeature,
  isDruidicFeature,
  isEldritchInvocationsFeature,
  isElvenLineageFeature,
  isFaithfulSteedFeature,
  isFavoredEnemyFeature,
  isFiendishLegacyFeature,
  isGnomishLineageFeature,
  isMysticArcanumFeature,
  isOtherworldlyPresenceFeature,
  isPaladinsSmiteFeature,
  isSignatureSpellsFeature,
  isSpellMasteryFeature,
  isWordsOfCreationFeature,
  type MechanicsFeatureLike,
} from '../features/feature-mechanics';
import {
  PACT_OF_TOME_GRANT_SOURCE,
  invocationGrantedSpellName,
  isPactOfTomeOption,
} from '../features/eldritch-invocations';
import {
  getSubclassTableGrantedSpellNames,
  isMagicalDiscoveriesFeatureName,
} from '../features/subclass-features';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageExplicitGrants,
} from './race-lineage-table-spells';
import { ruleItemSpellLevelOr, type GrantedSpellPlacement } from './spells';

const MAGIC_INITIATE_GRANT_SOURCE = 'Magic Initiate';

/** Resolves a spell name (possibly bold/multi-line table text) to a catalog item. */
export type SpellLookup = (name: string) => RuleItemResponse | null;

/**
 * Name → spell resolver used by the granted-spell derivation. Same normalization on both sides
 * (editor and server), so a table cell like `**Fire Bolt**\n…` resolves identically.
 */
export function buildSpellLookupByParsedName(spells: RuleItemResponse[]): SpellLookup {
  const byNameLower = new Map<string, RuleItemResponse>();
  for (const s of spells) {
    const key = s.name.trim().toLowerCase();
    if (!byNameLower.has(key)) byNameLower.set(key, s);
  }
  return (trimmed: string): RuleItemResponse | null => {
    const plain = trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed;
    const key = plain.toLowerCase();
    const direct = byNameLower.get(key);
    if (direct) return direct;
    // Table cell sometimes has extra prose; try the first segment before "." or " ("
    const short = plain.split(/[.(]/)[0]?.trim().toLowerCase() ?? key;
    if (short !== key) return byNameLower.get(short) ?? null;
    return null;
  };
}

/**
 * Class/race features that always grant fixed spells while present on the sheet.
 * One entry per feature: matching predicate + the spells it grants (with the
 * fallback spell level used when the catalog has not resolved the spell yet).
 */
const FIXED_SPELL_GRANTS: ReadonlyArray<{
  matches: (f: MechanicsFeatureLike) => boolean;
  /** When true (default), the feature must come from the class. */
  classSourceOnly?: boolean;
  /** Origin shown in the spell row tooltip. */
  grantSource?: string;
  grants: ReadonlyArray<{ name: string; fallbackLevel: number }>;
}> = [
  {
    matches: isOtherworldlyPresenceFeature,
    classSourceOnly: false,
    grantSource: 'Otherworldly Presence',
    grants: [{ name: 'Thaumaturgy', fallbackLevel: 0 }],
  },
  {
    matches: isDruidicFeature,
    grantSource: DRUIDIC_DISPLAY_NAME,
    grants: [{ name: 'Speak with Animals', fallbackLevel: 1 }],
  },
  {
    matches: isWordsOfCreationFeature,
    grantSource: WORDS_OF_CREATION_DISPLAY_NAME,
    grants: [
      { name: 'Power Word Heal', fallbackLevel: 9 },
      { name: 'Power Word Kill', fallbackLevel: 9 },
    ],
  },
  {
    matches: isFaithfulSteedFeature,
    grantSource: FAITHFUL_STEED_DISPLAY_NAME,
    grants: [{ name: 'Find Steed', fallbackLevel: 2 }],
  },
  {
    matches: isPaladinsSmiteFeature,
    grantSource: PALADINS_SMITE_DISPLAY_NAME,
    grants: [{ name: 'Divine Smite', fallbackLevel: 1 }],
  },
  {
    matches: isFavoredEnemyFeature,
    grantSource: FAVORED_ENEMY_DISPLAY_NAME,
    grants: [{ name: "Hunter's Mark", fallbackLevel: 1 }],
  },
  {
    matches: isContactPatronFeature,
    grantSource: CONTACT_PATRON_DISPLAY_NAME,
    grants: [{ name: 'Contact Other Plane', fallbackLevel: 5 }],
  },
];

/** Elven Lineage / Fiendish Legacy: milestone spells; the Level 1 column is always a cantrip (sheet level 0). */
function raceGrantedPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const details = data.featureDetails ?? [];
  const sel = data.raceTraitSelections ?? {};
  const charLevel = data.level ?? 1;
  const namesArrays: Array<{ featureName: string; names: string[] }> = [];
  const out: GrantedSpellPlacement[] = [];

  for (const f of details) {
    const key = sel[f.name] ?? null;
    const opts = f.options ?? [];
    if (!key || !opts.length) continue;

    if (isGnomishLineageFeature(f)) {
      for (const g of getGnomishLineageExplicitGrants(key, opts)) {
        const trimmed = g.name.trim();
        if (!trimmed) continue;
        const hit = lookup(trimmed);
        let spellLevel = g.spellLevel;
        let displayName = trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed;
        if (hit) {
          displayName = hit.name;
          spellLevel = ruleItemSpellLevelOr(hit, g.spellLevel);
        } else if (!catalogReady) {
          continue;
        }
        out.push({ name: displayName, spellLevel, grantSource: f.name });
      }
      continue;
    }

    if (isElvenLineageFeature(f)) {
      let arr = getElvenLineageSpellsForCharacter(f.desc ?? '', opts, key, charLevel);
      // High Elf: the user's chosen Wizard cantrip replaces the default (Prestidigitation)
      if (key === 'high-elf' && arr.length > 0 && data.highElfCantripName) {
        arr = [data.highElfCantripName, ...arr.slice(1)];
      }
      if (arr.length) namesArrays.push({ featureName: f.name, names: arr });
    } else if (isFiendishLegacyFeature(f)) {
      const arr = getFiendishLegacySpellsForCharacter(f.desc ?? '', opts, key, charLevel);
      if (arr.length) namesArrays.push({ featureName: f.name, names: arr });
    }
  }

  for (const { featureName, names } of namesArrays) {
    names.forEach((rawName, idxInTrait) => {
      const trimmed = rawName.trim();
      if (!trimmed) return;
      const isLevel1ColumnCantrip = idxInTrait === 0;
      const hit = lookup(trimmed);
      if (hit) {
        // PHB-style tables: the first column is the level-1 cantrip grant, never a leveled spell.
        const spellLevel = isLevel1ColumnCantrip ? 0 : ruleItemSpellLevelOr(hit, 0);
        out.push({ name: hit.name, spellLevel, grantSource: featureName });
      } else if (catalogReady) {
        out.push({
          name: trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed,
          spellLevel: isLevel1ColumnCantrip ? 0 : 1,
          grantSource: featureName,
        });
      }
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const k = `${x.spellLevel}:${x.name.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fixedGrantedPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const details = data.featureDetails ?? [];
  const out: GrantedSpellPlacement[] = [];
  for (const config of FIXED_SPELL_GRANTS) {
    const classSourceOnly = config.classSourceOnly ?? true;
    const present = details.some(
      (f) => (!classSourceOnly || f.source === 'class') && config.matches(f)
    );
    if (!present) continue;
    for (const grant of config.grants) {
      const hit = lookup(grant.name);
      if (!hit && !catalogReady) continue;
      out.push({
        name: hit?.name ?? grant.name,
        spellLevel: ruleItemSpellLevelOr(hit, grant.fallbackLevel),
        ...(config.grantSource ? { grantSource: config.grantSource } : {}),
      });
    }
  }
  return out;
}

function mysticArcanumPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const feat =
    (data.featureDetails ?? []).find((f) => f.source === 'class' && isMysticArcanumFeature(f)) ??
    null;
  const n = feat?.gainCount ?? 0;
  if (!feat || n <= 0) return [];
  const picks = data.mysticArcanumSpellNamesByGain ?? [];
  const levels = feat.gainedAtLevels ?? [];
  const details = feat.gainedAtDetails ?? [];
  const out: GrantedSpellPlacement[] = [];
  for (let i = 0; i < n; i++) {
    const rawName = picks[i];
    if (!rawName || !String(rawName).trim()) continue;
    const trimmed = String(rawName).trim();
    const fallbackLevel = resolveMysticArcanumSpellLevel(details[i], levels[i]);
    const hit = lookup(trimmed);
    if (!hit && !catalogReady) continue;
    out.push({
      name: hit?.name ?? trimmed,
      spellLevel: ruleItemSpellLevelOr(hit, fallbackLevel),
      grantSource: MYSTIC_ARCANUM_DISPLAY_NAME,
    });
  }
  return out;
}

function signatureSpellsPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const has = (data.featureDetails ?? []).some(
    (f) => f.source === 'class' && isSignatureSpellsFeature(f)
  );
  if (!has) return [];
  const picks = data.signatureSpellsSpellNames ?? [];
  const out: GrantedSpellPlacement[] = [];
  for (let i = 0; i < 2; i++) {
    const rawName = picks[i];
    if (!rawName || !String(rawName).trim()) continue;
    const trimmed = String(rawName).trim();
    const hit = lookup(trimmed);
    if (!hit && !catalogReady) continue;
    out.push({
      name: hit?.name ?? trimmed,
      spellLevel: ruleItemSpellLevelOr(hit, 3),
      grantSource: SIGNATURE_SPELLS_DISPLAY_NAME,
    });
  }
  return out;
}

function spellMasteryPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const has = (data.featureDetails ?? []).some(
    (f) => f.source === 'class' && isSpellMasteryFeature(f)
  );
  if (!has) return [];
  const picks = data.spellMasterySpellNamesByLevel ?? {};
  const out: GrantedSpellPlacement[] = [];
  for (const requiredLevel of [1, 2] as const) {
    const rawName = picks[requiredLevel];
    if (!rawName || !String(rawName).trim()) continue;
    const trimmed = String(rawName).trim();
    const hit = lookup(trimmed);
    if (!hit && !catalogReady) continue;
    out.push({
      name: hit?.name ?? trimmed,
      spellLevel: ruleItemSpellLevelOr(hit, requiredLevel),
      grantSource: SPELL_MASTERY_DISPLAY_NAME,
    });
  }
  return out;
}

// Eldritch Invocations that grant a spell ("You learn the *Spell*" / "You can cast *Spell*"):
// Pact of the Chain → Find Familiar, Armor of Shadows → Mage Armor, etc.
function eldritchInvocationPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const feat =
    (data.featureDetails ?? []).find(
      (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
    ) ?? null;
  const options = feat?.options ?? [];
  const selections = data.eldritchInvocationSelections ?? [];
  if (!feat || options.length === 0 || selections.length === 0) return [];
  const optionByKey = new Map(options.map((o) => [o.key, o]));
  const out: GrantedSpellPlacement[] = [];
  const seen = new Set<string>();
  for (const sel of selections) {
    const opt = optionByKey.get(sel.key);
    if (!opt) continue;
    const spellName = invocationGrantedSpellName(opt.desc);
    if (!spellName) continue;
    const hit = lookup(spellName);
    if (!hit && !catalogReady) continue;
    const resolvedName = hit?.name ?? spellName;
    const dedupeKey = resolvedName.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      name: resolvedName,
      spellLevel: ruleItemSpellLevelOr(hit, 1),
      grantSource: opt.label,
    });
  }
  return out;
}

// Pact of the Tome (Book of Shadows): the chosen cantrips + level-1 ritual spells are granted while
// the invocation is selected, so dropping the invocation drops the granted spells.
function pactOfTomePlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const feat =
    (data.featureDetails ?? []).find(
      (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
    ) ?? null;
  const options = feat?.options ?? [];
  const selections = data.eldritchInvocationSelections ?? [];
  if (!feat || options.length === 0 || selections.length === 0) return [];
  const optionByKey = new Map(options.map((o) => [o.key, o]));
  if (!selections.some((s) => isPactOfTomeOption(optionByKey.get(s.key)?.desc))) return [];

  const out: GrantedSpellPlacement[] = [];
  const push = (rawName: string, fallbackLevel: number) => {
    const trimmed = String(rawName ?? '').trim();
    if (!trimmed) return;
    const hit = lookup(trimmed);
    if (!hit && !catalogReady) return;
    out.push({
      name: hit?.name ?? trimmed,
      spellLevel: fallbackLevel === 0 ? 0 : ruleItemSpellLevelOr(hit, fallbackLevel),
      grantSource: PACT_OF_TOME_GRANT_SOURCE,
    });
  };
  for (const name of data.pactOfTomeSpellNames?.cantrips ?? []) push(name, 0);
  for (const name of data.pactOfTomeSpellNames?.rituals ?? []) push(name, 1);
  return out;
}

// Always-prepared level→spells tables from subclasses (Life Domain / Oath of Devotion / Fiend /
// Draconic Spells). Circle of the Land uses the table of the terrain chosen in the options.
function subclassTablePlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const charLevel = data.level ?? 1;
  const out: GrantedSpellPlacement[] = [];
  const seen = new Set<string>();
  for (const f of data.featureDetails ?? []) {
    if (f.source !== 'subclass') continue;
    const selectedKey = data.raceTraitSelections?.[f.name] ?? null;
    for (const rawName of getSubclassTableGrantedSpellNames(f.desc ?? '', charLevel, selectedKey)) {
      const trimmed = rawName.trim();
      if (!trimmed) continue;
      const hit = lookup(trimmed);
      if (!hit && !catalogReady) continue;
      const resolvedName = hit?.name ?? trimmed;
      const dedupeKey = resolvedName.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push({
        name: resolvedName,
        spellLevel: ruleItemSpellLevelOr(hit, 1),
        grantSource: f.name,
      });
    }
  }
  return out;
}

// Magical Discoveries (College of Lore): the 2 chosen spells are always prepared.
function magicalDiscoveriesPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady: boolean
): GrantedSpellPlacement[] {
  const feature = (data.featureDetails ?? []).find(
    (f) => f.source === 'subclass' && isMagicalDiscoveriesFeatureName(f.name)
  );
  if (!feature) return [];
  const out: GrantedSpellPlacement[] = [];
  for (const rawName of data.magicalDiscoveriesSpellNames ?? []) {
    if (!rawName || !String(rawName).trim()) continue;
    const trimmed = String(rawName).trim();
    const hit = lookup(trimmed);
    if (!hit && !catalogReady) continue;
    out.push({
      name: hit?.name ?? trimmed,
      spellLevel: ruleItemSpellLevelOr(hit, 1),
      grantSource: feature.name,
    });
  }
  return out;
}

function magicInitiatePlacements(
  data: CharacterFormData,
  lookup: SpellLookup
): GrantedSpellPlacement[] {
  const gains = data.magicInitiateChoicesByGain ?? [];
  if (gains.length === 0) return [];
  const out: GrantedSpellPlacement[] = [];
  for (const gain of gains) {
    if (!gain) continue;
    for (const cantripName of gain.cantripNames ?? []) {
      if (!cantripName) continue;
      const hit = lookup(cantripName);
      out.push({
        name: hit?.name ?? cantripName,
        spellLevel: 0,
        grantSource: MAGIC_INITIATE_GRANT_SOURCE,
      });
    }
    if (gain.spellName) {
      const hit = lookup(gain.spellName);
      const nrm = hit ? ((hit.normalized ?? {}) as Record<string, unknown>) : {};
      const rawLvl = Number(nrm.level ?? 1);
      const spellLevel = Number.isFinite(rawLvl) ? Math.max(1, Math.min(9, Math.floor(rawLvl))) : 1;
      out.push({
        name: hit?.name ?? gain.spellName,
        spellLevel,
        grantSource: MAGIC_INITIATE_GRANT_SOURCE,
      });
    }
  }
  return out;
}

// Fighting Style "Blessed Warrior" / "Druidic Warrior": the two chosen cantrips are granted while
// that option is the active Fighting Style choice (grantSource is the option label).
function fightingStyleCantripPlacements(
  data: CharacterFormData,
  lookup: SpellLookup
): GrantedSpellPlacement[] {
  const out: GrantedSpellPlacement[] = [];
  // One grant per granting class: a Paladin/Ranger can hold Blessed AND Druidic Warrior.
  for (const feature of data.featureDetails ?? []) {
    if (feature.name.trim().toLowerCase() !== 'fighting style') continue;
    const grant = getFightingStyleCantripGrant(data, feature);
    if (!grant) continue;
    for (const cantripName of getFightingStylePick(data, feature).cantrips) {
      if (!cantripName) continue;
      const hit = lookup(cantripName);
      out.push({ name: hit?.name ?? cantripName, spellLevel: 0, grantSource: grant.label });
    }
  }
  return out;
}

/**
 * Every spell the character's features grant, in the order the sheet renders them.
 * `catalogReady` false (catalog still loading) suppresses unresolved names so a half-loaded
 * catalog can't place a wrong spell level.
 */
export function computeGrantedSpellPlacements(
  data: CharacterFormData,
  lookup: SpellLookup,
  catalogReady = true
): GrantedSpellPlacement[] {
  return [
    ...raceGrantedPlacements(data, lookup, catalogReady),
    ...magicInitiatePlacements(data, lookup),
    ...fixedGrantedPlacements(data, lookup, catalogReady),
    ...subclassTablePlacements(data, lookup, catalogReady),
    ...magicalDiscoveriesPlacements(data, lookup, catalogReady),
    ...mysticArcanumPlacements(data, lookup, catalogReady),
    ...signatureSpellsPlacements(data, lookup, catalogReady),
    ...spellMasteryPlacements(data, lookup, catalogReady),
    ...eldritchInvocationPlacements(data, lookup, catalogReady),
    ...pactOfTomePlacements(data, lookup, catalogReady),
    ...fightingStyleCantripPlacements(data, lookup),
  ];
}
