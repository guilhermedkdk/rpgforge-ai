'use client';

import * as React from 'react';

import { Swords, Shield, Wrench, BookOpen, Check, ChevronRight, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import {
  MAX_STANDARD_LANGUAGES_TOTAL,
  needsChoiceAccent,
  needsChoiceHighlightSoft,
} from '../constants';
import {
  DRUIDIC_DISPLAY_NAME,
  THIEVES_CANT_DISPLAY_NAME,
  isDruidicFeatureName,
  isThievesCantFeatureName,
} from '@/lib/dnd-srd/character-state';
import { getEffectiveProficiencies } from '@/lib/dnd-srd/derived-character-stats';
import {
  dedupeProficiencyLabelsPreserveOrder,
  dedupeRuleItemsByToolDisplay,
  getCommonLanguageItem,
  getKnownLanguageNamesExcept,
  getSkillsFromAbilities,
  normalizeStandardLanguageNames,
  parseProficiencyValueItems,
  parseToolProficiencyChoose,
  skilledToolChoiceKey,
  stripToolItemPriceSuffix,
  toggleStandardLanguageSelection,
  toolDisplayKey,
  updateToolProficiencyChoices,
} from '../helpers';

function mergeToolItemsByTags(
  categoryTags: string[],
  toolItemsByCategory: Record<string, RuleItemResponse[]>
): RuleItemResponse[] {
  const seen = new Set<string>();
  const out: RuleItemResponse[] = [];
  for (const tag of categoryTags) {
    for (const item of toolItemsByCategory[tag] ?? []) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

interface ProficienciesSectionProps {
  data: import('../types').CharacterFormData;
  onChange: (data: import('../types').CharacterFormData) => void;
  readOnly?: boolean;
  saveAttempted?: boolean;
}

export function ProficienciesSection({
  data,
  onChange,
  readOnly = false,
  saveAttempted = false,
}: ProficienciesSectionProps) {
  const {
    abilities,
    toolItemsByCategory,
    standardLanguageOptions,
    featureDetails,
  } = useCharacterComputed();

  const lines = getEffectiveProficiencies(data)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const classOptions = data.classSkillOptions ?? { keys: [], chooseN: null };
  const profSkillsList = getSkillsFromAbilities(abilities);
  const optionKeys =
    classOptions.keys.length > 0 ? classOptions.keys : profSkillsList.map((s) => s.key);
  const hasSkillsChoice = optionKeys.length > 0;

  const parsedLines = lines.map((line) => {
    const colonIdx = line.indexOf(':');
    const label = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : line;
    const valueStr = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : '';
    return { label, valueStr, line };
  });

  const fixedTypes: {
    key: string;
    label: string;
    icon: typeof Swords;
    fallbackMessage: string;
    matches: (label: string) => boolean;
  }[] = [
    {
      key: 'weapon',
      label: 'Weapon Proficiencies',
      icon: Swords,
      fallbackMessage: 'Determined by class.',
      matches: (l) => /weapon/i.test(l),
    },
    {
      key: 'armor',
      label: 'Armor Training',
      icon: Shield,
      fallbackMessage: 'Determined by class.',
      matches: (l) => /armor|shield/i.test(l),
    },
    {
      key: 'tool',
      label: 'Tool Proficiencies',
      icon: Wrench,
      fallbackMessage: 'Determined by background.',
      matches: (l) => /tool/i.test(l),
    },
    {
      key: 'languages',
      label: 'Languages',
      icon: BookOpen,
      fallbackMessage: '',
      matches: (l) => /language|idiom|idioma|idiomas/i.test(l),
    },
  ];

  /** Shown whenever the pack has standard language rule items — does not depend on a "Languages:" line in proficiencies. */
  const renderStandardLanguagePicker = (valueStr: string, lineLabel: string): React.ReactNode => {
    const badgeItems = valueStr.trim()
      ? dedupeProficiencyLabelsPreserveOrder(parseProficiencyValueItems(valueStr, lineLabel))
      : [];
    const normalizedSelection = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions
    );
    const selectedLower = new Set(normalizedSelection.map((n) => n.trim().toLowerCase()));
    const filteredBadges = badgeItems.filter((b) => !selectedLower.has(b.trim().toLowerCase()));
    const chooseComplete = normalizedSelection.length >= MAX_STANDARD_LANGUAGES_TOTAL;
    /** Badges-only layout only on sheet view; creation keeps the Choose languages control */
    const showLanguagesAsBadgesOnly = readOnly;
    const commonItem = getCommonLanguageItem(standardLanguageOptions);
    const restSorted = [...standardLanguageOptions]
      .filter((o) => o.id !== commonItem?.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const orderedLangOptions = commonItem ? [commonItem, ...restSorted] : restSorted;
    // Languages already learned from feats (Deft Explorer, Thieves' Cant): locked here so the same
    // language can't be taken twice across sources.
    const knownFromOtherSources = getKnownLanguageNamesExcept(
      data,
      'standard',
      standardLanguageOptions
    );

    const extraLanguageBadges = (
      <>
        {(data.deftExplorerLanguageNames ?? []).map((langName) => (
          <Badge
            key={langName.trim().toLowerCase()}
            variant="secondary"
            className="rounded-full px-2.5 py-0.5 text-xs font-normal"
          >
            {stripToolItemPriceSuffix(langName.trim())}
          </Badge>
        ))}
        {featureDetails.some((f) => f.source === 'class' && isThievesCantFeatureName(f.name)) ? (
          <>
            <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs font-normal">
              {THIEVES_CANT_DISPLAY_NAME}
            </Badge>
            {data.thievesCantExtraLanguageName?.trim() ? (
              <Badge
                key={`thieves-extra-${data.thievesCantExtraLanguageName.trim().toLowerCase()}`}
                variant="secondary"
                className="rounded-full px-2.5 py-0.5 text-xs font-normal"
              >
                {stripToolItemPriceSuffix(data.thievesCantExtraLanguageName.trim())}
              </Badge>
            ) : null}
          </>
        ) : null}
        {featureDetails.some((f) => f.source === 'class' && isDruidicFeatureName(f.name)) ? (
          <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-xs font-normal">
            {DRUIDIC_DISPLAY_NAME}
          </Badge>
        ) : null}
      </>
    );

    if (showLanguagesAsBadgesOnly) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {filteredBadges.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-xs font-normal"
            >
              {item}
            </Badge>
          ))}
          {normalizedSelection.map((lang) => (
            <Badge
              key={lang.trim().toLowerCase()}
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-xs font-normal"
            >
              {stripToolItemPriceSuffix(lang.trim())}
            </Badge>
          ))}
          {extraLanguageBadges}
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {filteredBadges.map((item) => (
          <Badge
            key={item}
            variant="secondary"
            className="rounded-full px-2.5 py-0.5 text-xs font-normal"
          >
            {item}
          </Badge>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                chooseComplete
                  ? 'border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80'
                  : needsChoiceHighlightSoft(saveAttempted)
              )}
              aria-label={`Choose languages, ${normalizedSelection.length} of ${MAX_STANDARD_LANGUAGES_TOTAL} selected`}
            >
              <BookOpen
                className={cn(
                  'h-3 w-3 shrink-0',
                  chooseComplete ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted)
                )}
                aria-hidden
              />
              {`Choose languages (${normalizedSelection.length}/${MAX_STANDARD_LANGUAGES_TOTAL})`}
              <ChevronRight
                className={cn(
                  'h-3 w-3 shrink-0',
                  chooseComplete ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted)
                )}
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="min-w-[280px] max-w-[320px] p-0"
            sideOffset={6}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Standard languages</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Choose {MAX_STANDARD_LANGUAGES_TOTAL - 1} from the list below.
              </p>
              <TooltipProvider delayDuration={300} skipDelayDuration={0}>
                <ul
                  className="max-h-64 space-y-2 overflow-y-auto"
                  role="list"
                  aria-label="Standard languages to choose"
                >
                  {orderedLangOptions.map((item) => {
                    const displayName = stripToolItemPriceSuffix(item.name);
                    const isCommon = commonItem != null && item.id === commonItem.id;
                    const selected = normalizedSelection.some(
                      (n) =>
                        n.trim().toLowerCase() === displayName.toLowerCase() ||
                        n.trim().toLowerCase() === item.name.trim().toLowerCase()
                    );
                    const knownElsewhere = knownFromOtherSources.has(
                      item.name.trim().toLowerCase()
                    );
                    const showChecked = selected || knownElsewhere;
                    const rowCheck = (
                      <>
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-[10px]',
                            showChecked
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'text-muted-foreground/50'
                          )}
                          aria-hidden
                        >
                          {showChecked ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                        </span>
                        <span className="text-xs font-medium text-foreground">{displayName}</span>
                      </>
                    );
                    if (isCommon) {
                      return (
                        <Tooltip key={item.id}>
                          <TooltipTrigger asChild>
                            <li
                              className="flex cursor-default items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 opacity-90"
                              role="listitem"
                              aria-label={`${displayName} (always known)`}
                            >
                              {rowCheck}
                              <Lock
                                className="ml-auto h-3 w-3 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            </li>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[240px] text-center">
                            Common is always included in your standard languages.
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    const maxReached =
                      normalizedSelection.length >= MAX_STANDARD_LANGUAGES_TOTAL && !selected;
                    const optionDisabled = maxReached || knownElsewhere;
                    return (
                      <li key={item.id} role="listitem">
                        <button
                          type="button"
                          disabled={optionDisabled}
                          onClick={() => {
                            toggleStandardLanguageSelection(
                              data,
                              onChange,
                              standardLanguageOptions,
                              item
                            );
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            optionDisabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
                          )}
                          aria-label={selected ? `Remove ${displayName}` : `Add ${displayName}`}
                          aria-pressed={selected}
                          aria-disabled={optionDisabled}
                        >
                          {rowCheck}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </TooltipProvider>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {extraLanguageBadges}
      </div>
    );
  };

  const renderProficiencyContent = (
    label: string,
    valueStr: string,
    lineIndex: number
  ): React.ReactNode => {
    const isSkillsLine = /^Skills$/i.test(label);
    if (isSkillsLine && hasSkillsChoice) return null;

    const isToolLine = /tool/i.test(label);
    if (isToolLine && valueStr) {
      const toolSegmentsRaw = valueStr
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      const toolSegments = dedupeProficiencyLabelsPreserveOrder(toolSegmentsRaw);
      const toolChoices = data.toolProficiencyChoices ?? {};
      /** Fixed grants (non-Choose segments) — cannot be picked again in a dropdown on this line. */
      const fixedGrantKeys = new Set<string>();
      for (const seg of toolSegments) {
        if (!parseToolProficiencyChoose(seg)) {
          fixedGrantKeys.add(toolDisplayKey(stripToolItemPriceSuffix(seg)));
        }
      }
      const toolElements: React.ReactNode[] = [];
      let hasToolChoice = false;
      toolSegments.forEach((segment, ti) => {
        const toolChoose = parseToolProficiencyChoose(segment);
        const merged = toolChoose
          ? mergeToolItemsByTags(toolChoose.categoryTags, toolItemsByCategory)
          : [];
        const toolItems = dedupeRuleItemsByToolDisplay(merged);
        const takenElsewhere = new Set<string>(fixedGrantKeys);
        for (const otherSeg of toolSegments) {
          if (otherSeg === segment) continue;
          for (const n of toolChoices[otherSeg] ?? []) {
            takenElsewhere.add(toolDisplayKey(n));
          }
        }
        if (toolChoose && toolItems.length > 0) {
          hasToolChoice = true;
          const chosen = toolChoices[segment] ?? [];
          const selectedCount = chosen.length;
          const chooseN = toolChoose.chooseN;
          const toolChoiceComplete = chooseN != null && chooseN > 0 && selectedCount >= chooseN;

          if (readOnly) {
            if (chosen.length > 0) {
              chosen.forEach((chosenName) => {
                const displayName = stripToolItemPriceSuffix(chosenName.trim());
                toolElements.push(
                  <Badge
                    key={`chosen-tool-${lineIndex}-${ti}-${displayName}`}
                    variant="secondary"
                    className="rounded-full px-2.5 py-0.5 text-xs font-normal"
                  >
                    {displayName}
                  </Badge>
                );
              });
            }
          } else {
          toolElements.push(
            <DropdownMenu key={`choose-${lineIndex}-${ti}-${segment}`}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    toolChoiceComplete
                      ? 'border-transparent bg-secondary/60 text-foreground hover:bg-secondary/80'
                      : needsChoiceHighlightSoft(saveAttempted)
                  )}
                  aria-label={`Choose ${chooseN} ${toolChoose.categoryLabel}`}
                >
                  <Wrench
                    className={cn(
                      'h-3 w-3 shrink-0',
                      toolChoiceComplete ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted)
                    )}
                    aria-hidden
                  />
                  {chooseN != null
                    ? `${selectedCount}/${chooseN} ${toolChoose.categoryLabel}`
                    : `Choose ${toolChoose.categoryLabel}`}
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 shrink-0',
                      toolChoiceComplete ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted)
                    )}
                    aria-hidden
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="right"
                className="min-w-[280px] max-w-[320px] p-0"
                sideOffset={6}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <div className="p-3">
                  <p className="mb-2 text-sm font-medium text-foreground">
                    {toolChoose.categoryLabel}
                  </p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    {chooseN != null
                      ? `Choose ${chooseN} from the list below.`
                      : 'Choose from the list below.'}
                  </p>
                  <ul
                    className="max-h-64 space-y-2 overflow-y-auto"
                    role="list"
                    aria-label={`${toolChoose.categoryLabel} options`}
                  >
                    {toolItems
                      .filter((item) => {
                        const k = toolDisplayKey(item.name);
                        const pickedHere = chosen.some(
                          (n) =>
                            toolDisplayKey(n) === k ||
                            stripToolItemPriceSuffix(n) === stripToolItemPriceSuffix(item.name)
                        );
                        if (pickedHere) return true;
                        return !takenElsewhere.has(k);
                      })
                      .map((item) => {
                        const displayName = stripToolItemPriceSuffix(item.name);
                        const selected = chosen.some(
                          (n) => stripToolItemPriceSuffix(n) === displayName || n === item.name
                        );
                        const maxReached = chooseN != null && chosen.length >= chooseN && !selected;
                        return (
                          <li key={item.id} role="listitem">
                            <button
                              type="button"
                              disabled={maxReached}
                              onClick={() => {
                                let next: string[];
                                if (selected) {
                                  next = chosen.filter(
                                    (n) =>
                                      stripToolItemPriceSuffix(n) !== displayName && n !== item.name
                                  );
                                } else if (!maxReached) {
                                  const withoutDupes = chosen.filter(
                                    (n) =>
                                      stripToolItemPriceSuffix(n) !== displayName && n !== item.name
                                  );
                                  next = [...withoutDupes, displayName];
                                } else {
                                  return;
                                }
                                updateToolProficiencyChoices(data, onChange, segment, next);
                              }}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                maxReached
                                  ? 'cursor-not-allowed opacity-40'
                                  : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
                              )}
                              aria-label={
                                selected ? `Uncheck ${displayName}` : `Check ${displayName}`
                              }
                              aria-pressed={selected}
                              aria-disabled={maxReached}
                            >
                              <span
                                className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-[10px]',
                                  selected
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'text-muted-foreground/50'
                                )}
                                aria-hidden
                              >
                                {selected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                              </span>
                              <span className="text-xs font-medium text-foreground">
                                {displayName}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          );
          }
        } else {
          toolElements.push(
            <Badge
              key={`fixed-${lineIndex}-${ti}-${segment}`}
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-xs font-normal"
            >
              {segment}
            </Badge>
          );
        }
      });
      if (hasToolChoice || toolElements.length > 0) {
        return <div className="flex flex-wrap items-center gap-1.5">{toolElements}</div>;
      }
    }

    const items = dedupeProficiencyLabelsPreserveOrder(
      valueStr ? parseProficiencyValueItems(valueStr, label) : [label]
    );
    return items.map((item) => (
      <Badge
        key={item}
        variant="secondary"
        className="rounded-full px-2.5 py-0.5 text-xs font-normal"
      >
        {item}
      </Badge>
    ));
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
      <Section
        title="Languages & Proficiencies"
        icon={<BookOpen className="h-4 w-4" />}
        className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto"
          role="list"
          aria-label="Proficiencies"
        >
          {fixedTypes.map(({ key, label, icon: Icon, fallbackMessage, matches }) => {
            const matchingLine = parsedLines.find(
              (p) => matches(p.label) && !(/^Skills$/i.test(p.label) && hasSkillsChoice)
            );

            let content: React.ReactNode = null;
            if (key === 'languages' && standardLanguageOptions.length > 0) {
              content = renderStandardLanguagePicker(
                matchingLine?.valueStr ?? '',
                matchingLine?.label ?? 'Languages'
              );
            } else if (matchingLine) {
              content = renderProficiencyContent(
                matchingLine.label,
                matchingLine.valueStr,
                parsedLines.indexOf(matchingLine)
              );
            }

            // Append tool proficiencies granted by the Skilled feat.
            let skilledToolBadges: React.ReactNode = null;
            if (key === 'tool') {
              const allToolItems = Object.values(toolItemsByCategory).flat();
              const toolKeyToLabel = new Map<string, string>();
              for (const item of allToolItems) {
                const lbl = stripToolItemPriceSuffix(item.name).trim();
                if (!lbl) continue;
                const k = skilledToolChoiceKey(lbl);
                if (!toolKeyToLabel.has(k)) toolKeyToLabel.set(k, lbl);
              }
              const skilledToolLabels = (data.skilledProficiencyChoices ?? [])
                .filter((c) => c.startsWith('tool:'))
                .map((c) => toolKeyToLabel.get(c) ?? c.slice('tool:'.length))
                .filter(Boolean);
              if (skilledToolLabels.length > 0) {
                skilledToolBadges = (
                  <>
                    {skilledToolLabels.map((lbl) => (
                      <Badge
                        key={`skilled-tool-${lbl}`}
                        variant="secondary"
                        className="rounded-full px-2.5 py-0.5 text-xs font-normal"
                      >
                        {lbl}
                      </Badge>
                    ))}
                  </>
                );
              }
            }

            const hasContent =
              content != null && (Array.isArray(content) ? content.length > 0 : true);
            const hasSkilledToolBadges = skilledToolBadges != null;
            const showFallback =
              !hasContent && !hasSkilledToolBadges && key !== 'languages' && fallbackMessage.trim().length > 0;

            return (
              <div
                key={key}
                className="rounded-md border border-border bg-muted/40"
                role="listitem"
              >
                <div
                  className="flex items-center gap-2 border-b border-border px-2 py-1.5"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 px-2 py-2 pl-4">
                  {hasContent ? content : showFallback ? (
                    <p className="text-xs text-muted-foreground">{fallbackMessage}</p>
                  ) : null}
                  {skilledToolBadges}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
