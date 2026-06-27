'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { useCharacterSheet } from '../context';
import { splitDeftExplorerDesc } from '../helpers';
import {
  isSpellMasteryFeatureName,
  isSignatureSpellsFeatureName,
  isMagicInitiateFeatureName,
  isRaceLineageSpellcastingFeatureName,
  type MagicInitiateSpellList,
} from '@/lib/dnd-srd/character-state';
import { computeActiveMiSourceInfo } from '@/lib/dnd-srd/derived-character-stats';
import { markdownBodyClass, markdownBodyTypographyClass } from './feature-detail/types';
import { AdditionalFeatView } from './feature-detail/additional-feat-view';
import { SpellListView } from './feature-detail/spell-list-view';
import {
  SpellcastingTableView,
  isSpellcastingTableFeature,
} from './feature-detail/spellcasting-table-view';
import {
  FeatureColumnTableView,
  isInlineColumnTableFeature,
} from './feature-detail/feature-column-table-view';
import { GenericOptionsView } from './feature-detail/generic-options-view';
import { FightingStylePanel } from './feature-detail/fighting-style-panel';
import { MetamagicPanel } from './feature-detail/metamagic-panel';
import { EldritchInvocationsPanel } from './feature-detail/eldritch-invocations-panel';
import { EpicBoonPanel } from './feature-detail/epic-boon-panel';
import { VersatilePanel } from './feature-detail/versatile-panel';
import { AbilityScoreImprovementPanel } from './feature-detail/ability-score-improvement-panel';
import { MysticArcanumSpellPickerPanel } from './feature-detail/mystic-arcanum-panel';
import { MagicInitiatePanel } from './feature-detail/magic-initiate-panel';
import { RaceLineageSpellcastingAbilityPicker } from './feature-detail/race-lineage-spellcasting-ability-picker';
import { SignatureSpellsSpellPickerPanel } from './feature-detail/signature-spells-panel';
import { SpellMasterySpellPickerPanel } from './feature-detail/spell-mastery-panel';
import {
  RaceTraitSkillPicker,
  PrimalKnowledgePanel,
  ExpertisePanel,
  ScholarPanel,
  WeaponMasteryPanel,
  GenericTableData,
  PrimalChampionWarning,
} from './feature-detail/skill-picker-panels';
import {
  DeftExplorerExpertisePickerBlock,
  DeftExplorerLanguagesPickerBlock,
} from './feature-detail/deft-explorer-pickers';

type FeatureDetailItem = NonNullable<CharacterFormData['featureDetails']>[number];

/**
 * Builds a unified ordered list of Magic Initiate gain slots from all active sources.
 * Uses `computeActiveMiSourceInfo` so the canonical key order is shared with
 * derived-character-stats (which rebuilds `magicInitiateChoicesByGain` on source changes).
 */
function buildMagicInitiateSourceInfo(
  data: CharacterFormData,
  featureDetails: FeatureDetailItem[],
  featsList: RuleItemResponse[],
): {
  gainCount: number;
  gainSourceLabels: string[];
  lockedSpellLists: (MagicInitiateSpellList | null)[];
  sourceKeys: string[];
  /** @deprecated No longer needed — kept for callers that haven't migrated yet. */
  asiMiOffset: number;
} {
  const slots = computeActiveMiSourceInfo(
    featureDetails,
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections,
  );
  const nonAsiCount = slots.filter(({ key }) => !key.startsWith('asi:')).length;
  return {
    gainCount: slots.length,
    gainSourceLabels: slots.map(({ label }) => label),
    lockedSpellLists: slots.map(({ lockedSpellList }) => lockedSpellList),
    sourceKeys: slots.map(({ key }) => key),
    asiMiOffset: nonAsiCount,
  };
}

interface FeatureDetailContentProps {
  selectedFeatureIndex: number | null;
  additionalFeatDialogOpen: boolean;
  selectedAdditionalFeatId: string | null;
}

export function FeatureDetailContent({
  selectedFeatureIndex,
  additionalFeatDialogOpen,
  selectedAdditionalFeatId,
}: FeatureDetailContentProps) {
  const {
    data,
    onChange,
    featureDetails,
    feats,
    skillsList,
    weaponMasteryMeta,
    classes,
    races,
    standardLanguageOptions,
    toolItemsByCategory,
  } = useCharacterSheet();

  const featsList = feats;

  // Unified MI gain info — computed once so both the direct feature branch and
  // the additionalFeat branch use the same canonical slot ordering.
  const miGainInfo = buildMagicInitiateSourceInfo(data, featureDetails, featsList);
  const currentFeat = selectedFeatureIndex !== null ? featureDetails[selectedFeatureIndex] : null;
  const isSpellListFeature = Boolean(
    currentFeat?.name?.trim().toLowerCase().includes('spell list')
  );
  const currentClassItem = React.useMemo(() => {
    if (!isSpellListFeature) return null;
    return classes.find((c) => c.id === data.classRuleItemId) ?? null;
  }, [isSpellListFeature, classes, data.classRuleItemId]);
  if (additionalFeatDialogOpen) {
    const additionalFeat = selectedAdditionalFeatId
      ? featsList.find((f) => f.id === selectedAdditionalFeatId)
      : null;

    if (additionalFeat && isMagicInitiateFeatureName(additionalFeat.name)) {
      const raw = (additionalFeat.raw ?? {}) as Record<string, unknown>;
      const norm = (additionalFeat.normalized ?? {}) as Record<string, unknown>;
      const benefits = (norm.benefits ?? raw.benefits ?? []) as Array<{ desc?: string | null }>;
      const benefitDescs = benefits.map((b) => (b?.desc ?? '').trim()).filter(Boolean);
      const prerequisite = (norm.prerequisite ?? raw.prerequisite ?? '') as string;
      const descTop = (norm.desc ?? raw.desc ?? '') as string;
      const featDesc =
        (benefitDescs.length > 0
          ? [
              prerequisite?.trim() ? `**Prerequisite:** ${prerequisite.trim()}` : '',
              ...benefitDescs,
            ]
              .filter(Boolean)
              .join('\n\n')
          : null) ||
        additionalFeat.contentMd?.trim() ||
        (prerequisite?.trim() ? `**Prerequisite:** ${prerequisite.trim()}\n\n` : '') + descTop ||
        '';
      const { gainSourceLabels, lockedSpellLists, sourceKeys: miSourceKeys } = miGainInfo;
      return (
        <>
          <DialogTitle className="shrink-0 pr-8">{additionalFeat.name}</DialogTitle>
          <DialogDescription asChild>
            <div
              className={cn(
                markdownBodyTypographyClass,
                'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden',
              )}
            >
              {featDesc ? (
                <div className="max-h-[min(28vh,200px)] shrink-0 overflow-y-auto overflow-x-hidden">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{featDesc}</ReactMarkdown>
                </div>
              ) : null}
              <MagicInitiatePanel
                data={data}
                onChange={onChange}
                classes={classes}
                races={races}
                sourceKeys={miSourceKeys}
                gainSourceLabels={gainSourceLabels.length > 1 ? gainSourceLabels : undefined}
                lockedSpellLists={lockedSpellLists}
              />
            </div>
          </DialogDescription>
        </>
      );
    }

    return (
      <AdditionalFeatView
        data={data}
        onChange={onChange}
        featsList={featsList}
        selectedAdditionalFeatId={selectedAdditionalFeatId}
        skillsList={skillsList}
        toolItemsByCategory={toolItemsByCategory}
      />
    );
  }

  if (selectedFeatureIndex === null || !featureDetails[selectedFeatureIndex]) return null;

  const feat = featureDetails[selectedFeatureIndex];
  const featNameLower = feat.name.trim().toLowerCase();
  if (isSpellListFeature) {
    return <SpellListView feat={feat} classItem={currentClassItem} />;
  }
  if (isSpellMasteryFeatureName(feat.name)) {
    return (
      <>
        <DialogTitle className="shrink-0 pr-8">{feat.name}</DialogTitle>
        <DialogDescription asChild>
          <div
            className={cn(
              markdownBodyTypographyClass,
              'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
            )}
          >
            <div className="max-h-[min(32vh,240px)] shrink-0 overflow-y-auto overflow-x-hidden">
              {feat.desc?.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.desc}</ReactMarkdown>
              ) : null}
            </div>
            <SpellMasterySpellPickerPanel data={data} onChange={onChange} classes={classes} />
          </div>
        </DialogDescription>
      </>
    );
  }
  if (isSignatureSpellsFeatureName(feat.name)) {
    return (
      <>
        <DialogTitle className="shrink-0 pr-8">{feat.name}</DialogTitle>
        <DialogDescription asChild>
          <div
            className={cn(
              markdownBodyTypographyClass,
              'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
            )}
          >
            <div className="max-h-[min(32vh,240px)] shrink-0 overflow-y-auto overflow-x-hidden">
              {feat.desc?.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.desc}</ReactMarkdown>
              ) : null}
            </div>
            <SignatureSpellsSpellPickerPanel data={data} onChange={onChange} classes={classes} />
          </div>
        </DialogDescription>
      </>
    );
  }
  if (isMagicInitiateFeatureName(feat.name)) {
    const { gainSourceLabels, lockedSpellLists, sourceKeys: miSourceKeys } = miGainInfo;
    return (
      <>
        <DialogTitle className="shrink-0 pr-8">{feat.name}</DialogTitle>
        <DialogDescription asChild>
          <div
            className={cn(
              markdownBodyTypographyClass,
              'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
            )}
          >
            <div className="max-h-[min(28vh,200px)] shrink-0 overflow-y-auto overflow-x-hidden">
              {feat.desc?.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.desc}</ReactMarkdown>
              ) : null}
            </div>
            <MagicInitiatePanel
              data={data}
              onChange={onChange}
              classes={classes}
              races={races}
              sourceKeys={miSourceKeys}
              gainSourceLabels={gainSourceLabels.length > 1 ? gainSourceLabels : undefined}
              lockedSpellLists={lockedSpellLists}
            />
          </div>
        </DialogDescription>
      </>
    );
  }
  if (featNameLower === 'mystic arcanum') {
    return (
      <>
        <DialogTitle className="shrink-0 pr-8">{feat.name}</DialogTitle>
        <DialogDescription asChild>
          <div
            className={cn(
              markdownBodyTypographyClass,
              'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
            )}
          >
            <div className="max-h-[min(32vh,240px)] shrink-0 overflow-y-auto overflow-x-hidden">
              {feat.desc?.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.desc}</ReactMarkdown>
              ) : null}
            </div>
            <MysticArcanumSpellPickerPanel
              data={data}
              onChange={onChange}
              classes={classes}
              gainCount={feat.gainCount ?? 1}
              gainedAtLevels={feat.gainedAtLevels}
              gainedAtDetails={feat.gainedAtDetails}
            />
          </div>
        </DialogDescription>
      </>
    );
  }
  return (
    <>
      <DialogTitle className="pr-8">{feat.name}</DialogTitle>
      <DialogDescription asChild>
        <div className={markdownBodyClass}>
          {/* Spellcasting / Pact Magic: multi-column slot grids */}
          {isSpellcastingTableFeature(feat) && <SpellcastingTableView feat={feat} />}

          {/* Single-column class tables stitched inline (Rage, Channel Divinity, Wild Shape, …) */}
          {isInlineColumnTableFeature(feat) && <FeatureColumnTableView feat={feat} />}

          {/* Primary description / option cards / thieves' cant / deft explorer */}
          <GenericOptionsView
            feat={feat}
            data={data}
            onChange={onChange}
            skillsList={skillsList}
            standardLanguageOptions={standardLanguageOptions}
          />

          {/* Elven Lineage / Gnomish Lineage / Fiendish Legacy: spellcasting ability for granted spells */}
          {isRaceLineageSpellcastingFeatureName(feat.name) && (
            <RaceLineageSpellcastingAbilityPicker
              data={data}
              onChange={onChange}
              featureName={feat.name}
            />
          )}

          {/* Fighting Style */}
          {featNameLower === 'fighting style' && (
            <FightingStylePanel
              feat={feat}
              data={data}
              onChange={onChange}
              featsList={featsList}
              classes={classes}
            />
          )}

          {/* Generic level/value tables appended at the end (no inline column reference) */}
          {!isSpellcastingTableFeature(feat) &&
            !isInlineColumnTableFeature(feat) &&
            (feat.tableData?.length ?? 0) > 0 && <GenericTableData tableData={feat.tableData!} />}

          {/* Weapon Mastery */}
          {featNameLower === 'weapon mastery' && (
            <WeaponMasteryPanel
              data={data}
              onChange={onChange}
              weaponMasteryMeta={weaponMasteryMeta}
            />
          )}

          {/* Keen Senses */}
          {featNameLower === 'keen senses' && feat.options && feat.options.length >= 2 && (
            <RaceTraitSkillPicker
              feat={feat}
              data={data}
              onChange={onChange}
              skillsList={skillsList}
              prerequisiteClosingPhrase="before choosing Keen Senses here."
            />
          )}

          {/* Skillful */}
          {featNameLower === 'skillful' && feat.options && feat.options.length >= 1 && (
            <RaceTraitSkillPicker
              feat={feat}
              data={data}
              onChange={onChange}
              skillsList={skillsList}
              prerequisiteClosingPhrase="before choosing Skillful here."
            />
          )}

          {/* Primal Knowledge */}
          {featNameLower === 'primal knowledge' && (
            <PrimalKnowledgePanel data={data} onChange={onChange} skillsList={skillsList} />
          )}

          {/* Expertise */}
          {featNameLower === 'expertise' && (
            <ExpertisePanel feat={feat} data={data} onChange={onChange} skillsList={skillsList} />
          )}

          {/* Scholar */}
          {featNameLower === 'scholar' && (
            <ScholarPanel data={data} onChange={onChange} skillsList={skillsList} />
          )}

          {/* Deft Explorer — footer pickers when desc cannot be split */}
          {featNameLower === 'deft explorer' && !splitDeftExplorerDesc(feat.desc ?? '') && (
            <>
              <DeftExplorerExpertisePickerBlock
                variant="footer"
                data={data}
                onChange={onChange}
                skillsList={skillsList}
              />
              <DeftExplorerLanguagesPickerBlock
                variant="footer"
                data={data}
                onChange={onChange}
                skillsList={skillsList}
                standardLanguageOptions={standardLanguageOptions}
              />
            </>
          )}

          {/* Metamagic */}
          {featNameLower === 'metamagic' && (
            <MetamagicPanel feat={feat} data={data} onChange={onChange} />
          )}

          {/* Eldritch Invocations */}
          {(featNameLower === 'eldritch invocations' ||
            featNameLower === 'eldritch invocation') && (
            <EldritchInvocationsPanel
              feat={feat}
              data={data}
              onChange={onChange}
              classes={classes}
              featsList={featsList}
            />
          )}

          {/* Epic Boon */}
          {featNameLower === 'epic boon' && (
            <EpicBoonPanel data={data} onChange={onChange} featsList={featsList} />
          )}

          {/* Versatile */}
          {featNameLower === 'versatile' && (
            <VersatilePanel data={data} onChange={onChange} featsList={featsList} />
          )}

          {/* Primal Champion / Body and Mind */}
          {(featNameLower === 'primal champion' || featNameLower === 'body and mind') && (
            <PrimalChampionWarning data={data} feat={feat} />
          )}

          {/* Ability Score Improvement */}
          {featNameLower === 'ability score improvement' && (
            <AbilityScoreImprovementPanel
              data={data}
              onChange={onChange}
              featsList={featsList}
              gainCount={feat.gainCount ?? 1}
              gainedAtLevels={feat.gainedAtLevels}
            />
          )}
        </div>
      </DialogDescription>
    </>
  );
}
