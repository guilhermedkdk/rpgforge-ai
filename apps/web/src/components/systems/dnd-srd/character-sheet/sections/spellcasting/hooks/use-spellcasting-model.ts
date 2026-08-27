'use client';

import * as React from 'react';
import { getEffectiveEpicBoonAbilityScore, getEffectiveModifier, getFightingStyleCantripGrant, getFightingStylePick, getOptionGrantedExtraCantrips, getMaxCantrips, getMaxPreparedSpells, getPrimalChampionBodyAndMindBonusFlags, getTotalAbilityScoreImprovementFromGains, isElvenLineageFeature, isFiendishLegacyFeature, isGnomishLineageFeature, isOtherworldlyPresenceFeature, getElvenLineageSpellsForCharacter, getFiendishLegacySpellsForCharacter, getGnomishLineageExplicitGrants, findSpellcastingFeatureDetail, abilityAbbr, clampSpellSlotsExpended, computeSpellSlots, attributePickedSpells, readSpellcastingAbility, type CastingClass, type CharacterFormData, type FeatureDetail, type RuleItemResponse } from '@rpgforce-ai/shared';

interface UseSpellcastingModelArgs {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  proficiencyBonus: number | undefined;
  /**
   * Every class that casts, from the shared `getCastingClasses`. Resolved by the caller because the
   * spell catalog needs the same list to slice each class's own spell list.
   */
  castingClasses: CastingClass[];
  /** Pack lookup, so an unattributed spell is pinned to the only class whose list holds it. */
  resolveSpell?: (name: string) => RuleItemResponse | null;
}

/**
 * Derives the spellcasting summary (abilities, DC, attack bonus) and the
 * slot/preparation limits from the Spellcasting / Pact Magic feature tables.
 */
export function useSpellcastingModel({
  data,
  onChange,
  proficiencyBonus,
  castingClasses,
  resolveSpell,
}: UseSpellcastingModelArgs) {
  const isClassSelected = Boolean(data.classRuleItemId);

  const derivedSpellcastingAbility = React.useMemo(() => {
    if (!isClassSelected) return '';
    const details = data.featureDetails ?? [];
    return readSpellcastingAbility(
      findSpellcastingFeatureDetail(details),
      details.filter((f) => f.source === 'class'),
    );
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

  // Abilities coming from a specific GRANT (race lineage, Magic Initiate, Fighting Style), which
  // are fixed by the grant itself and outrank the owning class's ability.
  const grantedSpellAbilityMap = React.useMemo((): Map<string, string> => {
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
    for (const feature of data.featureDetails ?? []) {
      if (feature.name.trim().toLowerCase() !== 'fighting style') continue;
      const fsGrant = getFightingStyleCantripGrant(data, feature);
      if (!fsGrant) continue;
      const abbr = abilityAbbr(fsGrant.ability);
      for (const name of getFightingStylePick(data, feature).cantrips) {
        if (name) map.set(name.trim().toLowerCase(), abbr);
      }
    }
    return map;
  }, [
    data.magicInitiateChoicesByGain,
    data.featureDetails,
    data.raceTraitSelections,
    data.fightingStyleByClass,
    raceLineageAbilityMap,
  ]);

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

  /**
   * Every ability the character casts with, in order. Each casting CLASS contributes its own (a
   * Cleric/Wizard casts with Wisdom AND Intelligence, and has a different DC for each), then the
   * grants that fix their own ability. Reading only the first resolved class hid the second DC.
   */
  const allSpellAbilityList = React.useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    const add = (ability: string | undefined | null) => {
      const value = (ability ?? '').trim();
      if (!value || seen.has(value.toLowerCase())) return;
      seen.add(value.toLowerCase());
      list.push(value);
    };
    for (const caster of castingClasses) add(caster.spellcastingAbility);
    add(spellcastingAbility);
    for (const gain of data.magicInitiateChoicesByGain ?? []) add(gain?.spellcastingAbility);
    for (const ability of activeRaceLineageAbilities) add(ability);
    return list;
  }, [
    castingClasses,
    spellcastingAbility,
    data.magicInitiateChoicesByGain,
    activeRaceLineageAbilities,
  ]);

  const allSpellcastingAbilities = allSpellAbilityList.map(abilityAbbr).join(' · ');

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

  // Each entry carries its OWN level and allowance, so every table lookup below reads that instead
  // of the character level: a Cleric 4 / Wizard 3 prepares off the Cleric table at 4 and the Wizard
  // table at 3, never off either at 7.
  const castersWithFeature = castingClasses;
  // No class resolved a Spellcasting feature (mid-hydration, or features without `sourceClassId`):
  // fall back to the single feature the whole sheet resolves to.
  const singleClassFallback = castersWithFeature.length === 0;

  /** Which class each picked spell is prepared through, and how much of each quota it spends. */
  const ownership = React.useMemo(
    () =>
      attributePickedSpells({
        spellsByLevel: data.spellsByLevel,
        castingClasses: castersWithFeature,
        resolveSpell,
      }),
    [data.spellsByLevel, castersWithFeature, resolveSpell]
  );

  /**
   * Per-spell ability badge. A prepared spell uses the ability of the class it is prepared through,
   * so on a Cleric/Wizard the Wizard rows read INT while the Cleric rows read WIS. Grants keep the
   * ability their own feature fixed.
   */
  const spellAbilityMap = React.useMemo((): Map<string, string> => {
    if (castersWithFeature.length < 2) return grantedSpellAbilityMap;
    const abilityByClass = new Map(
      castersWithFeature.map((c) => [c.classRuleItemId, c.spellcastingAbility])
    );
    const map = new Map<string, string>();

    // A row granted by a class feature casts with THAT class's ability, so it is read from the
    // feature that granted it rather than from whichever class resolves first.
    const classIdByFeatureName = new Map(
      (data.featureDetails ?? [])
        .filter((f) => f.sourceClassId)
        .map((f) => [f.name.trim().toLowerCase(), f.sourceClassId as string])
    );
    for (const rows of Object.values(data.spellsByLevel ?? {})) {
      for (const row of rows) {
        if (!row.granted || !row.grantSource) continue;
        const ability = abilityByClass.get(
          classIdByFeatureName.get(row.grantSource.trim().toLowerCase()) ?? ''
        );
        if (ability) map.set(row.name.trim().toLowerCase(), abilityAbbr(ability));
      }
    }
    for (const [rowKey, classId] of ownership.ownerByRow) {
      const ability = abilityByClass.get(classId);
      if (!ability) continue;
      // Row keys are `<level>:<name>`; the badge map is keyed by name alone.
      map.set(rowKey.slice(rowKey.indexOf(':') + 1), abilityAbbr(ability));
    }
    for (const [name, abbr] of grantedSpellAbilityMap) map.set(name, abbr);
    return map;
  }, [castersWithFeature, ownership, grantedSpellAbilityMap, data.featureDetails, data.spellsByLevel]);

  const maxCantrips = React.useMemo(() => {
    if (singleClassFallback) {
      return (
        getMaxCantrips(spellcastingFeature, characterLevel) + getOptionGrantedExtraCantrips(data)
      );
    }
    // SRD: each class's allowance is read as if single-classed, then they add up.
    return castersWithFeature.reduce((sum, c) => sum + c.maxCantrips, 0);
  }, [singleClassFallback, castersWithFeature, spellcastingFeature, characterLevel]);

  const maxPreparedSpells = React.useMemo(() => {
    if (singleClassFallback) return getMaxPreparedSpells(spellcastingFeature, characterLevel);
    return castersWithFeature.reduce((sum, c) => sum + c.maxPrepared, 0);
  }, [singleClassFallback, castersWithFeature, spellcastingFeature, characterLevel]);

  const allowanceByClass = React.useMemo(
    () =>
      castersWithFeature.map((c) => ({
        classRuleItemId: c.classRuleItemId,
        className: c.className,
        level: c.level,
        spellTagKey: c.spellTagKey,
        maxSpellLevel: c.maxSpellLevel,
        cantrips: c.maxCantrips,
        prepared: c.maxPrepared,
        pickedCantrips: ownership.pickedCantrips.get(c.classRuleItemId) ?? 0,
        pickedPrepared: ownership.pickedPrepared.get(c.classRuleItemId) ?? 0,
      })),
    [castersWithFeature, ownership]
  );

  // Which table applies (multiclass / a single class's own / Pact Magic on top) is decided by the
  // shared `computeSpellSlots`, so the sheet can't disagree with the validation or the backend.
  const slots = React.useMemo(
    () =>
      computeSpellSlots({
        castingClasses: castersWithFeature,
        fallbackFeature: spellcastingFeature,
        fallbackLevel: characterLevel,
      }),
    [castersWithFeature, spellcastingFeature, characterLevel]
  );
  const { pactMagic: pactMagicInfo, availabilityByLevel: slotAvailability } = slots;
  const slotTotalsByLevel = slots.totalsByLevel;

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
    /**
     * The allowance each casting class contributes, read at ITS OWN level, with the picks currently
     * attributed to it. This is what the per-class counters and the picker's class tabs read.
     */
    allowanceByClass,
    /** Owner class id per `spellRowKey(level, name)`, for the rows the player picked. */
    spellOwnerByRow: ownership.ownerByRow,
    /**
     * Only the classes that actually cast. Reading the sheet's primary class instead labelled a
     * Barbarian/Fighter/Warlock as a "Barbarian" caster; the pack states this outright, both as
     * `casterType` and as the presence of a Spellcasting / Pact Magic feature.
     */
    castingClassNames: singleClassFallback
      ? [data.className].filter((n): n is string => Boolean(n?.trim()))
      : castersWithFeature.map((c) => c.className),
    isMulticlassCaster: castersWithFeature.length > 1,
    pactMagicInfo,
    slotAvailability,
    slotTotalsByLevel,
  };
}
