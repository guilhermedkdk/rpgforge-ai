'use client';

import { useEffect, useState } from 'react';
import { Swords, Scroll, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TruncatedTooltip } from '@/components/ui/tooltip';
import {
  getEffectiveEpicBoonAbilityScore,
  getFightingStyleCantripGrant,
  isAbilityScoreImprovementFullyResolved,
  isMysticArcanumFullyChosen,
  isSpellMasteryFullyChosen,
  isSignatureSpellsFullyChosen,
  isThievesCantFeatureName,
  isMagicInitiateFeatureName,
  isMagicInitiateFullyChosen,
} from '@/lib/dnd-srd/character-state';
import {
  getElvenLineageSpellsForCharacter,
  getFiendishLegacySpellsForCharacter,
  getGnomishLineageSpellNamesForCharacter,
} from '@/lib/dnd-srd/race-lineage-table-spells';
import { getEldritchInvocationsKnown } from '@/lib/dnd-srd/spellcasting-limits';
import { areEldritchInvocationsFullyChosen } from '@/lib/dnd-srd/eldritch-invocations';
import { isSkilledFullyChosen } from '@/lib/dnd-srd/derived-character-stats';
import { useCharacterComputed } from '../context';
import { getClassExpertiseSkillKeys } from '../helpers';
import { needsChoiceAccent, needsChoiceHighlight } from '../constants';
import { Section } from '../ui/section';
import { FeatureDetailContent } from '../features/feature-detail-dialog';
import { normalizeFeatName } from '@/lib/dnd-srd/feat-prerequisites';
import type { CharacterFormData } from '../types';

interface FeaturesSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  readOnly?: boolean;
  saveAttempted?: boolean;
}

export function FeaturesSection({ data, onChange, saveAttempted = false }: FeaturesSectionProps) {
  const { featureDetails, weaponMasteryMeta, feats } = useCharacterComputed();

  const [selectedFeatureIndex, setSelectedFeatureIndex] = useState<number | null>(null);
  const [additionalFeatDialogOpen, setAdditionalFeatDialogOpen] = useState(false);
  const [selectedAdditionalFeatId, setSelectedAdditionalFeatId] = useState<string | null>(null);

  const featsList = feats;

  const SOURCE_ORDER: Array<'class' | 'race'> = ['class', 'race'];
  const SOURCE_CONFIG: Record<'class' | 'race', { labelKey: string; fallback: string }> = {
    class: { labelKey: 'class', fallback: 'Determined by class.' },
    race: { labelKey: 'race', fallback: 'Determined by species.' },
  };

  const getGroupLabel = (source: 'class' | 'race') => {
    if (source === 'class') {
      const name = data.className?.trim();
      return name ? `${name} class` : 'Class';
    }
    if (source === 'race') {
      const name = data.race?.trim();
      return name ? `${name} species` : 'Species';
    }
    return 'Unknown';
  };

  type FeatureGroupItem = {
    index: number;
    name: string;
    hasOptions: boolean;
    selectedOptionLabel: string | null;
  };
  const bySource = new Map<'class' | 'race', FeatureGroupItem[]>();
  featureDetails.forEach((f, index) => {
    const source = (f.source ?? 'class') as 'class' | 'race' | 'background';
    if (source === 'background') return;
    if (source !== 'class' && source !== 'race') return;
    const list = bySource.get(source) ?? [];
    const nameLower = f.name.trim().toLowerCase();
    let hasOptions = !!(f.options && f.options.length >= 2);
    let selectedOptionLabel: string | null = null;

    if (hasOptions && f.options) {
      const isImprovedBlessed = nameLower === 'improved blessed strikes';
      const isImprovedElemental = nameLower === 'improved elemental fury';
      const baseFeatureName = isImprovedBlessed
        ? 'Blessed Strikes'
        : isImprovedElemental
          ? 'Elemental Fury'
          : f.name;
      const selectedKey = data.raceTraitSelections?.[baseFeatureName] ?? null;
      if (selectedKey) {
        selectedOptionLabel = f.options.find((o) => o.key === selectedKey)?.label ?? 'chosen';
      }
    }

    if (nameLower === 'primal knowledge') {
      hasOptions = true;
      if (data.primalKnowledgeSkillKey) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'keen senses') {
      const opts = f.options ?? [];
      if (opts.length >= 1) {
        hasOptions = true;
        const sel = data.raceTraitSelections?.[f.name] ?? null;
        if (sel && opts.some((o) => o.key === sel)) {
          selectedOptionLabel = opts.find((o) => o.key === sel)?.label ?? 'chosen';
        } else if (opts.length === 1) {
          selectedOptionLabel = opts[0].label;
        }
      }
    }
    if (nameLower === 'elven lineage') {
      const opts = f.options ?? [];
      if (opts.length >= 2) {
        hasOptions = true;
      }
      const sel = data.raceTraitSelections?.[f.name] ?? null;
      const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
      const lineageLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
      const spells = getElvenLineageSpellsForCharacter(f.desc ?? '', opts, sel, data.level);
      if (lineageLabel && ability && spells.length > 0) {
        selectedOptionLabel = `${lineageLabel} (${spells.join(', ')})`;
      } else if (lineageLabel && ability) {
        selectedOptionLabel = lineageLabel;
      } else {
        selectedOptionLabel = null;
      }
    }
    if (nameLower === 'fiendish legacy') {
      const opts = f.options ?? [];
      if (opts.length >= 2) {
        hasOptions = true;
      }
      const sel = data.raceTraitSelections?.[f.name] ?? null;
      const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
      const legacyLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
      const spells = getFiendishLegacySpellsForCharacter(f.desc ?? '', opts, sel, data.level);
      if (legacyLabel && ability && spells.length > 0) {
        selectedOptionLabel = `${legacyLabel} (${spells.join(', ')})`;
      } else if (legacyLabel && ability) {
        selectedOptionLabel = legacyLabel;
      } else {
        selectedOptionLabel = null;
      }
    }
    if (nameLower === 'gnomish lineage') {
      const opts = f.options ?? [];
      if (opts.length >= 2) {
        hasOptions = true;
      }
      const sel = data.raceTraitSelections?.[f.name] ?? null;
      const ability = data.raceLineageSpellcastingAbility?.[f.name] ?? null;
      const lineageLabel = sel ? (opts.find((o) => o.key === sel)?.label ?? null) : null;
      const spells = getGnomishLineageSpellNamesForCharacter(sel, opts);
      if (lineageLabel && ability && spells.length > 0) {
        selectedOptionLabel = `${lineageLabel} (${spells.join(', ')})`;
      } else if (lineageLabel && ability) {
        selectedOptionLabel = lineageLabel;
      } else {
        selectedOptionLabel = null;
      }
    }
    if (nameLower === 'skillful') {
      const opts = f.options ?? [];
      if (opts.length >= 1) {
        hasOptions = true;
        const sel = data.raceTraitSelections?.[f.name] ?? null;
        if (sel && opts.some((o) => o.key === sel)) {
          selectedOptionLabel = opts.find((o) => o.key === sel)?.label ?? 'chosen';
        }
      }
    }
    if (nameLower === 'expertise') {
      hasOptions = true;
      const expertiseFeat = featureDetails.find(
        (fd) => fd.source === 'class' && fd.name.trim().toLowerCase() === 'expertise'
      );
      const gainCount = expertiseFeat?.gainCount ?? 1;
      const maxSelections = gainCount * 2;
      const classExKeys = getClassExpertiseSkillKeys(data);
      if (classExKeys.length >= maxSelections) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'deft explorer') {
      hasOptions = true;
      if (
        data.deftExplorerExpertiseSkillKey &&
        (data.deftExplorerLanguageNames?.length ?? 0) >= 2
      ) {
        selectedOptionLabel = 'chosen';
      }
    }
    if (nameLower === 'scholar') {
      hasOptions = true;
      if (data.scholarExpertiseSkillKey) selectedOptionLabel = 'chosen';
    }
    if (isThievesCantFeatureName(f.name)) {
      hasOptions = true;
      if (String(data.thievesCantExtraLanguageName ?? '').trim()) {
        selectedOptionLabel = 'chosen';
      }
    }
    if (nameLower === 'metamagic') {
      hasOptions = true;
      const metamagicFeat = featureDetails.find(
        (fd) => fd.source === 'class' && fd.name.trim().toLowerCase() === 'metamagic'
      );
      const gainCount = metamagicFeat?.gainCount ?? 1;
      const maxSelections = gainCount * 2;
      const selected = data.metamagicOptionKeys ?? [];
      if (selected.length >= maxSelections) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'eldritch invocations' || nameLower === 'eldritch invocation') {
      hasOptions = true;
      const eiFeat = featureDetails.find(
        (fd) =>
          fd.source === 'class' &&
          (fd.name.trim().toLowerCase() === 'eldritch invocations' ||
            fd.name.trim().toLowerCase() === 'eldritch invocation')
      );
      const maxKnown = getEldritchInvocationsKnown(eiFeat, data.level) || (eiFeat?.gainCount ?? 0);
      const optionDescByKey = new Map(
        (eiFeat?.options ?? []).map((o) => [o.key, o.desc ?? ''] as const)
      );
      if (
        maxKnown > 0 &&
        areEldritchInvocationsFullyChosen(
          data.eldritchInvocationSelections ?? [],
          optionDescByKey,
          maxKnown
        )
      ) {
        selectedOptionLabel = 'chosen';
      }
    }
    if (nameLower === 'ability score improvement') {
      hasOptions = true;
      if (isAbilityScoreImprovementFullyResolved(data)) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'mystic arcanum') {
      hasOptions = true;
      if (isMysticArcanumFullyChosen(data)) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'signature spells') {
      hasOptions = true;
      if (isSignatureSpellsFullyChosen(data)) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'spell mastery') {
      hasOptions = true;
      if (isSpellMasteryFullyChosen(data)) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'epic boon') {
      hasOptions = true;
      if (getEffectiveEpicBoonAbilityScore(data) != null) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'versatile') {
      hasOptions = true;
      if (data.versatileFeatId) selectedOptionLabel = 'chosen';
    }
    if (nameLower === 'fighting style') {
      hasOptions = true;
      const fsMode = data.fightingStyleMode ?? 'OPTION';
      if (fsMode === 'FEAT' && data.fightingStyleFeatId) selectedOptionLabel = 'chosen';
      else if (fsMode === 'OPTION' && data.raceTraitSelections?.['Fighting Style']) {
        // Blessed/Druidic Warrior also requires its cantrips before it counts as done.
        const cantripGrant = getFightingStyleCantripGrant(data);
        if (!cantripGrant || (data.fightingStyleCantrips?.length ?? 0) >= cantripGrant.max) {
          selectedOptionLabel = 'chosen';
        }
      }
    }
    if (nameLower === 'weapon mastery' && weaponMasteryMeta.hasWeaponMasteryFeature) {
      hasOptions = true;
      const current = weaponMasteryMeta.currentSelections.length;
      const max = weaponMasteryMeta.maxSelections;
      if (current > 0 && (max === 0 || current >= max)) selectedOptionLabel = 'chosen';
    }
    list.push({ index, name: f.name, hasOptions, selectedOptionLabel });
    bySource.set(source, list);
  });

  const featIdByNormalizedName = new Map<string, string>();
  for (const feat of featsList) {
    const key = normalizeFeatName(feat.name ?? '');
    if (!key || featIdByNormalizedName.has(key)) continue;
    featIdByNormalizedName.set(key, feat.id);
  }
  const backgroundFeatIds = (featureDetails ?? [])
    .filter((f) => f.source === 'background')
    .map((f) => featIdByNormalizedName.get(normalizeFeatName(f.name ?? '')) ?? null)
    .filter((id): id is string => id != null);

  const additionalFeatIds = [
    ...backgroundFeatIds,
    ...(data.abilityScoreImprovementByGain ?? [])
      .filter(
        (g): g is { kind: 'feat'; featId: string } =>
          g?.kind === 'feat' && typeof g.featId === 'string'
      )
      .map((g) => g.featId),
    ...(data.fightingStyleFeatId ? [data.fightingStyleFeatId] : []),
    ...(data.epicBoonFeatId ? [data.epicBoonFeatId] : []),
    ...(data.versatileFeatId ? [data.versatileFeatId] : []),
    // Origin feats granted by Eldritch Invocations (Lessons of the First Ones).
    ...(data.eldritchInvocationSelections ?? [])
      .map((s) => s.featId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);
  const hasAdditionalFeat = additionalFeatIds.length > 0;
  const hasGrapplerFeat = additionalFeatIds.some((id) => {
    const feat = featsList.find((f) => f.id === id);
    return normalizeFeatName(feat?.name ?? '') === 'grappler';
  });

  useEffect(() => {
    if (!hasGrapplerFeat && data.grapplerAbilityScore) {
      onChange({ ...data, grapplerAbilityScore: null });
    }
  }, [data, onChange, hasGrapplerFeat]);

  return (
    <>
      <Section
        title="Features & Traits"
        icon={<Swords className="h-4 w-4" />}
        className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
          {featureDetails.length > 0 && (
            <p className="shrink-0 text-xs text-muted-foreground">Click an item to see details.</p>
          )}
          {SOURCE_ORDER.map((source) => {
            const items = bySource.get(source) ?? [];
            const config = SOURCE_CONFIG[source];
            const isEmpty = items.length === 0;
            return (
              <div
                key={source}
                className="flex max-h-72 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-muted/40"
                role="listitem"
              >
                <div
                  className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <Scroll className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wider">
                    {getGroupLabel(source)}
                  </span>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
                  <div className="flex w-full min-w-0 max-w-full flex-wrap gap-1.5">
                    {isEmpty ? (
                      <p className="text-xs text-muted-foreground">{config.fallback}</p>
                    ) : (
                      items.map((item) => {
                        const isOpen = selectedFeatureIndex === item.index;
                        const isChoiceFeature = item.hasOptions;
                        const needsChoice = isChoiceFeature && !item.selectedOptionLabel;
                        const choiceButtonClass = cn(
                          'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          needsChoice
                            ? needsChoiceHighlight(saveAttempted)
                            : 'border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80',
                          isOpen && 'bg-primary/10 text-primary'
                        );
                        const defaultButtonClass = cn(
                          'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full border border-transparent bg-secondary/60 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isOpen && 'bg-primary/20 text-primary'
                        );
                        const buttonClass =
                          isChoiceFeature && needsChoice ? choiceButtonClass : defaultButtonClass;
                        return (
                          <button
                            key={`${item.name}-${item.index}`}
                            type="button"
                            data-editable="true"
                            onClick={() => setSelectedFeatureIndex(item.index)}
                            className={buttonClass}
                            aria-label={`View details for ${item.name}`}
                            aria-pressed={isOpen}
                          >
                            <span className="block min-w-0 flex-1 truncate text-left">
                              <TruncatedTooltip text={item.name} className="truncate" />
                            </span>
                            <ChevronRight
                              className={cn(
                                'h-3 w-3 shrink-0',
                                isChoiceFeature && needsChoice
                                  ? needsChoiceAccent(saveAttempted)
                                  : 'text-muted-foreground'
                              )}
                              aria-hidden
                            />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {hasAdditionalFeat && (
            <div
              key="additional-feat"
              className="flex max-h-72 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-muted/40"
              role="listitem"
            >
              <div
                className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Scroll className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wider">
                  Feats
                </span>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
                <div className="flex w-full min-w-0 max-w-full flex-wrap gap-1.5">
                  {additionalFeatIds
                    .map((id) => featsList.find((f) => f.id === id))
                    .filter((f): f is NonNullable<typeof f> => f != null)
                    .map((feat) => {
                      const isOpen =
                        additionalFeatDialogOpen && selectedAdditionalFeatId === feat.id;
                      const featNameLower = feat.name.trim().toLowerCase();
                      const isSkilled = featNameLower === 'skilled';
                      const isGrappler = featNameLower === 'grappler';
                      const needsSkilledChoice = isSkilled && !isSkilledFullyChosen(data, featsList);
                      const needsGrapplerChoice = isGrappler && !data.grapplerAbilityScore;
                      const isMagicInitiate = isMagicInitiateFeatureName(feat.name);
                      const needsMagicInitiateChoice =
                        isMagicInitiate && !isMagicInitiateFullyChosen(data);
                      const needsChoice =
                        needsSkilledChoice || needsGrapplerChoice || needsMagicInitiateChoice;
                      return (
                        <button
                          key={feat.id}
                          type="button"
                          data-editable="true"
                          onClick={() => {
                            setSelectedAdditionalFeatId(feat.id);
                            setAdditionalFeatDialogOpen(true);
                          }}
                          className={cn(
                            'flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            needsChoice
                              ? cn('border', needsChoiceHighlight(saveAttempted))
                              : 'border border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80',
                            isOpen && 'bg-primary/20 text-primary'
                          )}
                          aria-label={`View details for ${feat.name}`}
                          aria-pressed={isOpen}
                        >
                          <span className="block min-w-0 flex-1 truncate text-left">
                            <TruncatedTooltip text={feat.name} className="truncate" />
                          </span>
                          <ChevronRight
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>

        <Dialog
          open={selectedFeatureIndex !== null || additionalFeatDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedFeatureIndex(null);
              setAdditionalFeatDialogOpen(false);
              setSelectedAdditionalFeatId(null);
            }
          }}
        >
          <DialogContent
            className="flex max-h-[85vh] min-h-0 w-full min-w-[360px] max-w-2xl flex-col overflow-hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <FeatureDetailContent
              selectedFeatureIndex={selectedFeatureIndex}
              additionalFeatDialogOpen={additionalFeatDialogOpen}
              selectedAdditionalFeatId={selectedAdditionalFeatId}
            />
          </DialogContent>
        </Dialog>
      </Section>
    </>
  );
}
