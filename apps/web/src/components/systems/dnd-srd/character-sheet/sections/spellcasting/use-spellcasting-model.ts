'use client';

import * as React from 'react';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  getEffectiveEpicBoonAbilityScore,
  getEffectiveModifier,
  getFightingStyleCantripGrant,
  getOptionGrantedExtraCantrips,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
} from '@/lib/dnd-srd/character-state';
import {
  isElvenLineageFeature,
  isFiendishLegacyFeature,
  isGnomishLineageFeature,
  isOtherworldlyPresenceFeature,
} from '@/lib/dnd-srd/feature-mechanics';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageExplicitGrants,
} from '@/lib/dnd-srd/race-lineage-table-spells';
import {
  findSpellcastingFeatureDetail,
  getMaxCantrips,
  getMaxPreparedSpells,
  getPactMagicInfo,
  getTableValueAtLevel,
  parseTableInt,
} from '@/lib/dnd-srd/spellcasting-limits';
import { ATTRIBUTES } from '../../constants';
import {
  abilityAbbr,
  clampSpellSlotsExpended,
  isSlotAvailable,
  type FeatureDetail,
} from './spell-utils';

interface UseSpellcastingModelArgs {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  proficiencyBonus: number | undefined;
}

/**
 * Derives the spellcasting summary (abilities, DC, attack bonus) and the
 * slot/preparation limits from the Spellcasting / Pact Magic feature tables.
 */
export function useSpellcastingModel({ data, onChange, proficiencyBonus }: UseSpellcastingModelArgs) {
  const isClassSelected = Boolean(data.classRuleItemId);

  const derivedSpellcastingAbility = React.useMemo(() => {
    if (!isClassSelected) return '';
    const details = (data.featureDetails ?? []) as Array<{ name?: string; desc?: string }>;
    const pactMagicFeature = details.find((f) =>
      (f.name ?? '').toLowerCase().includes('pact magic')
    );
    const spellcastingFeature = details.find((f) =>
      (f.name ?? '').toLowerCase().includes('spellcasting')
    );
    const sourceText =
      pactMagicFeature?.desc ??
      spellcastingFeature?.desc ??
      (details as Array<{ name?: string; desc?: string; source?: string }>)
        .filter((f) => f.source === 'class')
        .map((f) => f.desc ?? '')
        .filter(Boolean)
        .join('\n');

    const attrCandidates: RegExp[] = [
      /Spellcasting Ability[:.]\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b[\s\S]{0,120}?is\s+your\s+spellcasting\s+ability/i,
      /Spellcasting Ability[\s\S]{0,80}?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b[\s\S]{0,120}?is\s+your\s+spellcasting\s+ability/i,
      /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b\s+is\s+your\s+spellcasting\s+ability/i,
      /spellcasting\s+ability\s+is\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/i,
      /spellcasting\s+ability\s*[:.]\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\b/i,
    ];

    let raw = '';
    for (const re of attrCandidates) {
      const m = sourceText.match(re);
      if (m && m[1]) {
        raw = String(m[1]).trim();
        break;
      }
    }
    if (!raw) {
      for (const attr of ATTRIBUTES) {
        const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reBefore = new RegExp(`${escaped}\\b[\\s\\S]{0,160}?spellcasting\\s+ability`, 'i');
        const reAfter = new RegExp(`spellcasting\\s+ability[\\s\\S]{0,160}?${escaped}\\b`, 'i');
        if (reBefore.test(sourceText) || reAfter.test(sourceText)) {
          raw = attr;
          break;
        }
      }
    }
    if (!raw) return '';
    return ATTRIBUTES.find((a) => a.toLowerCase() === raw.toLowerCase()) ?? '';
  }, [data.featureDetails, isClassSelected]);

  const spellcastingAbility = isClassSelected ? derivedSpellcastingAbility : '';

  /** Spells/cantrips granted by Elven Lineage / Gnomish Lineage / Fiendish Legacy → chosen ability (abbr). */
  const raceLineageAbilityMap = React.useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    const details = data.featureDetails ?? [];
    const sel = data.raceTraitSelections ?? {};
    const abilities = data.raceLineageSpellcastingAbility ?? {};
    const charLevel = data.level ?? 1;

    const addNames = (names: (string | undefined | null)[], abbr: string) => {
      for (const rawName of names) {
        const name = (rawName ?? '').trim().replace(/\*\*/g, '').split('\n')[0]?.trim();
        if (name) map.set(name.toLowerCase(), abbr);
      }
    };

    for (const f of details) {
      const key = sel[f.name] ?? null;
      const opts = f.options ?? [];
      const ability = abilities[f.name];
      if (!key || !opts.length || !ability) continue;
      const abbr = abilityAbbr(ability);

      if (isGnomishLineageFeature(f)) {
        addNames(getGnomishLineageExplicitGrants(key, opts).map((g) => g.name), abbr);
        continue;
      }

      if (isElvenLineageFeature(f)) {
        let names = getElvenLineageSpellsForCharacter(f.desc ?? '', opts, key, charLevel);
        if (key === 'high-elf' && names.length > 0 && data.highElfCantripName) {
          names = [data.highElfCantripName, ...names.slice(1)];
        }
        addNames(names, abbr);
      } else if (isFiendishLegacyFeature(f)) {
        addNames(getFiendishLegacySpellsForCharacter(f.desc ?? '', opts, key, charLevel), abbr);
      }
    }

    // Otherworldly Presence (Tiefling) grants the Thaumaturgy cantrip, using the same
    // spellcasting ability chosen for Fiendish Legacy.
    const fiendishLegacyAbility = abilities['Fiendish Legacy'];
    const hasOtherworldlyPresence = details.some((f) => isOtherworldlyPresenceFeature(f));
    if (hasOtherworldlyPresence && fiendishLegacyAbility) {
      addNames(['Thaumaturgy'], abilityAbbr(fiendishLegacyAbility));
    }
    return map;
  }, [
    data.featureDetails,
    data.raceTraitSelections,
    data.raceLineageSpellcastingAbility,
    data.level,
    data.highElfCantripName,
  ]);

  /** Elven Lineage / Gnomish Lineage / Fiendish Legacy abilities currently chosen for an active selection. */
  const activeRaceLineageAbilities = React.useMemo((): string[] => {
    const sel = data.raceTraitSelections ?? {};
    const out: string[] = [];
    for (const [featureName, ability] of Object.entries(data.raceLineageSpellcastingAbility ?? {})) {
      if (!ability || !sel[featureName]) continue;
      out.push(ability);
    }
    return out;
  }, [data.raceLineageSpellcastingAbility, data.raceTraitSelections]);

  const spellAbilityMap = React.useMemo((): Map<string, string> => {
    const map = new Map<string, string>(raceLineageAbilityMap);
    for (const gain of (data.magicInitiateChoicesByGain ?? [])) {
      if (!gain?.spellcastingAbility) continue;
      const abbr = abilityAbbr(gain.spellcastingAbility);
      for (const name of (gain.cantripNames ?? [])) {
        if (name) map.set(name.trim().toLowerCase(), abbr);
      }
      if (gain.spellName) map.set(gain.spellName.trim().toLowerCase(), abbr);
    }
    // Fighting Style "Blessed Warrior" / "Druidic Warrior" cantrips use the option's fixed ability.
    const fsGrant = getFightingStyleCantripGrant(data);
    if (fsGrant) {
      const abbr = abilityAbbr(fsGrant.ability);
      for (const name of data.fightingStyleCantrips ?? []) {
        if (name) map.set(name.trim().toLowerCase(), abbr);
      }
    }
    return map;
  }, [
    data.magicInitiateChoicesByGain,
    data.featureDetails,
    data.raceTraitSelections,
    data.fightingStyleMode,
    data.fightingStyleCantrips,
    raceLineageAbilityMap,
  ]);

  const allSpellcastingAbilities = React.useMemo(() => {
    const seen = new Set<string>();
    const parts: string[] = [];
    if (spellcastingAbility) {
      const a = abilityAbbr(spellcastingAbility);
      seen.add(a);
      parts.push(a);
    }
    for (const gain of (data.magicInitiateChoicesByGain ?? [])) {
      if (!gain?.spellcastingAbility) continue;
      const a = abilityAbbr(gain.spellcastingAbility);
      if (!seen.has(a)) { seen.add(a); parts.push(a); }
    }
    for (const ability of activeRaceLineageAbilities) {
      const a = abilityAbbr(ability);
      if (!seen.has(a)) { seen.add(a); parts.push(a); }
    }
    return parts.join(' · ');
  }, [spellcastingAbility, data.magicInitiateChoicesByGain, activeRaceLineageAbilities]);

  const { hasPrimalChampion, hasBodyAndMind } = React.useMemo(
    () => getPrimalChampionBodyAndMindBonusFlags(data),
    [data]
  );
  const asiMerged = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
  const combinedBonus: Record<string, number> = {};
  for (const k of new Set([
    ...Object.keys(data.backgroundAbilityScoreIncrease ?? {}),
    ...Object.keys(asiMerged),
  ])) {
    combinedBonus[k] = ((data.backgroundAbilityScoreIncrease ?? {})[k] ?? 0) + (asiMerged[k] ?? 0);
  }
  const prof = proficiencyBonus || 0;

  // Ordered unique list of full ability names across all spellcasting sources.
  const allSpellAbilityList = React.useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    if (spellcastingAbility) { seen.add(spellcastingAbility.toLowerCase()); list.push(spellcastingAbility); }
    for (const gain of (data.magicInitiateChoicesByGain ?? [])) {
      if (!gain?.spellcastingAbility) continue;
      const k = gain.spellcastingAbility.toLowerCase();
      if (!seen.has(k)) { seen.add(k); list.push(gain.spellcastingAbility); }
    }
    for (const ability of activeRaceLineageAbilities) {
      const k = ability.toLowerCase();
      if (!seen.has(k)) { seen.add(k); list.push(ability); }
    }
    return list;
  }, [spellcastingAbility, data.magicInitiateChoicesByGain, activeRaceLineageAbilities]);

  const calcSpellStats = (ability: string) => {
    const m = getEffectiveModifier(
      data.attributes || {},
      combinedBonus,
      ability,
      getEffectiveEpicBoonAbilityScore(data),
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    );
    const dc = 8 + prof + m;
    const atk = prof + m;
    return { dc, atkStr: atk >= 0 ? `+${atk}` : `${atk}` };
  };

  const multiDCStr = allSpellAbilityList.map((a) => calcSpellStats(a).dc).join(' · ');
  const multiAttackStr = allSpellAbilityList.map((a) => calcSpellStats(a).atkStr).join(' · ');
  const spellcastingFeature = React.useMemo<FeatureDetail | null>(
    () => findSpellcastingFeatureDetail(data.featureDetails),
    [data.featureDetails]
  );

  const characterLevel = data.level || 1;

  // Extra cantrips from class-feature options (Cleric Thaumaturge, Druid Magician).
  const optionExtraCantrips = getOptionGrantedExtraCantrips(data);
  const maxCantrips = React.useMemo(
    () => getMaxCantrips(spellcastingFeature, characterLevel) + optionExtraCantrips,
    [spellcastingFeature, characterLevel, optionExtraCantrips]
  );

  const maxPreparedSpells = React.useMemo(
    () => getMaxPreparedSpells(spellcastingFeature, characterLevel),
    [spellcastingFeature, characterLevel]
  );

  const pactMagicInfo = React.useMemo(
    () => getPactMagicInfo(spellcastingFeature, characterLevel),
    [spellcastingFeature, characterLevel]
  );

  const slotAvailability = React.useMemo<Record<number, boolean>>(() => {
    const result: Record<number, boolean> = {};
    if (!spellcastingFeature?.tableData) return result;

    const isPactMagic = spellcastingFeature.name.toLowerCase().includes('pact magic');

    if (isPactMagic) {
      if (pactMagicInfo) {
        for (let lvl = 1; lvl <= pactMagicInfo.slotLevel; lvl++) {
          result[lvl] = true;
        }
      }
    } else {
      const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
      for (let lvl = 1; lvl <= 9; lvl++) {
        const ordinal = ORDINALS[lvl - 1];
        const tbl = spellcastingFeature.tableData.find(
          (t) =>
            t.label.toLowerCase().includes(`${ordinal}`) && t.label.toLowerCase().includes('slot')
        );
        if (tbl) {
          const val = getTableValueAtLevel(tbl.rows, characterLevel);
          result[lvl] = isSlotAvailable(val);
        }
      }
    }
    return result;
  }, [spellcastingFeature, characterLevel, pactMagicInfo]);

  const slotTotalsByLevel = React.useMemo<Record<number, number>>(() => {
    const totals: Record<number, number> = {};
    for (let lvl = 1; lvl <= 9; lvl++) totals[lvl] = 0;
    if (!spellcastingFeature?.tableData) return totals;

    const isPactMagic = spellcastingFeature.name.toLowerCase().includes('pact magic');
    if (isPactMagic) {
      // All Pact Magic slots are the same level — mirror the total across every spell
      // level the Warlock can prepare with this pool (1..slotLevel).
      if (pactMagicInfo) {
        for (let lvl = 1; lvl <= pactMagicInfo.slotLevel; lvl++) {
          totals[lvl] = pactMagicInfo.totalSlots;
        }
      }
      return totals;
    }

    const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
    for (let lvl = 1; lvl <= 9; lvl++) {
      const ordinal = ORDINALS[lvl - 1];
      const tbl = spellcastingFeature.tableData.find(
        (t) => t.label.toLowerCase().includes(ordinal) && t.label.toLowerCase().includes('slot')
      );
      if (!tbl) continue;
      totals[lvl] = parseTableInt(getTableValueAtLevel(tbl.rows, characterLevel));
    }
    return totals;
  }, [spellcastingFeature, characterLevel, pactMagicInfo]);

  const spellSlotsExpendedSignature = React.useMemo(() => {
    const s = data.spellSlots ?? {};
    return [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((lvl) => {
        const e = s[lvl]?.expended;
        if (e === undefined || e === null) return 'n';
        return String(e);
      })
      .join(',');
  }, [data.spellSlots]);

  const latestDataRef = React.useRef(data);
  latestDataRef.current = data;

  // Keep expended within [0, table total] when table totals or stored expended values change.
  React.useEffect(() => {
    const d = latestDataRef.current;
    const prev = d.spellSlots ?? {};
    const next = { ...prev };
    let changed = false;
    for (let level = 1; level <= 9; level++) {
      const maxTotal = slotTotalsByLevel[level] ?? 0;
      const cur = prev[level];
      if (cur === undefined) continue;
      const clamped = clampSpellSlotsExpended(cur.expended, maxTotal);
      if (cur.expended !== clamped) {
        next[level] = { ...cur, expended: clamped };
        changed = true;
      }
    }
    if (changed) {
      onChange({ ...d, spellSlots: next });
    }
  }, [slotTotalsByLevel, spellSlotsExpendedSignature, onChange]);

  return {
    spellcastingAbility,
    raceLineageAbilityMap,
    activeRaceLineageAbilities,
    spellAbilityMap,
    allSpellcastingAbilities,
    multiDCStr,
    multiAttackStr,
    spellcastingFeature,
    characterLevel,
    maxCantrips,
    maxPreparedSpells,
    pactMagicInfo,
    slotAvailability,
    slotTotalsByLevel,
  };
}
