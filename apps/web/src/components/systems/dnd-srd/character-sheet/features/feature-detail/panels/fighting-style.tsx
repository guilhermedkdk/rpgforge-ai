'use client';

import * as React from 'react';
import { buildOwnedFeatIdsSet, getFightingStyleCantripGrant, getFightingStylePick, setFightingStylePick, buildEffectiveAttributeScores, evaluateFeatPrerequisite, getFeatMeta, isFightingStyleFeat, type RuleItemResponse, type CharacterFormData } from '@rpgforce-ai/shared';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FeatureDetail } from '../shared/types';
import {
  FeatOptionRowBody,
  FEATURE_DETAIL_OPTION_BODY_STACK_COMPACT,
  SelectionSection,
} from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';
import { FightingStyleCantripPanel } from './fighting-style-cantrip';

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
  // Everything on this panel is scoped to THIS class's instance: a Fighter/Paladin picks twice.
  const pick = getFightingStylePick(data, feat);
  const cantripGrant = getFightingStyleCantripGrant(data, feat);
  const classPackId = classes.find((c) => c.id === data.classRuleItemId)?.packId ?? null;
  const fightingStyleFeatsAll = featsList.filter(isFightingStyleFeat);

  const fsMode = pick.mode;
  const opts = feat.options ?? [];
  const desc = feat.desc ?? '';

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

  const selectedFeatId = pick.featId ?? '';
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
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
            onClick={() => onChange({ ...data, ...setFightingStylePick(data, feat, { mode: 'OPTION' }) })}
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
            onClick={() => onChange({ ...data, ...setFightingStylePick(data, feat, { mode: 'FEAT' }) })}
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
        <div
          className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label="Fighting Style options"
        >
          {styleOptions.map((option) => {
            const selectedKey = pick.optionKey;
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
                  onChange({
                    ...data,
                    ...setFightingStylePick(data, feat, {
                      mode: 'OPTION',
                      featId: matchingFeat?.id ?? null,
                      optionKey: option.key,
                    }),
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
        <div
          className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label="Fighting Style feats"
        >
          {fightingStyleFeats.map((f) => {
            const { prerequisite } = getFeatMeta(f);
            // Style already gained from another source (e.g. Champion's Additional Fighting Style):
            // checked and locked, same reading as the other feat selectors.
            const isAlreadyOwned = ownedFeatIdsSet.has(f.id) && f.id !== selectedFeatId;
            const isSelected = selectedFeatId === f.id || isAlreadyOwned;
            const unmetPrerequisites = evaluateFeatPrerequisite(
              prerequisite,
              data,
              effectiveAttributeScores,
              featureNamesLower,
            );
            // Once a feat is chosen, the others lock — deselect to switch (same rule as Expertise).
            const disabled =
              isAlreadyOwned ||
              unmetPrerequisites.length > 0 ||
              (selectedFeatId !== '' && selectedFeatId !== f.id);
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
                    ...setFightingStylePick(data, feat, {
                      mode: 'FEAT',
                      featId: isSelected ? null : f.id,
                      optionKey: null,
                      cantrips: [],
                    }),
                  });
                }}
              >
                <FeatOptionRowBody feat={f} />
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
          feat={feat}
          packId={classPackId}
        />
      )}
    </SelectionSection>
  );
}
