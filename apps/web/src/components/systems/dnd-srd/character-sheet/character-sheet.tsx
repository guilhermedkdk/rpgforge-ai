'use client';

import * as React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getAllFightingStyleCantrips,
  getCastingClasses,
  isRaceLineageSpellcastingFeature,
} from '@rpgforce-ai/shared';
import type { CharacterSheetProps } from './types';
import { CharacterSheetProvider, useCharacterData, useCharacterComputed } from './context';
import { AiHintsProvider } from './ui/ai-hint';
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
import { MulticlassBreachDialog } from './sections/classes/multiclass-breach-dialog';
import { useMulticlassPrerequisiteGuard } from '../hooks/use-multiclass-prerequisite-guard';

export function CharacterSheet(props: CharacterSheetProps) {
  return (
    <CharacterSheetProvider {...props}>
      <AiHintsProvider decisions={props.aiDecisions} spellNotes={props.aiSpellNotes}>
        <CharacterSheetContent />
      </AiHintsProvider>
    </CharacterSheetProvider>
  );
}

function CharacterSheetContent() {
  // data/onChange come from the data context — re-renders on every change.
  const { data, onChange, mode, locks, pendingFlags } = useCharacterData();

  // Computed values come from the computed context — stable across text-only edits.
  const {
    classes,
    subclasses,
    backgrounds,
    races,
    classesLoading,
    subclassesLoading,
    backgroundsLoading,
    racesLoading,
    proficiencyBonus,
    featureDetails,
  } = useCharacterComputed();

  // Shown only when the character actually HAS a source of spells. This used to be a regex for
  // "spellcasting ability" over every feature description, which is far too loose: the Thief's
  // level-13 Use Magic Device says it, so a Rogue 20 with zero spells rendered the whole section.
  // `getCastingClasses` is the same authority the counters and the save validation read.
  const hasSpellcastingAbility = React.useMemo(() => {
    if (getCastingClasses(data, classes).length > 0) return true;

    // Magic Initiate reaches the sheet from an ASI/Versatile gain or from a background feat.
    if ((data.magicInitiateChoicesByGain ?? []).some(Boolean)) return true;
    if (Object.values(data.magicInitiateChoicesBySource ?? {}).some(Boolean)) return true;

    // Blessed Warrior / Druidic Warrior grant cantrips without the class being a caster.
    if (getAllFightingStyleCantrips(data).length > 0) return true;

    // A race lineage only grants its spells once the sub-option is picked, so the section stays
    // hidden until then.
    const hasRaceLineageSpells = (
      featureDetails as Array<{ name?: string; source?: string; featureKey?: string }>
    ).some(
      (f) =>
        f.source === 'race' &&
        isRaceLineageSpellcastingFeature({ name: f.name ?? '', featureKey: f.featureKey }) &&
        Boolean(data.raceTraitSelections?.[f.name ?? ''])
    );
    if (hasRaceLineageSpells) return true;

    // Last resort: anything already on the sheet (a subclass table, a legacy sheet) must stay visible.
    return Object.values(data.spellsByLevel ?? {}).some((rows) => (rows?.length ?? 0) > 0);
  }, [classes, data, featureDetails]);

  // Mounted here so creation and the saved sheet get the identical rule: an edit that breaks a
  // multiclass requirement asks before it stands, instead of leaving a sheet that refuses to save.
  const prerequisiteGuard = useMulticlassPrerequisiteGuard({ data, classes, onChange });

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <div className="mx-auto w-full max-w-7xl space-y-4 pb-8">
        <div className="flex min-h-[calc(100vh-10rem)] w-full flex-col rounded-xl border border-border/50 bg-background/50 shadow-sm p-3 sm:p-4 lg:p-5 space-y-4">
          <HeaderSection
            data={data}
            onChange={onChange}
            classes={classes}
            subclasses={subclasses}
            backgrounds={backgrounds}
            races={races}
            classesLoading={classesLoading}
            subclassesLoading={subclassesLoading}
            backgroundsLoading={backgroundsLoading}
            racesLoading={racesLoading}
            locks={locks}
            pendingFlags={pendingFlags}
          />

          <div className="grid min-h-0 min-w-0 flex-1 gap-3 lg:grid-cols-[1.9fr_2.8fr_3.5fr_3.2fr] lg:items-stretch">
            <AbilityScoresSection
              data={data}
              onChange={onChange}
              locked={locks.abilityScores}
              pendingFlags={pendingFlags}
            />
            <SavesSkillsSection
              data={data}
              onChange={onChange}
              locked={locks.skills}
              pendingFlags={pendingFlags}
            />
            <ProficienciesSection
              data={data}
              onChange={onChange}
              locks={locks}
              pendingFlags={pendingFlags}
            />

            {/* The two side columns span both rows, so their natural content height would feed the
                rows and resize Attributes/Saves/Proficiencies. Content goes absolute inside the grid
                area: it fills without contributing height, so the rows are driven only by the left
                sections. */}
            <div className="relative min-h-0 min-w-0 lg:row-span-2">
              <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:absolute lg:inset-0">
                <CombatSection data={data} onChange={onChange} />
                <AttacksSection data={data} />
                <EquipmentSection
                  data={data}
                  onChange={onChange}
                  mode={mode}
                  pendingFlags={pendingFlags}
                />
              </div>
            </div>

            <div className="relative min-h-0 min-w-0 lg:row-span-2">
              <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:absolute lg:inset-0">
                <PersonalitySection data={data} onChange={onChange} />
                <FeaturesSection data={data} onChange={onChange} pendingFlags={pendingFlags} />
              </div>
            </div>
          </div>
        </div>

        {/* data-sheet-page is the print stylesheet's only pagination hook: spellcasting is a page of
            its own, or its header prints alone at the foot of page 1. */}
        {hasSpellcastingAbility && (
          <div
            data-sheet-page="2"
            className="w-full flex flex-col rounded-xl border border-border/50 bg-background/50 shadow-sm p-3 sm:p-4 lg:p-5 space-y-4"
          >
            <SpellcastingSection
              data={data}
              onChange={onChange}
              proficiencyBonus={proficiencyBonus}
              classes={classes}
              races={races}
              pendingFlags={pendingFlags}
            />
          </div>
        )}
      </div>

      <MulticlassBreachDialog
        breach={prerequisiteGuard.breach}
        onConfirm={prerequisiteGuard.confirm}
        onCancel={prerequisiteGuard.cancel}
      />
    </TooltipProvider>
  );
}
