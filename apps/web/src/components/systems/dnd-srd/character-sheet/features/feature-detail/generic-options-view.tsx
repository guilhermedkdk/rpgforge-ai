'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { isThievesCantFeatureName } from '@/lib/dnd-srd/character-state';
import { getTextContent, splitDeftExplorerDesc } from '../../helpers';
import { isSpellcastingTableFeature } from './spellcasting-table-view';
import { isInlineColumnTableFeature } from './feature-column-table-view';
import {
  DeftExplorerExpertisePickerBlock,
  DeftExplorerLanguagesPickerBlock,
  ThievesCantLanguagePickerBlock,
} from './deft-explorer-pickers';
import type { FeatureDetail } from './types';
import { SELECTION_INLINE_TOP_RULE } from './feature-detail-primitives';
import {
  FeatureOptionRow,
  featureSelectionCheckboxClass,
  featureSelectionRowClass,
} from './feature-selection-row';

const READ_ONLY_OPTION_NAMES = new Set([
  'improved blessed strikes',
  'improved elemental fury',
]);

const SKIP_INLINE_OPTION_NAMES = new Set([
  'keen senses',
  'skillful',
  'improved blessed strikes',
  'improved elemental fury',
]);

interface GenericOptionsViewProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
  standardLanguageOptions: RuleItemResponse[];
}

/**
 * Renders the primary description / option-picker content for most features.
 * Handles:
 * - Segmented options (Divine Order, Elemental Fury, etc.)
 * - Thieves' Cant language picker
 * - Deft Explorer split description + embedded pickers
 * - Default ReactMarkdown with interactive `p` / `tr` components for inline option picking
 */
export function GenericOptionsView({
  feat,
  data,
  onChange,
  skillsList,
  standardLanguageOptions,
}: GenericOptionsViewProps) {
  if (!feat) return null;

  // Skip when a dedicated table-stitching view already renders this feature's description.
  if (isSpellcastingTableFeature(feat)) return null;
  if (isInlineColumnTableFeature(feat)) return null;

  const opts = feat.options ?? [];
  const featureName = feat.name ?? '';
  const desc = feat.desc ?? '';
  const featureNameLower = featureName.trim().toLowerCase();

  // Single-choice selection for the data-driven option pickers (segmented cards + markdown p/tr):
  // picking an option locks the others (they render disabled), and clicking the selected one clears
  // it — so to switch you deselect first, the same standard the feat selectors follow.
  const optionSelectionState = (readKey: string, writeKey: string, optionKey: string) => {
    const selectedKey = data.raceTraitSelections?.[readKey] ?? null;
    const isSelected = selectedKey === optionKey;
    const lockedByOther = selectedKey != null && selectedKey !== '' && !isSelected;
    return {
      isSelected,
      lockedByOther,
      select: () =>
        onChange({
          ...data,
          raceTraitSelections: {
            ...(data.raceTraitSelections ?? {}),
            [writeKey]: isSelected ? '' : optionKey,
          },
        }),
    };
  };
  if (
    opts.length >= 2 &&
    featureName &&
    featureNameLower !== 'keen senses' &&
    featureNameLower !== 'skillful' &&
    !isThievesCantFeatureName(featureName)
  ) {
    const isImprovedBlessed = featureNameLower === 'improved blessed strikes';
    const isImprovedElemental = featureNameLower === 'improved elemental fury';
    const isReadOnly = READ_ONLY_OPTION_NAMES.has(featureNameLower);
    const baseFeatureName = isImprovedBlessed
      ? 'Blessed Strikes'
      : isImprovedElemental
        ? 'Elemental Fury'
        : featureName;

    const withIndex: { option: { key: string; label: string }; index: number }[] = [];
    for (const o of opts) {
      const label = o.label.trim();
      const variants = [
        `\n\n**${label}.**`,
        `\n\n${label}.`,
        `\n\n**${label}**`,
        `\n\n${label}:`,
        `**${label}.**`,
        `${label}.`,
        `**${label}**`,
        `${label}:`,
      ];
      let idx = -1;
      for (const v of variants) {
        const i = desc.indexOf(v);
        if (i >= 0 && (idx < 0 || i < idx)) idx = i;
      }
      withIndex.push({ option: o, index: idx });
    }
    const sorted = [...withIndex].sort((a, b) => a.index - b.index);
    const allFound = sorted.every((s) => s.index >= 0);

    if (allFound && sorted.length >= 2) {
      // Strip a dangling list marker left over when options come from a markdown bullet list.
      const stripTrailingBullet = (s: string) => s.replace(/\n[ \t]*[-*][ \t]*$/, '').trim();
      const intro = stripTrailingBullet(desc.slice(0, sorted[0].index));
      const segmentClass = '[&_p]:mb-1.5 [&_p:last-child]:mb-0';
      return (
        <div className="flex flex-col gap-4">
          {intro.length > 0 && (
            <div className={segmentClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{intro}</ReactMarkdown>
            </div>
          )}
          <div
            className={cn('flex flex-col gap-4', intro.length > 0 && SELECTION_INLINE_TOP_RULE)}
          >
            <div
              className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
              role="list"
              aria-label="Feature options"
            >
              {sorted.map(({ option, index }, i) => {
                const nextIndex = sorted[i + 1]?.index ?? desc.length;
                const blockText = stripTrailingBullet(desc.slice(index, nextIndex));
                const { isSelected, lockedByOther, select } = optionSelectionState(
                  baseFeatureName,
                  featureName,
                  option.key,
                );
                const isDisabled = isReadOnly || lockedByOther;
                return (
                  <FeatureOptionRow
                    key={option.key}
                    selected={isSelected}
                    disabled={isDisabled}
                    alignTop
                    onClick={isDisabled ? undefined : select}
                  >
                    <div className="text-sm text-muted-foreground [&_p]:mb-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:text-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{blockText}</ReactMarkdown>
                    </div>
                  </FeatureOptionRow>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
  }
  if (isThievesCantFeatureName(featureName)) {
    const segmentClass = '[&_p]:mb-1.5 [&_p:last-child]:mb-0';
    return (
      <>
        {desc.trim().length > 0 ? (
          <div className={segmentClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{desc}</ReactMarkdown>
          </div>
        ) : null}
        <ThievesCantLanguagePickerBlock
          variant="embedded"
          data={data}
          onChange={onChange}
          standardLanguageOptions={standardLanguageOptions}
        />
      </>
    );
  }
  if (featureNameLower === 'deft explorer') {
    const split = splitDeftExplorerDesc(desc);
    const segmentClass = '[&_p]:mb-1.5 [&_p:last-child]:mb-0';
    if (split) {
      return (
        <>
          {split.beforeExpertise.length > 0 ? (
            <div className={segmentClass}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{split.beforeExpertise}</ReactMarkdown>
            </div>
          ) : null}
          <div className={segmentClass}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{split.expertiseSection}</ReactMarkdown>
          </div>
          <DeftExplorerExpertisePickerBlock
            variant="embedded"
            data={data}
            onChange={onChange}
            skillsList={skillsList}
          />
          <div className={cn(segmentClass, 'mt-4')}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{split.languagesSection}</ReactMarkdown>
          </div>
          <DeftExplorerLanguagesPickerBlock
            variant="embedded"
            data={data}
            onChange={onChange}
            skillsList={skillsList}
            standardLanguageOptions={standardLanguageOptions}
          />
        </>
      );
    }
  }
  const rawDesc = feat.desc ?? '';
  const rawLower = rawDesc.toLowerCase();

  const sanitizedDesc = (() => {
    if (featureNameLower !== 'fighting style') return rawDesc || 'No description available.';

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match =
      rawDesc.match(/\*{0,2}\s*([A-Za-z][A-Za-z\s'-]*Warrior)\.\s*\*{0,2}/i) ??
      rawDesc.match(/\*{1,2}\s*([A-Za-z][A-Za-z\s'-]*Warrior)\.\s*\*{1,2}/i) ??
      rawDesc.match(/\b([A-Za-z][A-Za-z\s'-]*Warrior)\.\s*/i);
    const optionBelowTitle = match?.[1]?.trim() ?? '';

    if (optionBelowTitle && rawLower.includes(optionBelowTitle.toLowerCase())) {
      const re = new RegExp(
        `\\*{0,2}\\s*${escapeRegExp(optionBelowTitle)}\\.?\\s*\\*{0,2}[\\s\\S]*$`,
        'i',
      );
      const m = re.exec(rawDesc);
      const cutIndex = m && m.index != null ? m.index : -1;
      const base = cutIndex >= 0 ? rawDesc.slice(0, cutIndex).trim() : rawDesc.trim();
      return (base.replace(/\*+\s*$/, '').trim()) || rawDesc;
    }
    return rawDesc || 'No description available.';
  })();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => {
          const featureOpts = feat.options;
          const fName = feat.name;
          const fNameLower = fName ? fName.trim().toLowerCase() : '';
          if (
            !featureOpts ||
            featureOpts.length < 2 ||
            !fName ||
            SKIP_INLINE_OPTION_NAMES.has(fNameLower)
          ) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          }
          const text = getTextContent(children);
          const opt = featureOpts.find((o) => {
            const label = o.label.trim().toLowerCase();
            const t = text.trim().toLowerCase();
            return t.startsWith(label) || t.startsWith(`${label}.`);
          });
          if (!opt) return <p className="mb-2 last:mb-0">{children}</p>;
          const { isSelected, lockedByOther, select } = optionSelectionState(fName, fName, opt.key);
          return (
            <button
              type="button"
              disabled={lockedByOther}
              onClick={lockedByOther ? undefined : select}
              className={cn(featureSelectionRowClass(lockedByOther), 'mb-2 last:mb-0 w-full')}
            >
              <span className={featureSelectionCheckboxClass(isSelected)} aria-hidden>
                {isSelected ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 items-center text-left text-xs font-medium leading-4 text-foreground">
                {children}
              </span>
            </button>
          );
        },
        tr: ({ children }) => {
          const featureOpts = feat.options;
          const fName = feat.name;
          const fNameLower = fName ? fName.trim().toLowerCase() : '';
          if (
            !featureOpts ||
            featureOpts.length < 2 ||
            !fName ||
            SKIP_INLINE_OPTION_NAMES.has(fNameLower)
          ) {
            return <tr>{children}</tr>;
          }
          const childArray = Array.isArray(children) ? children : [children];
          const firstChild = childArray[0];
          const firstCellText = getTextContent(firstChild);
          const isHeaderRow = React.isValidElement(firstChild) && firstChild.type === 'th';
          const opt = featureOpts.find(
            (o) => firstCellText.trim().toLowerCase() === o.label.trim().toLowerCase(),
          );
          const selectionColClass =
            'w-10 min-w-10 max-w-10 border border-border align-middle text-center py-2 px-1';
          const emptyColCell = isHeaderRow ? (
            <th className={cn(selectionColClass, 'bg-muted/50')} scope="col" aria-label="Selection" />
          ) : (
            <td className={selectionColClass} />
          );
          if (!opt) {
            return (
              <tr>
                {emptyColCell}
                {childArray}
              </tr>
            );
          }
          const { isSelected, lockedByOther, select } = optionSelectionState(fName, fName, opt.key);
          const checkboxCell = (
            <td className="relative w-10 min-w-10 max-w-10 border border-border p-0 align-middle">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={featureSelectionCheckboxClass(isSelected)} aria-hidden>
                  {isSelected ? (
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  ) : null}
                </span>
              </div>
              <span className="invisible inline-block w-px select-none py-2" aria-hidden>
                &nbsp;
              </span>
            </td>
          );
          return (
            <tr
              role="button"
              tabIndex={0}
              aria-disabled={lockedByOther}
              onClick={lockedByOther ? undefined : select}
              onKeyDown={(e) => {
                if (!lockedByOther && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  select();
                }
              }}
              className={cn(
                'transition-colors',
                lockedByOther
                  ? 'cursor-not-allowed opacity-60'
                  : isSelected
                    ? 'cursor-pointer bg-primary/10'
                    : 'cursor-pointer hover:bg-muted/40',
              )}
            >
              {checkboxCell}
              {childArray}
            </tr>
          );
        },
      }}
    >
      {sanitizedDesc}
    </ReactMarkdown>
  );
}
