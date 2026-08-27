'use client';

import * as React from 'react';
import {
  computeActiveMiSourceInfo,
  featRuleItemAsMechanicsFeature,
  isAdditionalFightingStyleFeatureName,
  isBonusProficienciesFeatureName,
  isEvocationSavantFeatureName,
  isMagicalDiscoveriesFeatureName,
  isMagicInitiateFeature,
  isRaceLineageSpellcastingFeature,
  isSignatureSpellsFeature,
  isSpellMasteryFeature,
  splitDeftExplorerDesc,
  type CharacterFormData,
  type MagicInitiateSpellList,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { AdditionalFightingStylePanel } from './feature-detail/panels/additional-fighting-style';
import { BonusProficienciesPanel } from './feature-detail/panels/bonus-proficiencies';
import { EvocationSavantPanel } from './feature-detail/panels/evocation-savant';
import { MagicalDiscoveriesPanel } from './feature-detail/panels/magical-discoveries';
import { cn } from '@/lib/utils';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCharacterSheet } from '../context';
import { markdownBodyClass, markdownBodyTypographyClass } from './feature-detail/shared/types';
import { AdditionalFeatView } from './feature-detail/views/additional-feat';
import { SpellListView } from './feature-detail/views/spell-list';
import {
  SpellcastingTableView,
  isSpellcastingTableFeature,
} from './feature-detail/views/spellcasting-table';
import {
  FeatureColumnTableView,
  isInlineColumnTableFeature,
} from './feature-detail/views/feature-column-table';
import { GenericOptionsView } from './feature-detail/views/generic-options';
import { FightingStylePanel } from './feature-detail/panels/fighting-style';
import { MetamagicPanel } from './feature-detail/panels/metamagic';
import { EldritchInvocationsPanel } from './feature-detail/panels/eldritch-invocations';
import { EpicBoonPanel } from './feature-detail/panels/epic-boon';
import { VersatilePanel } from './feature-detail/panels/versatile';
import { AbilityScoreImprovementPanel } from './feature-detail/panels/ability-score-improvement';
import { MysticArcanumSpellPickerPanel } from './feature-detail/panels/mystic-arcanum';
import { MagicInitiatePanel } from './feature-detail/panels/magic-initiate';
import { RaceLineageSpellcastingAbilityPicker } from './feature-detail/panels/race-lineage-spellcasting';
import { SignatureSpellsSpellPickerPanel } from './feature-detail/panels/signature-spells';
import { SpellMasterySpellPickerPanel } from './feature-detail/panels/spell-mastery';
import { RaceTraitSkillPicker } from './feature-detail/panels/race-trait-skill';
import { PrimalKnowledgePanel } from './feature-detail/panels/primal-knowledge';
import { ExpertisePanel } from './feature-detail/panels/expertise';
import { ScholarPanel } from './feature-detail/panels/scholar';
import { WeaponMasteryPanel } from './feature-detail/panels/weapon-mastery';
import { PrimalChampionWarning } from './feature-detail/panels/primal-champion-warning';
import { GenericTableData } from './feature-detail/views/generic-table-data';
import {
  DeftExplorerExpertisePickerBlock,
  DeftExplorerLanguagesPickerBlock,
} from './feature-detail/panels/deft-explorer';

type FeatureDetailItem = NonNullable<CharacterFormData['featureDetails']>[number];

/**
 * Builds a unified ordered list of Magic Initiate gain slots from all active sources.
 * Uses `computeActiveMiSourceInfo` so the canonical key order is shared with
 * derived-character-stats (which rebuilds `magicInitiateChoicesByGain` on source changes).
 */
function buildMagicInitiateSourceInfo(
  data: CharacterFormData,
  featureDetails: FeatureDetailItem[],
  featsList: RuleItemResponse[]
): {
  gainCount: number;
  gainSourceLabels: string[];
  lockedSpellLists: (MagicInitiateSpellList | null)[];
  sourceKeys: string[];
} {
  const slots = computeActiveMiSourceInfo(
    featureDetails,
    data.abilityScoreImprovementByGain,
    featsList,
    data.versatileFeatId,
    data.eldritchInvocationSelections
  );
  return {
    gainCount: slots.length,
    gainSourceLabels: slots.map(({ label }) => label),
    lockedSpellLists: slots.map(({ lockedSpellList }) => lockedSpellList),
    sourceKeys: slots.map(({ key }) => key),
  };
}

const FEATURE_DESC_MAX_DEFAULT = 'max-h-[min(32vh,240px)]';
const FEATURE_DESC_MAX_COMPACT = 'max-h-[min(28vh,200px)]';

/** Title + scrollable description + the feature's choice panel — the shell every panel entry shares. */
function FeaturePanelShell({
  title,
  desc,
  descMaxClass = FEATURE_DESC_MAX_DEFAULT,
  children,
}: {
  title: string;
  desc?: string;
  descMaxClass?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <DialogTitle className="shrink-0 pr-8">{title}</DialogTitle>
      <DialogDescription asChild>
        <div
          className={cn(
            markdownBodyTypographyClass,
            'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
          )}
        >
          <div className={cn(descMaxClass, 'shrink-0 overflow-y-auto overflow-x-hidden')}>
            {desc?.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{desc}</ReactMarkdown>
            ) : null}
          </div>
          {children}
        </div>
      </DialogDescription>
    </>
  );
}

interface FeaturePanelCtx {
  feat: FeatureDetailItem;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
  races: RuleItemResponse[];
  miGainInfo: ReturnType<typeof buildMagicInitiateSourceInfo>;
}

/**
 * Feature → choice-panel registry. Covering a new feature is ONE entry here (matcher + panel),
 * never another branch in the dialog body. First match wins; anything unmatched falls through to
 * the generic view below.
 */
const FEATURE_PANELS: Array<{
  match: (feat: FeatureDetailItem) => boolean;
  descMaxClass?: string;
  render: (ctx: FeaturePanelCtx) => React.ReactNode;
}> = [
  {
    match: (f) => isSpellMasteryFeature(f),
    render: ({ data, onChange, classes }) => (
      <SpellMasterySpellPickerPanel data={data} onChange={onChange} classes={classes} />
    ),
  },
  {
    match: (f) => isSignatureSpellsFeature(f),
    render: ({ data, onChange, classes }) => (
      <SignatureSpellsSpellPickerPanel data={data} onChange={onChange} classes={classes} />
    ),
  },
  {
    match: (f) => isMagicInitiateFeature(f),
    descMaxClass: FEATURE_DESC_MAX_COMPACT,
    render: ({ data, onChange, classes, races, miGainInfo }) => (
      <MagicInitiatePanel
        data={data}
        onChange={onChange}
        classes={classes}
        races={races}
        sourceKeys={miGainInfo.sourceKeys}
        gainSourceLabels={
          miGainInfo.gainSourceLabels.length > 1 ? miGainInfo.gainSourceLabels : undefined
        }
        lockedSpellLists={miGainInfo.lockedSpellLists}
      />
    ),
  },
  {
    match: (f) => f.source === 'subclass' && isMagicalDiscoveriesFeatureName(f.name),
    render: ({ data, onChange, classes }) => (
      <MagicalDiscoveriesPanel data={data} onChange={onChange} classes={classes} />
    ),
  },
  {
    match: (f) => f.source === 'subclass' && isEvocationSavantFeatureName(f.name),
    render: ({ data, onChange, classes }) => (
      <EvocationSavantPanel data={data} onChange={onChange} classes={classes} />
    ),
  },
  {
    match: (f) => f.name.trim().toLowerCase() === 'mystic arcanum',
    render: ({ feat, data, onChange, classes }) => (
      <MysticArcanumSpellPickerPanel
        data={data}
        onChange={onChange}
        classes={classes}
        gainCount={feat.gainCount ?? 1}
        gainedAtLevels={feat.gainedAtLevels}
        gainedAtDetails={feat.gainedAtDetails}
      />
    ),
  },
];

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

    if (additionalFeat && isMagicInitiateFeature(featRuleItemAsMechanicsFeature(additionalFeat))) {
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
                'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden'
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
  const panelEntry = FEATURE_PANELS.find((entry) => entry.match(feat));
  if (panelEntry) {
    return (
      <FeaturePanelShell title={feat.name} desc={feat.desc} descMaxClass={panelEntry.descMaxClass}>
        {panelEntry.render({ feat, data, onChange, classes, races, miGainInfo })}
      </FeaturePanelShell>
    );
  }
  return (
    <>
      <DialogTitle className="shrink-0 pr-8">{feat.name}</DialogTitle>
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
          {isRaceLineageSpellcastingFeature(feat) && (
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

          {/* Subclass: name-only options (Elemental Affinity, Fiendish Resilience, Circle of the
              Land) are rendered inside GenericOptionsView, between the text and the tables. */}

          {/* Bonus Proficiencies (College of Lore): 3 skill choices */}
          {feat.source === 'subclass' && isBonusProficienciesFeatureName(feat.name) && (
            <BonusProficienciesPanel data={data} onChange={onChange} skillsList={skillsList} />
          )}

          {/* Additional Fighting Style (Champion): second fighting-style feat */}
          {feat.source === 'subclass' && isAdditionalFightingStyleFeatureName(feat.name) && (
            <AdditionalFightingStylePanel data={data} onChange={onChange} featsList={featsList} />
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
              feat={feat}
              masteryWeapons={weaponMasteryMeta.masteryWeapons}
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
              gainSlotOffset={feat.gainSlotOffset ?? 0}
            />
          )}
        </div>
      </DialogDescription>
    </>
  );
}
