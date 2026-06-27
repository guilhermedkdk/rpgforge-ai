'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { getFightingStyleCantripGrant } from '@/lib/dnd-srd/character-state';
import {
  buildEffectiveAttributeScores,
  evaluateFeatPrerequisite,
  getFeatMeta,
} from '@/lib/dnd-srd/feat-prerequisites';
import type { FeatureDetail } from './types';
import {
  FEATURE_DETAIL_OPTION_BODY_STACK,
  FEATURE_DETAIL_OPTION_BODY_STACK_COMPACT,
  SelectionSection,
} from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';
import { FightingStyleCantripPanel } from './fighting-style-cantrip-panel';

interface FightingStylePanelProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
  classes: RuleItemResponse[];
}

export function FightingStylePanel({
  feat,
  data,
  onChange,
  featsList,
  classes,
}: FightingStylePanelProps) {
  const cantripGrant = getFightingStyleCantripGrant(data);
  const classPackId = classes.find((c) => c.id === data.classRuleItemId)?.packId ?? null;
  const fightingStyleFeatsAll = featsList.filter((f) => {
    const raw = (f.normalized ?? f.raw ?? {}) as { type?: string | null };
    const type = (raw.type ?? (f.raw as Record<string, unknown> | undefined)?.type ?? '') as string;
    return type?.toLowerCase() === 'fighting style';
  });

  const fsMode = data.fightingStyleMode ?? 'OPTION';
  const opts = feat.options ?? [];
  const desc = feat.desc ?? '';
  const featureName = feat.name ?? '';

  const detectedOptionBelowTitle = (() => {
    const m1 = desc.match(/\*{0,2}\s*([A-Za-z][A-Za-z\s'-]*Warrior)\.\s*\*{0,2}/i);
    const m2 = desc.match(/\b([A-Za-z][A-Za-z\s'-]*Warrior)\.\s*/i);
    return (m1?.[1] ?? m2?.[1] ?? '').trim();
  })();
  const optionBelowTitleLower = detectedOptionBelowTitle
    ? detectedOptionBelowTitle.toLowerCase()
    : null;

  const fightingStyleFeats = optionBelowTitleLower
    ? fightingStyleFeatsAll.filter(
        (f) =>
          f.name.trim().toLowerCase().replace(/\.+$/, '') !==
          optionBelowTitleLower.replace(/\.+$/, ''),
      )
    : fightingStyleFeatsAll;

  const detectedOptionFallback = detectedOptionBelowTitle
    ? [
        {
          label: detectedOptionBelowTitle,
          key: detectedOptionBelowTitle
            .toLowerCase()
            .replace(/\.+$/, '')
            .replace(/['\s]+/g, '-'),
        },
      ]
    : [];

  const styleOptionsRaw = opts.length > 0 ? opts : detectedOptionFallback;
  const styleOptions = optionBelowTitleLower
    ? styleOptionsRaw.filter(
        (o) =>
          o.label.trim().toLowerCase().replace(/\.+$/, '') ===
          optionBelowTitleLower.replace(/\.+$/, ''),
      )
    : styleOptionsRaw;

  const optionTabLabel =
    styleOptions[0]?.label?.trim() || detectedOptionBelowTitle || 'Choose Option';
  const hasFeatOptions = fightingStyleFeats.length > 0;
  const hasTextOptions = styleOptions.length >= 1;
  const showToggle = hasTextOptions && hasFeatOptions;

  const effectiveAttributeScores = buildEffectiveAttributeScores(data);
  const featureNamesLower = new Set(
    (data.featureDetails ?? []).map((fd) => fd.name.trim().toLowerCase()),
  );

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const getOptionStartIndex = (full: string, label: string): number => {
    const l = label.trim();
    if (!l) return -1;
    const escaped = escapeRegExp(l);
    const patterns = [
      new RegExp(`\\*\\*\\s*${escaped}\\s*\\.?\\s*\\*\\*`, 'i'),
      new RegExp(`(^|\\n)\\s*-\\s*${escaped}\\s*\\.\\s*`, 'i'),
      new RegExp(`(^|\\n)\\s*${escaped}\\s*\\.\\s*`, 'i'),
      new RegExp(`${escaped}\\s*\\.\\s*`, 'i'),
    ];
    for (const re of patterns) {
      const m = re.exec(full);
      if (m && typeof m.index === 'number') return m.index;
    }
    return -1;
  };

  const withIndex = styleOptions
    .map((o) => ({ option: o, index: getOptionStartIndex(desc, o.label) }))
    .filter((x) => x.index >= 0)
    .sort((a, b) => a.index - b.index);

  const indexByKey = new Map<string, number>(withIndex.map((x) => [x.option.key, x.index]));
  const nextIndexByKey = new Map<string, number>();
  for (let i = 0; i < withIndex.length; i++) {
    const key = withIndex[i]?.option?.key;
    if (!key) continue;
    nextIndexByKey.set(key, withIndex[i + 1]?.index ?? desc.length);
  }

  return (
    <SelectionSection>
      {showToggle && (
        <div className="mb-4 flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => onChange({ ...data, fightingStyleMode: 'OPTION' })}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none',
              fsMode === 'OPTION'
                ? 'bg-primary/15 text-primary'
                : 'bg-background text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={fsMode === 'OPTION'}
          >
            {optionTabLabel}
          </button>
          <div className="w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => onChange({ ...data, fightingStyleMode: 'FEAT' })}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none',
              fsMode === 'FEAT'
                ? 'bg-primary/15 text-primary'
                : 'bg-background text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={fsMode === 'FEAT'}
          >
            Choose Feat
          </button>
        </div>
      )}

      {(fsMode === 'OPTION' || !showToggle) && hasTextOptions && (
        <div className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1">
          {styleOptions.map((option) => {
            const selectedKey = data.raceTraitSelections?.[featureName] ?? null;
            const isSelected = selectedKey === option.key;
            const start = indexByKey.get(option.key);
            const nextIndex = nextIndexByKey.get(option.key) ?? desc.length;
            const blockText =
              typeof start === 'number' && start >= 0
                ? desc.slice(start, nextIndex).trim()
                : null;
            const normalizedOptLabel = option.label.trim().toLowerCase();
            const matchingFeat = fightingStyleFeatsAll.find(
              (f) =>
                f.name.trim().toLowerCase().replace(/\.+$/, '') ===
                normalizedOptLabel.replace(/\.+$/, ''),
            );
            const matchedMeta = matchingFeat
              ? getFeatMeta(matchingFeat)
              : { benefitDescs: [], prerequisite: '' };

            return (
              <FeatureOptionRow
                key={option.key}
                selected={isSelected}
                alignTop
                mark="check"
                onClick={() => {
                  const matchingFeatId = matchingFeat?.id ?? null;
                  onChange({
                    ...data,
                    fightingStyleMode: 'OPTION',
                    fightingStyleFeatId: matchingFeatId,
                    raceTraitSelections: {
                      ...(data.raceTraitSelections ?? {}),
                      [featureName]: option.key,
                    },
                  });
                }}
              >
                <div className="text-sm text-muted-foreground [&_p]:mb-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:text-foreground">
                  {blockText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{blockText}</ReactMarkdown>
                  ) : (
                    <>
                      <strong className="text-foreground">{option.label}.</strong>
                      {matchedMeta.prerequisite ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          <span className="font-medium">Prerequisite:</span>{' '}
                          {matchedMeta.prerequisite}
                        </span>
                      ) : null}
                      {matchedMeta.benefitDescs.length > 0 ? (
                        <div className={FEATURE_DETAIL_OPTION_BODY_STACK_COMPACT}>
                          {(() => {
                            const prefixRe = new RegExp(
                              `^${escapeRegExp(option.label.trim())}\\.\\s*`,
                              'i',
                            );
                            return matchedMeta.benefitDescs
                              .map((d) => d.replace(prefixRe, '').trim())
                              .filter(Boolean)
                              .map((d, idx) => (
                                <span
                                  key={idx}
                                  className="whitespace-pre-line text-xs text-muted-foreground"
                                >
                                  {d}
                                </span>
                              ));
                          })()}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}

      {(fsMode === 'FEAT' || !showToggle) && hasFeatOptions && (
        <div className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1">
          {fightingStyleFeats.map((f) => {
            const { benefitDescs, prerequisite } = getFeatMeta(f);
            const isSelected = (data.fightingStyleFeatId ?? null) === f.id;
            const unmetPrerequisites = evaluateFeatPrerequisite(
              prerequisite,
              data,
              effectiveAttributeScores,
              featureNamesLower,
            );
            // Once a feat is chosen, the others lock — deselect to switch (same rule as Expertise).
            const disabled =
              unmetPrerequisites.length > 0 ||
              (data.fightingStyleFeatId != null && data.fightingStyleFeatId !== f.id);
            return (
              <FeatureOptionRow
                key={f.id}
                selected={isSelected}
                disabled={disabled}
                alignTop
                mark="check"
                onClick={() => {
                  if (disabled) return;
                  onChange({
                    ...data,
                    fightingStyleMode: 'FEAT',
                    fightingStyleFeatId: isSelected ? null : f.id,
                    raceTraitSelections: {
                      ...(data.raceTraitSelections ?? {}),
                      ['Fighting Style']: '',
                    },
                  });
                }}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground">{f.name}</span>
                  {prerequisite ? (
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium">Prerequisite:</span> {prerequisite}
                    </span>
                  ) : null}
                  {benefitDescs.length > 0 && (
                    <div className={FEATURE_DETAIL_OPTION_BODY_STACK}>
                      {benefitDescs.map((d, idx) => (
                        <span key={idx} className="whitespace-pre-line text-xs text-muted-foreground">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}

      {cantripGrant && (
        <FightingStyleCantripPanel
          data={data}
          onChange={onChange}
          grant={cantripGrant}
          packId={classPackId}
        />
      )}
    </SelectionSection>
  );
}
