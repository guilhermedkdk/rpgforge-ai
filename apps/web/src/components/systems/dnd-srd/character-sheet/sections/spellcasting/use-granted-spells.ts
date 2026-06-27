'use client';

import * as React from 'react';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
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
} from '@/lib/dnd-srd/character-state';
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
} from '@/lib/dnd-srd/feature-mechanics';
import {
  invocationGrantedSpellName,
  isPactOfTomeOption,
} from '@/lib/dnd-srd/eldritch-invocations';
import { PACT_OF_TOME_GRANT_SOURCE } from './use-pact-of-tome';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageExplicitGrants,
} from '@/lib/dnd-srd/race-lineage-table-spells';
import {
  mergeGrantedSpellPlacements,
  ruleItemSpellLevelOr,
  stableSpellsByLevelKey,
  type GrantedSpellPlacement,
} from './spell-utils';

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

interface UseGrantedSpellsArgs {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  spellPackId: string | null;
  packSpellsLoading: boolean;
  packSpells: RuleItemResponse[];
  classSpells: RuleItemResponse[];
  lookupSpellByParsedName: (name: string) => RuleItemResponse | null;
}

/**
 * Computes every auto-granted spell placement (race lineages, fixed class/race
 * grants, Magic Initiate, Mystic Arcanum, Signature Spells, Spell Mastery) and
 * keeps `data.spellsByLevel` in sync with them.
 */
export function useGrantedSpells({
  data,
  onChange,
  spellPackId,
  packSpellsLoading,
  packSpells,
  classSpells,
  lookupSpellByParsedName,
}: UseGrantedSpellsArgs) {
  const catalogReady = packSpells.length > 0 || classSpells.length > 0;

  /** Elven Lineage / Fiendish Legacy: milestone spells; Level 1 column is always a cantrip (sheet level 0). */
  const raceGrantedSpellPlacements = React.useMemo(() => {
    const details = data.featureDetails ?? [];
    const sel = data.raceTraitSelections ?? {};
    const charLevel = data.level ?? 1;
    const namesArrays: Array<{ featureName: string; names: string[] }> = [];
    const out: Array<{
      name: string;
      spellLevel: number;
      sourceFeatureName: string;
    }> = [];

    for (const f of details) {
      const key = sel[f.name] ?? null;
      const opts = f.options ?? [];
      if (!key || !opts.length) continue;

      if (isGnomishLineageFeature(f)) {
        const grants = getGnomishLineageExplicitGrants(key, opts);
        for (const g of grants) {
          const trimmed = g.name.trim();
          if (!trimmed) continue;
          const hit = lookupSpellByParsedName(trimmed);
          let spellLevel = g.spellLevel;
          let displayName = trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed;
          if (hit) {
            displayName = hit.name;
            spellLevel = ruleItemSpellLevelOr(hit, g.spellLevel);
          } else if (!catalogReady) {
            continue;
          }
          out.push({ name: displayName, spellLevel, sourceFeatureName: f.name });
        }
        continue;
      }

      if (isElvenLineageFeature(f)) {
        let arr = getElvenLineageSpellsForCharacter(f.desc ?? '', opts, key, charLevel);
        // High Elf: allow the user's chosen Wizard cantrip to replace the default (Prestidigitation)
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
        const hit = lookupSpellByParsedName(trimmed);
        if (hit) {
          let spellLevel = ruleItemSpellLevelOr(hit, 0);
          // PHB-style tables: first column is the level-1 cantrip grant, never a leveled spell.
          if (isLevel1ColumnCantrip) {
            spellLevel = 0;
          }
          out.push({ name: hit.name, spellLevel, sourceFeatureName: featureName });
        } else if (catalogReady) {
          out.push({
            name: trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed,
            spellLevel: isLevel1ColumnCantrip ? 0 : 1,
            sourceFeatureName: featureName,
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
  }, [
    data.featureDetails,
    data.raceTraitSelections,
    data.level,
    data.highElfCantripName,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  const fixedGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const details = data.featureDetails ?? [];
    const out: GrantedSpellPlacement[] = [];
    for (const config of FIXED_SPELL_GRANTS) {
      const classSourceOnly = config.classSourceOnly ?? true;
      const present = details.some(
        (f) => (!classSourceOnly || f.source === 'class') && config.matches(f)
      );
      if (!present) continue;
      for (const grant of config.grants) {
        const hit = lookupSpellByParsedName(grant.name);
        if (!hit && !catalogReady) continue;
        out.push({
          name: hit?.name ?? grant.name,
          spellLevel: ruleItemSpellLevelOr(hit, grant.fallbackLevel),
          ...(config.grantSource ? { grantSource: config.grantSource } : {}),
        });
      }
    }
    return out;
  }, [data.featureDetails, lookupSpellByParsedName, catalogReady]);

  const mysticArcanumGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const feat =
      (data.featureDetails ?? []).find(
        (f) => f.source === 'class' && isMysticArcanumFeature(f)
      ) ?? null;
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
      const hit = lookupSpellByParsedName(trimmed);
      if (!hit && !catalogReady) continue;
      out.push({
        name: hit?.name ?? trimmed,
        spellLevel: ruleItemSpellLevelOr(hit, fallbackLevel),
        grantSource: MYSTIC_ARCANUM_DISPLAY_NAME,
      });
    }
    return out;
  }, [
    data.featureDetails,
    data.mysticArcanumSpellNamesByGain,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  const signatureSpellsGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const hasSignatureSpells = (data.featureDetails ?? []).some(
      (f) => f.source === 'class' && isSignatureSpellsFeature(f)
    );
    if (!hasSignatureSpells) return [];
    const picks = data.signatureSpellsSpellNames ?? [];
    const out: GrantedSpellPlacement[] = [];
    for (let i = 0; i < 2; i++) {
      const rawName = picks[i];
      if (!rawName || !String(rawName).trim()) continue;
      const trimmed = String(rawName).trim();
      const hit = lookupSpellByParsedName(trimmed);
      if (!hit && !catalogReady) continue;
      out.push({
        name: hit?.name ?? trimmed,
        spellLevel: ruleItemSpellLevelOr(hit, 3),
        grantSource: SIGNATURE_SPELLS_DISPLAY_NAME,
      });
    }
    return out;
  }, [
    data.featureDetails,
    data.signatureSpellsSpellNames,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  const spellMasteryGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const hasSpellMastery = (data.featureDetails ?? []).some(
      (f) => f.source === 'class' && isSpellMasteryFeature(f)
    );
    if (!hasSpellMastery) return [];
    const picks = data.spellMasterySpellNamesByLevel ?? {};
    const out: GrantedSpellPlacement[] = [];
    const levels: Array<1 | 2> = [1, 2];
    for (const requiredLevel of levels) {
      const rawName = picks[requiredLevel];
      if (!rawName || !String(rawName).trim()) continue;
      const trimmed = String(rawName).trim();
      const hit = lookupSpellByParsedName(trimmed);
      if (!hit && !catalogReady) continue;
      out.push({
        name: hit?.name ?? trimmed,
        spellLevel: ruleItemSpellLevelOr(hit, requiredLevel),
        grantSource: SPELL_MASTERY_DISPLAY_NAME,
      });
    }
    return out;
  }, [
    data.featureDetails,
    data.spellMasterySpellNamesByLevel,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  // Eldritch Invocations that grant a spell ("You learn the *Spell*" / "You can cast *Spell*"):
  // Pact of the Chain → Find Familiar, Armor of Shadows → Mage Armor, etc. Generic over every
  // selected invocation whose description grants a spell.
  const eldritchInvocationGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
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
      const hit = lookupSpellByParsedName(spellName);
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
  }, [
    data.featureDetails,
    data.eldritchInvocationSelections,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  // Pact of the Tome (Book of Shadows): the chosen cantrips + level-1 ritual spells are granted
  // while the invocation is selected. Gated on the Pact of the Tome invocation being chosen so
  // removing it removes the granted spells.
  const pactOfTomeGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const feat =
      (data.featureDetails ?? []).find(
        (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
      ) ?? null;
    const options = feat?.options ?? [];
    const selections = data.eldritchInvocationSelections ?? [];
    if (!feat || options.length === 0 || selections.length === 0) return [];
    const optionByKey = new Map(options.map((o) => [o.key, o]));
    const enabled = selections.some((s) => isPactOfTomeOption(optionByKey.get(s.key)?.desc));
    if (!enabled) return [];
    const out: GrantedSpellPlacement[] = [];
    const push = (rawName: string, fallbackLevel: number) => {
      const trimmed = String(rawName ?? '').trim();
      if (!trimmed) return;
      const hit = lookupSpellByParsedName(trimmed);
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
  }, [
    data.featureDetails,
    data.eldritchInvocationSelections,
    data.pactOfTomeSpellNames,
    lookupSpellByParsedName,
    catalogReady,
  ]);

  const magicInitiateGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const gains = data.magicInitiateChoicesByGain ?? [];
    if (gains.length === 0) return [];
    const out: GrantedSpellPlacement[] = [];
    for (const gain of gains) {
      if (!gain) continue;
      for (const cantripName of gain.cantripNames ?? []) {
        if (!cantripName) continue;
        const hit = lookupSpellByParsedName(cantripName);
        out.push({
          name: hit?.name ?? cantripName,
          spellLevel: 0,
          grantSource: 'Magic Initiate',
        });
      }
      if (gain.spellName) {
        const hit = lookupSpellByParsedName(gain.spellName);
        const nrm = hit ? ((hit.normalized ?? {}) as Record<string, unknown>) : {};
        const rawLvl = Number(nrm.level ?? 1);
        const spellLevel = Number.isFinite(rawLvl) ? Math.max(1, Math.min(9, Math.floor(rawLvl))) : 1;
        out.push({
          name: hit?.name ?? gain.spellName,
          spellLevel,
          grantSource: 'Magic Initiate',
        });
      }
    }
    return out;
  }, [data.magicInitiateChoicesByGain, lookupSpellByParsedName]);

  // Fighting Style "Blessed Warrior" / "Druidic Warrior": the two chosen cantrips are granted while
  // that option is the active Fighting Style choice (grantSource is the option label).
  const fightingStyleCantripGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const grant = getFightingStyleCantripGrant(data);
    if (!grant) return [];
    const out: GrantedSpellPlacement[] = [];
    for (const cantripName of data.fightingStyleCantrips ?? []) {
      if (!cantripName) continue;
      const hit = lookupSpellByParsedName(cantripName);
      out.push({
        name: hit?.name ?? cantripName,
        spellLevel: 0,
        grantSource: grant.label,
      });
    }
    return out;
  }, [
    data.featureDetails,
    data.raceTraitSelections,
    data.fightingStyleMode,
    data.fightingStyleCantrips,
    lookupSpellByParsedName,
  ]);

  const allGrantedSpellPlacements = React.useMemo((): GrantedSpellPlacement[] => {
    const race: GrantedSpellPlacement[] = raceGrantedSpellPlacements.map((p) => ({
      name: p.name,
      spellLevel: p.spellLevel,
      ...(p.sourceFeatureName ? { grantSource: p.sourceFeatureName } : {}),
    }));
    return [
      ...race,
      ...magicInitiateGrantedSpellPlacements,
      ...fixedGrantedSpellPlacements,
      ...mysticArcanumGrantedSpellPlacements,
      ...signatureSpellsGrantedSpellPlacements,
      ...spellMasteryGrantedSpellPlacements,
      ...eldritchInvocationGrantedSpellPlacements,
      ...pactOfTomeGrantedSpellPlacements,
      ...fightingStyleCantripGrantedSpellPlacements,
    ];
  }, [
    raceGrantedSpellPlacements,
    magicInitiateGrantedSpellPlacements,
    fixedGrantedSpellPlacements,
    mysticArcanumGrantedSpellPlacements,
    signatureSpellsGrantedSpellPlacements,
    spellMasteryGrantedSpellPlacements,
    eldritchInvocationGrantedSpellPlacements,
    pactOfTomeGrantedSpellPlacements,
    fightingStyleCantripGrantedSpellPlacements,
  ]);

  const latestDataRef = React.useRef(data);
  latestDataRef.current = data;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const grantedPlacementsRef = React.useRef(allGrantedSpellPlacements);
  grantedPlacementsRef.current = allGrantedSpellPlacements;

  const grantedMergeSig = React.useMemo(
    () =>
      allGrantedSpellPlacements
        .map((p) => `${p.spellLevel}:${p.name}:${p.grantSource ?? ''}`)
        .sort()
        .join('|'),
    [allGrantedSpellPlacements]
  );

  // Stable key for data.spellsByLevel — used as a dep so the merge also runs when
  // spellsByLevel changes externally (e.g. applyDerivedToCharacterData level cleanup).
  const currentSpellsKey = React.useMemo(
    () => stableSpellsByLevelKey(data.spellsByLevel),
    [data.spellsByLevel]
  );

  React.useEffect(() => {
    if (spellPackId && packSpellsLoading) return;
    const d = latestDataRef.current;
    const placements = grantedPlacementsRef.current;
    const next = mergeGrantedSpellPlacements(d.spellsByLevel, placements);
    if (stableSpellsByLevelKey(next) === stableSpellsByLevelKey(d.spellsByLevel)) return;
    onChangeRef.current({ ...d, spellsByLevel: next });
  }, [grantedMergeSig, currentSpellsKey, spellPackId, packSpellsLoading]);

  // Display view: always includes granted spells from current placements, independent
  // of the async sync effect. Guarantees the UI shows granted spells immediately after
  // featureDetails updates (e.g. level up granting Contact Patron / Words of Creation).
  const selectedSpells = React.useMemo(
    () => mergeGrantedSpellPlacements(data.spellsByLevel ?? {}, allGrantedSpellPlacements),
    [data.spellsByLevel, allGrantedSpellPlacements]
  );

  return { allGrantedSpellPlacements, selectedSpells };
}
