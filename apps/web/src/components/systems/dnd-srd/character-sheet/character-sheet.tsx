'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isRaceLineageSpellcastingFeatureName } from '@/lib/dnd-srd/character-state';
import type { CharacterSheetProps } from './types';
import { CharacterSheetProvider, useCharacterData, useCharacterComputed } from './context';
import { HeaderSection } from './sections/header-section';
import { PersonalitySection } from './sections/personality-section';
import { SpellcastingSection } from './sections/spellcasting';
import { AbilityScoresSection } from './sections/ability-scores-section';
import { SavesSkillsSection } from './sections/saves-skills-section';
import { ProficienciesSection } from './sections/proficiencies-section';
import { CombatSection } from './sections/combat-section';
import { AttacksSection } from './sections/attacks-section';
import { EquipmentSection } from './sections/equipment-section';
import { FeaturesSection } from './sections/features-section';

export function CharacterSheet(props: CharacterSheetProps) {
  return (
    <CharacterSheetProvider {...props}>
      <CharacterSheetContent />
    </CharacterSheetProvider>
  );
}

function CharacterSheetContent() {
  // data/onChange come from the data context — re-renders on every change.
  const { data, onChange, readOnly, saveAttempted } = useCharacterData();

  // Computed values come from the computed context — stable across text-only edits.
  const {
    classes,
    backgrounds,
    races,
    classesLoading,
    backgroundsLoading,
    racesLoading,
    proficiencyBonus,
    featureDetails,
  } = useCharacterComputed();

  const hasSpellcastingAbility = React.useMemo(() => {
    // MI slots from ASI feats or versatile feat are not in featureDetails — check them directly.
    if ((data.magicInitiateChoicesByGain?.length ?? 0) > 0) return true;

    // Race traits that grant cantrips/spells (Elven Lineage, Gnomish Lineage, Fiendish Legacy)
    // only actually grant a spell once the player picks the lineage sub-option — until then
    // the sheet has no spells from this source, so the section should stay hidden.
    const hasRaceLineageSpells = (featureDetails as Array<{ name?: string; source?: string }>).some(
      (f) =>
        f.source === 'race' &&
        isRaceLineageSpellcastingFeatureName(f.name ?? '') &&
        Boolean(data.raceTraitSelections?.[f.name ?? ''])
    );
    if (hasRaceLineageSpells) return true;

    if (!data.classRuleItemId) return false;
    // Exclude the lineage traits here — their description text mentions "spellcasting
    // ability" regardless of whether the player picked the sub-option, which would
    // otherwise make this regex match unconditionally.
    const allText = (featureDetails as Array<{ desc?: string | null; name?: string }>)
      .filter((f) => !isRaceLineageSpellcastingFeatureName(f.name ?? ''))
      .map((f) => `${f.name ?? ''}\n${f.desc ?? ''}`.trim())
      .filter(Boolean)
      .join('\n');
    return /\bspellcasting ability\b/i.test(allText);
  }, [data.classRuleItemId, data.magicInitiateChoicesByGain, data.raceTraitSelections, featureDetails]);

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <div className={cn('mx-auto w-full max-w-7xl space-y-4 pb-8', readOnly && 'sheet-readonly')}>
        <div className="flex min-h-[calc(100vh-10rem)] w-full flex-col rounded-xl border border-border/50 bg-background/50 shadow-sm p-3 sm:p-4 lg:p-5 space-y-4">
          <HeaderSection
            data={data}
            onChange={onChange}
            classes={classes}
            backgrounds={backgrounds}
            races={races}
            classesLoading={classesLoading}
            backgroundsLoading={backgroundsLoading}
            racesLoading={racesLoading}
            readOnly={readOnly}
            saveAttempted={saveAttempted}
          />

          <div className="grid min-h-0 min-w-0 flex-1 gap-3 lg:grid-cols-[1.9fr_2.8fr_3.5fr_3.2fr] lg:items-stretch">
            <AbilityScoresSection data={data} onChange={onChange} readOnly={readOnly} saveAttempted={saveAttempted} />
            <SavesSkillsSection data={data} onChange={onChange} readOnly={readOnly} saveAttempted={saveAttempted} />
            <ProficienciesSection data={data} onChange={onChange} readOnly={readOnly} saveAttempted={saveAttempted} />

            <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:h-full lg:row-span-2">
              <CombatSection data={data} onChange={onChange} readOnly={readOnly} />
              <AttacksSection data={data} onChange={onChange} readOnly={readOnly} />
              <EquipmentSection data={data} onChange={onChange} readOnly={readOnly} saveAttempted={saveAttempted} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:row-span-2 lg:h-full">
              <PersonalitySection data={data} onChange={onChange} />
              <FeaturesSection data={data} onChange={onChange} readOnly={readOnly} saveAttempted={saveAttempted} />
            </div>
          </div>
        </div>

        {hasSpellcastingAbility && (
          <div className="w-full flex flex-col rounded-xl border border-border/50 bg-background/50 shadow-sm p-3 sm:p-4 lg:p-5 space-y-4">
            <SpellcastingSection
              data={data}
              onChange={onChange}
              proficiencyBonus={proficiencyBonus}
              classes={classes}
              races={races}
              saveAttempted={saveAttempted}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
