'use client';

import * as React from 'react';
import { computeGrantedSpellPlacements, mergeGrantedSpellPlacements, stableSpellsByLevelKey, type GrantedSpellPlacement, type RuleItemResponse, type CharacterFormData } from '@rpgforce-ai/shared';

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
 * Keeps `data.spellsByLevel` in sync with every auto-granted spell (race lineages, fixed class/race
 * grants, Magic Initiate, Mystic Arcanum, Signature Spells, Spell Mastery …). The placements
 * themselves come from shared `computeGrantedSpellPlacements`, which the backend save validation
 * also runs — granted rows aren't persisted, so both sides must derive the same ones.
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

  // Field-level deps (not `data`) so typing in unrelated inputs doesn't recompute the placements.
  const allGrantedSpellPlacements = React.useMemo(
    (): GrantedSpellPlacement[] =>
      computeGrantedSpellPlacements(data, lookupSpellByParsedName, catalogReady),
    [
      data.featureDetails,
      data.raceTraitSelections,
      data.level,
      data.highElfCantripName,
      data.magicInitiateChoicesByGain,
      data.mysticArcanumSpellNamesByGain,
      data.signatureSpellsSpellNames,
      data.spellMasterySpellNamesByLevel,
      data.magicalDiscoveriesSpellNames,
      data.eldritchInvocationSelections,
      data.pactOfTomeSpellNames,
      data.fightingStyleByClass,
      lookupSpellByParsedName,
      catalogReady,
    ]
  );

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
