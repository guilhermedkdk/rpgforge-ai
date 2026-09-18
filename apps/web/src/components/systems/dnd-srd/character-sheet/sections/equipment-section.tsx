'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  Shield,
  Swords,
  Package,
  Boxes,
  BookOpen,
  ChevronRight,
  Coins,
  Check,
  Wrench,
  Music,
  Dices,
  Backpack,
  ScrollText,
  FlaskConical,
  Crosshair,
  Wand2,
  Sparkles,
  Circle,
} from 'lucide-react';
import {
  breakdownGP,
  buildEquipmentItemIdLookupMap,
  coerceNonNegativeWalletInt,
  getAvailableGP,
  getBackgroundOptionText,
  getClassOptionText,
  isEquipmentLineGP,
  isHolySymbolItemName,
  normalizeEquipmentLookupKey,
  normalizeStartingEquipmentOptionTextForCompare,
  parseBundleItemName,
  parseEquipmentLine,
  resolveEquipmentItemId,
  resolveEquipmentToolPlaceholder,
  singularizeIfPlural,
  splitEquipmentBySource,
  stripToolItemPriceSuffix,
  WALLET_COIN_MAX,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TruncatedTooltip } from '@/components/ui/tooltip';
import { useRuleLibraryData } from '../context';
import { Section } from '../ui/section';
import {
  needsChoiceAccent,
  needsChoiceBorder,
  needsChoiceHighlightSoft,
  numberInputNoSpinner,
} from '../constants';
import {
  mergeInventoryRows,
  removeEquipmentItems,
  changeEquipmentQuantity,
  addEquipmentItem,
  applyClassEquipmentChoice,
  applyBackgroundEquipmentChoice,
  removeClassEquipmentSet,
  removeBackgroundEquipmentSet,
} from '../helpers';
import type { CharacterFormData, SheetMode } from '../types';
import type { PendingFlags } from '../pending-flags';
import { AddEquipmentShop } from './equipment/add-equipment-shop';

interface EquipmentSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  mode: SheetMode;
  pendingFlags: PendingFlags;
}

export function EquipmentSection({ data, onChange, mode, pendingFlags }: EquipmentSectionProps) {
  // Play mode is a different ECONOMY, not a lock: coins are the real wallet (editable, spent by the
  // shop) instead of the creation gold budget, and GP lines move to the header totals.
  const inPlay = mode === 'play';
  const { weapons, armors, adventuringGear, toolItemsByCategory, equipmentItemsLoading } =
    useRuleLibraryData();
  const artisanTools = toolItemsByCategory['item:category:artisan'] ?? [];
  const generalTools = toolItemsByCategory['item:category:tools'] ?? [];

  const { equipmentLookupMap, equipmentItemTags } = useMemo(() => {
    const seen = new Set<string>();
    const allItems: RuleItemResponse[] = [
      ...weapons,
      ...armors,
      ...adventuringGear,
      ...artisanTools,
      ...generalTools,
      ...(toolItemsByCategory['item:category:musical-instrument'] ?? []),
      ...(toolItemsByCategory['item:category:gaming-set'] ?? []),
    ].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    const itemTags = new Map<string, string[]>(allItems.map((i) => [i.id, i.tagKeys]));
    return {
      equipmentLookupMap: buildEquipmentItemIdLookupMap(allItems),
      equipmentItemTags: itemTags,
    };
  }, [weapons, armors, adventuringGear, artisanTools, generalTools, toolItemsByCategory]);

  // Pre-resolve every equipment line name → tagKeys once.
  // Icon lookup uses only tagKeys — no name matching at render time.
  const resolvedLineTags = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const line of (data.equipment ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)) {
      const { name } = parseEquipmentLine(line);
      if (map.has(name)) continue;
      let id = resolveEquipmentItemId(name, equipmentLookupMap);
      if (!id) {
        const normPrefix = normalizeEquipmentLookupKey(name) + ' ';
        for (const [key, val] of equipmentLookupMap) {
          if (key.startsWith(normPrefix)) {
            id = val;
            break;
          }
        }
      }
      map.set(name, id ? (equipmentItemTags.get(id) ?? []) : []);
    }
    return map;
  }, [data.equipment, equipmentLookupMap, equipmentItemTags]);

  const bundleStepByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of adventuringGear) {
      const { bundleQty, baseName } = parseBundleItemName(item.name);
      if (bundleQty == null) continue;
      map.set(singularizeIfPlural(baseName, bundleQty).toLowerCase(), bundleQty);
    }
    return map;
  }, [adventuringGear]);

  const [equipmentAddOpen, setEquipmentAddOpen] = useState(false);
  const [startingEquipmentChoiceOpen, setStartingEquipmentChoiceOpen] = useState(false);
  const [backgroundEquipmentChoiceOpen, setBackgroundEquipmentChoiceOpen] = useState(false);
  const musicalInstruments = useMemo(() => {
    const items = toolItemsByCategory['item:category:musical-instrument'] ?? [];
    return [...items]
      .map((i) => ({ ...i, displayName: stripToolItemPriceSuffix(i.name) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [toolItemsByCategory]);

  const holySymbolItems = useMemo(() => {
    return adventuringGear
      .filter((i) => isHolySymbolItemName(i.name))
      .map((i) => ({ ...i, displayName: stripToolItemPriceSuffix(i.name) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [adventuringGear]);

  const wGp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletGP));
  const wSp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletSP));
  const wCp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletCP));

  // In play the wallet integers are the ONLY source: they are what gets persisted, and the `13 GP`
  // line the load rebuilds into the equipment text is derived FROM them. Falling back to that line
  // whenever the wallet totalled zero (the previous behaviour) made 0 unreachable — clearing the field
  // or typing 0 snapped straight back to the old amount.
  const coins = inPlay
    ? { gp: wGp, sp: wSp, cp: wCp }
    : breakdownGP(getAvailableGP(data.equipment, data.equipmentSpentGP));

  const availableGP = inPlay
    ? wGp + wSp * 0.1 + wCp * 0.01
    : getAvailableGP(data.equipment, data.equipmentSpentGP);

  // Play mode: wrap addEquipmentItem to also deduct cost from wallet.
  const addItemAndDeductWallet = useCallback(
    (itemName: string, qty: number, costGP?: number) => {
      const costCP = Math.round((costGP ?? 0) * qty * 100);
      const currentCP =
        coerceNonNegativeWalletInt(data.walletGP) * 100 +
        coerceNonNegativeWalletInt(data.walletSP) * 10 +
        coerceNonNegativeWalletInt(data.walletCP);
      const newTotalCP = Math.max(0, currentCP - costCP);
      const newWalletGP = Math.min(WALLET_COIN_MAX, Math.floor(newTotalCP / 100));
      const newWalletSP = Math.min(WALLET_COIN_MAX, Math.floor((newTotalCP % 100) / 10));
      const newWalletCP = Math.min(WALLET_COIN_MAX, newTotalCP % 10);
      addEquipmentItem(
        data,
        (updated) =>
          onChange({
            ...updated,
            walletGP: newWalletGP,
            walletSP: newWalletSP,
            walletCP: newWalletCP,
          }),
        itemName,
        qty,
        costGP
      );
    },
    [data, onChange]
  );

  const startingEquipmentOptions = data.startingEquipmentOptions?.options ?? [];
  const backgroundEquipmentOptions = data.backgroundEquipmentOptions?.options ?? [];
  const classEquipmentTitle = 'Class Starting Equipment';
  const backgroundEquipmentTitle = 'Background Equipment';
  const hasClassEquipmentChoice =
    startingEquipmentOptions.length > 0 && data.startingEquipmentSelectedIndex === null;
  const hasBackgroundEquipmentChoice =
    backgroundEquipmentOptions.length > 0 && data.backgroundEquipmentSelectedIndex === null;

  const handleShopAdd = useCallback(
    (
      equipmentName: string,
      effectiveQty: number,
      costGP: number | undefined,
      packTotalCost: number | undefined
    ) => {
      if (inPlay) {
        addItemAndDeductWallet(equipmentName, effectiveQty, costGP);
      } else {
        addEquipmentItem(data, onChange, equipmentName, effectiveQty, costGP, packTotalCost);
      }
    },
    [inPlay, addItemAndDeductWallet, data, onChange]
  );

  // splitEquipmentBySource runs on the original equipment string so placeholder lines
  // are correctly attributed to class or background based on the option text budget.
  // Placeholders are resolved to real tool names (or removed) only after the split.
  const {
    classLines,
    backgroundLines,
    manualLines,
    classIndices,
    backgroundIndices,
    manualIndices,
  } = useMemo(
    () =>
      splitEquipmentBySource(
        data.equipment ?? '',
        getClassOptionText(data),
        getBackgroundOptionText(data),
        data.equipmentSourceByLine
      ),
    [data]
  );

  // A selected bundle whose option is "take the gold" resolves to no item lines; show the option
  // text (e.g. "50 GP") under its section so it doesn't read as an unfilled "Determined by…".
  const selectedClassOptionText = getClassOptionText(data);
  const selectedBackgroundOptionText = getBackgroundOptionText(data);

  const resolveToolPlaceholder = useCallback(
    (line: string): string | null =>
      resolveEquipmentToolPlaceholder(line, data.toolProficiencyChoices ?? {}),
    [data.toolProficiencyChoices]
  );

  // Apply placeholder resolution to each categorized array independently,
  // preserving each line's class/background/manual attribution.
  const resolvedClassLines = useMemo(
    () => classLines.map(resolveToolPlaceholder).filter((l): l is string => l !== null),
    [classLines, resolveToolPlaceholder]
  );
  const resolvedBackgroundLines = useMemo(
    () => backgroundLines.map(resolveToolPlaceholder).filter((l): l is string => l !== null),
    [backgroundLines, resolveToolPlaceholder]
  );
  const resolvedManualWithIndices = useMemo(
    () =>
      manualLines
        .map((line, i) => {
          const resolved = resolveToolPlaceholder(line);
          return resolved !== null ? { line: resolved, index: manualIndices[i] } : null;
        })
        .filter((e): e is { line: string; index: number } => e !== null),
    [manualLines, manualIndices, resolveToolPlaceholder]
  );

  const classOptionLabel =
    data.startingEquipmentSelectedIndex != null &&
    data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]
      ? data.startingEquipmentOptions.options[data.startingEquipmentSelectedIndex].label
      : '';
  const backgroundOptionLabel =
    data.backgroundEquipmentSelectedIndex != null &&
    data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]
      ? data.backgroundEquipmentOptions.options[data.backgroundEquipmentSelectedIndex].label
      : '';
  const getLineCategoryOrder = useCallback(
    (line: string): number => {
      if (isEquipmentLineGP(line)) return 99;
      const { name } = parseEquipmentLine(line);
      const tags = resolvedLineTags.get(name) ?? [];
      if (tags.includes('item:armor:yes')) return 0;
      if (tags.includes('item:weapon:yes')) return 1;
      if (tags.includes('item:category:ammunition')) return 2;
      if (
        tags.includes('item:category:spellcasting-focus') ||
        tags.includes('item:category:wand') ||
        tags.includes('item:category:staff') ||
        tags.includes('item:category:rod')
      )
        return 3;
      if (tags.includes('item:category:equipment-pack')) return 4;
      if (tags.includes('item:category:musical-instrument')) return 5;
      if (tags.includes('item:category:gaming-set')) return 6;
      if (tags.includes('item:category:artisan') || tags.includes('item:category:tools')) return 7;
      if (tags.includes('item:category:scroll')) return 8;
      if (tags.includes('item:category:potion')) return 9;
      if (tags.includes('item:category:ring')) return 10;
      if (tags.includes('item:category:wondrous-item')) return 11;
      return 12;
    },
    [resolvedLineTags]
  );

  const sortedClassLines = [...resolvedClassLines].sort(
    (a, b) => getLineCategoryOrder(a) - getLineCategoryOrder(b)
  );
  const sortedBackgroundLines = [...resolvedBackgroundLines].sort(
    (a, b) => getLineCategoryOrder(a) - getLineCategoryOrder(b)
  );
  const sortedManualEntries = [...resolvedManualWithIndices].sort(
    (a, b) => getLineCategoryOrder(a.line) - getLineCategoryOrder(b.line)
  );

  /**
   * Play only: ONE list of the character's items, with no origin split at all. Once the sheet exists,
   * "class equipment" and "background equipment" stop being meaningful: it is all just gear the
   * character owns, every row edits its own quantity and deletes itself, and there is no action that
   * wipes a whole starting set. The buckets survive only to carry each line's index (needed to edit it)
   * and the scope of an unfilled tool placeholder.
   */
  const playRows = useMemo(() => {
    if (!inPlay) return [];
    const rows = [
      ...classLines.map((line, i) => ({ line, index: classIndices[i], scope: 'class' as const })),
      ...backgroundLines.map((line, i) => ({
        line,
        index: backgroundIndices[i],
        scope: 'background' as const,
      })),
      ...manualLines.map((line, i) => ({ line, index: manualIndices[i], scope: 'class' as const })),
    ];
    const resolved = rows
      .map((row) => {
        const line = resolveToolPlaceholder(row.line);
        return line === null ? null : { ...row, line };
      })
      .filter(
        (row): row is { line: string; index: number; scope: 'class' | 'background' } => row !== null
      )
      .filter(({ line }) => !isEquipmentLineGP(line));

    return mergeInventoryRows(resolved).sort(
      (a, b) => getLineCategoryOrder(a.line) - getLineCategoryOrder(b.line)
    );
  }, [
    inPlay,
    classLines,
    backgroundLines,
    manualLines,
    classIndices,
    backgroundIndices,
    manualIndices,
    resolveToolPlaceholder,
    getLineCategoryOrder,
  ]);

  // Creation only (play renders `playRows`): each bundle keeps its own section, GP line included.
  const displayClassLines = sortedClassLines;
  const displayBackgroundLines = sortedBackgroundLines;
  const displayManualEntries = sortedManualEntries;

  const getEquipmentIcon = (name: string) => {
    if (name.toUpperCase() === 'GP' || /^\d+\s*GP$/i.test(name.trim()))
      return <Coins className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />;

    const tags = resolvedLineTags.get(name) ?? [];

    if (tags.includes('item:category:musical-instrument'))
      return <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:gaming-set'))
      return <Dices className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:weapon:yes'))
      return <Swords className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:armor:yes'))
      return <Shield className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:artisan') || tags.includes('item:category:tools'))
      return <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:equipment-pack'))
      return <Backpack className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:scroll'))
      return <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:potion'))
      return <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:ammunition'))
      return <Crosshair className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (
      tags.includes('item:category:spellcasting-focus') ||
      tags.includes('item:category:wand') ||
      tags.includes('item:category:staff') ||
      tags.includes('item:category:rod')
    )
      return <Wand2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:ring'))
      return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    if (tags.includes('item:category:wondrous-item'))
      return <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
    return <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
  };
  const getEquipmentDisplayName = (quantity: number, name: string) =>
    name.toUpperCase() === 'GP' ? `${quantity} GP` : name;

  const isMusicalInstrumentPlaceholder = (line: string) =>
    line.trim().toLowerCase() === 'musical instrument of your choice';

  const MUSICAL_INSTRUMENT_CHOICE_KEY = 'Musical Instrument of your choice';
  const MUSICAL_INSTRUMENT_CHOICE_KEY_BG = 'Musical Instrument of your choice (Background)';

  const renderMusicalInstrumentChoice = (keyPrefix: string, idx: number, choiceKey: string) => {
    const chosen = data.toolProficiencyChoices?.[choiceKey]?.[0] ?? null;
    const hasChoice = chosen !== null;
    const flagKey = `equipment:instrument:${choiceKey}`;
    const flagged = pendingFlags.isFlagged(flagKey);
    // Committed starting-equipment pick: static in play, since swapping it is a creation edit. An
    // unfilled one keeps its picker so the slot can still be completed.
    if (inPlay && hasChoice) {
      return (
        <div
          key={`${keyPrefix}-${idx}-musical-choice`}
          className="flex w-full items-center justify-between gap-2 pr-2 text-left text-sm"
          role="listitem"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
            <Music className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <TruncatedTooltip text={chosen} />
          </span>
          <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>
        </div>
      );
    }
    return (
      // Border + px-2 py-1 go on the button (not the container) so the whole dashed area is
      // clickable. The row's own pr-2 insets the quantity badge so it lines up with the fixed
      // items' numbers (the badge itself must NOT use pr-2: with border-box, min-w-5 + pr-2
      // shrinks the digit's content box and shifts the centered number right).
      <div
        key={`${keyPrefix}-${idx}-musical-choice`}
        className="flex w-full items-center justify-between gap-2 pr-2 text-left text-sm"
        role="listitem"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border border-dashed px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                hasChoice ? 'border-transparent' : needsChoiceBorder(flagged)
              )}
              aria-label={
                hasChoice
                  ? `Change musical instrument (current: ${chosen})`
                  : 'Choose a musical instrument for starting equipment'
              }
              onPointerDown={() => pendingFlags.dismiss(flagKey)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Music
                  className={cn(
                    'h-4 w-4 shrink-0',
                    hasChoice ? 'text-muted-foreground' : needsChoiceAccent(flagged)
                  )}
                  aria-hidden
                />
                {hasChoice ? (
                  <TruncatedTooltip text={chosen} />
                ) : (
                  <span className={cn('truncate text-sm', needsChoiceAccent(flagged))}>
                    Choose Musical Instrument
                  </span>
                )}
              </span>
              {!hasChoice && (
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0', needsChoiceAccent(flagged))}
                  aria-hidden
                />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="min-w-[260px] max-w-[320px] p-0"
            sideOffset={6}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Musical Instrument</p>
              <p className="mb-3 text-xs text-muted-foreground">Choose 1 from the list below.</p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto" role="list">
                {musicalInstruments.map((item) => {
                  const selected = chosen === item.displayName;
                  // Max = 1. If already selected another item, clicking is a no-op
                  // (same as proficiencies: deselect first, then pick another).
                  const maxReached = hasChoice && !selected;
                  return (
                    <li key={item.id} role="listitem">
                      <button
                        type="button"
                        onClick={() => {
                          if (selected) {
                            const next = { ...(data.toolProficiencyChoices ?? {}) };
                            delete next[choiceKey];
                            onChange({ ...data, toolProficiencyChoices: next });
                          } else if (!maxReached) {
                            onChange({
                              ...data,
                              toolProficiencyChoices: {
                                ...(data.toolProficiencyChoices ?? {}),
                                [choiceKey]: [item.displayName],
                              },
                            });
                          }
                        }}
                        disabled={maxReached}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          maxReached
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
                        )}
                        aria-label={
                          selected ? `Uncheck ${item.displayName}` : `Select ${item.displayName}`
                        }
                        aria-pressed={selected}
                        aria-disabled={maxReached}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-3xs',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'text-muted-foreground/50'
                          )}
                          aria-hidden
                        >
                          {selected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                        </span>
                        <span className="text-xs font-medium">{item.displayName}</span>
                      </button>
                    </li>
                  );
                })}
                {musicalInstruments.length === 0 && (
                  <li className="py-3 text-center text-xs text-muted-foreground">
                    No instruments available.
                  </li>
                )}
              </ul>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Quantity badge — only when an instrument has been selected */}
        {hasChoice && <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>}
      </div>
    );
  };

  const isHolySymbolPlaceholder = (line: string) => line.trim().toLowerCase() === 'holy symbol';

  const setHolySymbolChoice = (scope: 'class' | 'background', itemId: string | null) =>
    onChange({
      ...data,
      holySymbolChoiceItemIds: {
        ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
        [scope]: itemId,
      },
    });

  const renderHolySymbolChoice = (
    keyPrefix: string,
    idx: number,
    scope: 'class' | 'background'
  ) => {
    const chosenId = data.holySymbolChoiceItemIds?.[scope] ?? null;
    const chosen = chosenId
      ? (holySymbolItems.find((i) => i.id === chosenId)?.displayName ?? null)
      : null;
    const hasChoice = chosenId !== null;
    const flagKey = `equipment:holy-symbol:${scope}`;
    const flagged = pendingFlags.isFlagged(flagKey);
    if (inPlay && hasChoice) {
      return (
        <div
          key={`${keyPrefix}-${idx}-holy-symbol-choice`}
          className="flex w-full items-center justify-between gap-2 pr-2 text-left text-sm"
          role="listitem"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
            <Wand2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <TruncatedTooltip text={chosen ?? 'Holy Symbol'} />
          </span>
          <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>
        </div>
      );
    }
    return (
      <div
        key={`${keyPrefix}-${idx}-holy-symbol-choice`}
        className="flex w-full items-center justify-between gap-2 pr-2 text-left text-sm"
        role="listitem"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md border border-dashed px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                hasChoice ? 'border-transparent' : needsChoiceBorder(flagged)
              )}
              aria-label={
                hasChoice
                  ? `Change holy symbol (current: ${chosen})`
                  : 'Choose a holy symbol for starting equipment'
              }
              onPointerDown={() => pendingFlags.dismiss(flagKey)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Wand2
                  className={cn(
                    'h-4 w-4 shrink-0',
                    hasChoice ? 'text-muted-foreground' : needsChoiceAccent(flagged)
                  )}
                  aria-hidden
                />
                {hasChoice ? (
                  <TruncatedTooltip text={chosen ?? 'Holy Symbol'} />
                ) : (
                  <span className={cn('truncate text-sm', needsChoiceAccent(flagged))}>
                    Choose Holy Symbol
                  </span>
                )}
              </span>
              {!hasChoice && (
                <ChevronRight
                  className={cn('h-3.5 w-3.5 shrink-0', needsChoiceAccent(flagged))}
                  aria-hidden
                />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="right"
            className="min-w-[260px] max-w-[320px] p-0"
            sideOffset={6}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <div className="p-3">
              <p className="mb-2 text-sm font-medium text-foreground">Holy Symbol</p>
              <p className="mb-3 text-xs text-muted-foreground">Choose 1 from the list below.</p>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto" role="list">
                {holySymbolItems.map((item) => {
                  const selected = chosenId === item.id;
                  const maxReached = hasChoice && !selected;
                  return (
                    <li key={item.id} role="listitem">
                      <button
                        type="button"
                        disabled={maxReached}
                        onClick={() => {
                          if (selected) setHolySymbolChoice(scope, null);
                          else if (!maxReached) setHolySymbolChoice(scope, item.id);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          maxReached
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
                        )}
                        aria-label={
                          selected ? `Uncheck ${item.displayName}` : `Select ${item.displayName}`
                        }
                        aria-pressed={selected}
                        aria-disabled={maxReached}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-3xs',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'text-muted-foreground/50'
                          )}
                          aria-hidden
                        >
                          {selected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                        </span>
                        <span className="text-xs font-medium">{item.displayName}</span>
                      </button>
                    </li>
                  );
                })}
                {holySymbolItems.length === 0 && (
                  <li className="py-3 text-center text-xs text-muted-foreground">
                    No holy symbols available.
                  </li>
                )}
              </ul>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasChoice && <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>}
      </div>
    );
  };

  const renderItemRow = (
    line: string,
    keyPrefix: string,
    idx: number,
    editable: boolean,
    editIndex?: number,
    /** Every line this row stands for. Only the saved sheet merges rows, so creation passes none. */
    editIndices?: number[]
  ) => {
    const { quantity, name } = parseEquipmentLine(line);
    const displayName = getEquipmentDisplayName(quantity, name);
    const isGP = name.toUpperCase() === 'GP';
    const bundleStep = !inPlay ? (bundleStepByName.get(name.toLowerCase()) ?? 1) : 1;
    return (
      <div
        key={`${keyPrefix}-${idx}-${name}-${quantity}`}
        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm text-foreground"
        role="listitem"
      >
        <span className="flex min-w-0 items-center gap-2">
          {getEquipmentIcon(name)}
          <TruncatedTooltip text={displayName} />
        </span>
        {editable ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() =>
                changeEquipmentQuantity(data, onChange, editIndex!, -bundleStep, {
                  refundSpentGP: !inPlay,
                })
              }
              className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Decrease quantity of ${name}`}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="min-w-5 text-center text-xs tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => changeEquipmentQuantity(data, onChange, editIndex!, bundleStep)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Increase quantity of ${name}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() =>
                removeEquipmentItems(data, onChange, editIndices ?? [editIndex!], {
                  refundSpentGP: !inPlay,
                })
              }
              className="cursor-pointer shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Remove ${name} from equipment`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          !isGP && (
            <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">{quantity}</span>
          )
        )}
      </div>
    );
  };

  return (
    <Section
      title="Equipment"
      aiHintArea="equipment"
      icon={<Package className="h-4 w-4" />}
      className="flex min-h-0 flex-[1.4] flex-col lg:max-h-[36rem]"
      headerAction={
        <button
          type="button"
          disabled={equipmentItemsLoading}
          aria-label="Add equipment"
          onClick={() => setEquipmentAddOpen(true)}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      }
    >
      <div
        className="mb-2 flex shrink-0 gap-1.5"
        aria-label={`Available: ${coins.gp} GP, ${coins.sp} SP, ${coins.cp} CP`}
      >
        {/* GP */}
        <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40 focus-within:border-primary">
          <span className="flex shrink-0 items-center gap-1 bg-muted/70 px-1.5 py-1 text-[9px] font-medium uppercase text-amber-600 dark:text-amber-400">
            <Coins className="h-3 w-3 shrink-0" aria-hidden />
            GP
          </span>
          {inPlay ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.gp)}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') {
                  onChange({ ...data, walletGP: 0 });
                } else {
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) {
                    onChange({
                      ...data,
                      walletGP: Math.min(WALLET_COIN_MAX, Math.max(0, n)),
                    });
                  }
                }
              }}
              className={cn(
                numberInputNoSpinner,
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-amber-600 outline-none dark:text-amber-400'
              )}
              aria-label="Gold pieces available"
            />
          ) : (
            <span className="flex flex-1 items-center justify-end border-l border-border px-1.5 py-1 tabular-nums text-sm font-semibold text-amber-600 dark:text-amber-400">
              {coins.gp}
            </span>
          )}
        </div>

        {/* SP */}
        <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40 focus-within:border-primary">
          <span className="flex shrink-0 items-center gap-1 bg-muted/70 px-1.5 py-1 text-[9px] font-medium uppercase text-slate-500 dark:text-slate-400">
            <Coins className="h-3 w-3 shrink-0" aria-hidden />
            SP
          </span>
          {inPlay ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.sp)}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') {
                  onChange({ ...data, walletSP: 0 });
                } else {
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) {
                    onChange({
                      ...data,
                      walletSP: Math.min(WALLET_COIN_MAX, Math.max(0, n)),
                    });
                  }
                }
              }}
              className={cn(
                numberInputNoSpinner,
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-slate-500 outline-none dark:text-slate-400'
              )}
              aria-label="Silver pieces available"
            />
          ) : (
            <span className="flex flex-1 items-center justify-end border-l border-border px-1.5 py-1 tabular-nums text-sm font-semibold text-slate-500 dark:text-slate-400">
              {coins.sp}
            </span>
          )}
        </div>

        {/* CP */}
        <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40 focus-within:border-primary">
          <span className="flex shrink-0 items-center gap-1 bg-muted/70 px-1.5 py-1 text-[9px] font-medium uppercase text-orange-600 dark:text-orange-500">
            <Coins className="h-3 w-3 shrink-0" aria-hidden />
            CP
          </span>
          {inPlay ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.cp)}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                if (v === '') {
                  onChange({ ...data, walletCP: 0 });
                } else {
                  const n = parseInt(v, 10);
                  if (!isNaN(n)) {
                    onChange({
                      ...data,
                      walletCP: Math.min(WALLET_COIN_MAX, Math.max(0, n)),
                    });
                  }
                }
              }}
              className={cn(
                numberInputNoSpinner,
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-orange-600 outline-none dark:text-orange-500'
              )}
              aria-label="Copper pieces available"
            />
          ) : (
            <span className="flex flex-1 items-center justify-end rounded-r-md px-1.5 py-1 tabular-nums text-sm font-semibold text-orange-600 dark:text-orange-500">
              {coins.cp}
            </span>
          )}
        </div>
      </div>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto pr-1.5 text-sm"
        role="list"
        aria-label="Equipment list"
      >
        {inPlay ? (
          <div className="rounded-md border border-border bg-muted/40" role="listitem">
            <div className="flex flex-col gap-0.5 px-2 py-1.5">
              <div role="group" aria-label="Equipment">
                {playRows.map(({ line, index, indices, scope }) =>
                  isMusicalInstrumentPlaceholder(line)
                    ? renderMusicalInstrumentChoice(
                        `play-${scope}`,
                        index,
                        scope === 'background'
                          ? MUSICAL_INSTRUMENT_CHOICE_KEY_BG
                          : MUSICAL_INSTRUMENT_CHOICE_KEY
                      )
                    : isHolySymbolPlaceholder(line)
                      ? renderHolySymbolChoice(`play-${scope}`, index, scope)
                      : renderItemRow(line, 'play', index, true, index, indices)
                )}
              </div>
              {playRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add items with the + button above.</p>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {/* Class Starting Equipment */}
            <div className="rounded-md border border-border bg-muted/40" role="listitem">
              <div
                className="flex items-center gap-2 border-b border-border px-2 py-1.5"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {classEquipmentTitle}
                  {classOptionLabel ? ` (Option ${classOptionLabel})` : ''}
                </span>
                {sortedClassLines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const choices = { ...(data.toolProficiencyChoices ?? {}) };
                      delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY];
                      removeClassEquipmentSet(
                        {
                          ...data,
                          toolProficiencyChoices: choices,
                          holySymbolChoiceItemIds: {
                            ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                            class: null,
                          },
                        },
                        onChange
                      );
                    }}
                    className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove set ${classEquipmentTitle}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                {hasClassEquipmentChoice ? (
                  <button
                    type="button"
                    onPointerDown={() => pendingFlags.dismiss('equipment:bundle:class')}
                    onClick={() => setStartingEquipmentChoiceOpen(true)}
                    className={cn(
                      'flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      needsChoiceHighlightSoft(pendingFlags.isFlagged('equipment:bundle:class'))
                    )}
                    aria-label={`Choose option for ${classEquipmentTitle}`}
                  >
                    Choose option
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </button>
                ) : displayClassLines.length > 0 ? (
                  <div
                    role="group"
                    aria-label={`${classEquipmentTitle}${classOptionLabel ? ` (Option ${classOptionLabel})` : ''}`}
                  >
                    {displayClassLines.map((line, idx) =>
                      isMusicalInstrumentPlaceholder(line)
                        ? renderMusicalInstrumentChoice('class', idx, MUSICAL_INSTRUMENT_CHOICE_KEY)
                        : isHolySymbolPlaceholder(line)
                          ? renderHolySymbolChoice('class', idx, 'class')
                          : renderItemRow(line, 'class', idx, false)
                    )}
                  </div>
                ) : sortedClassLines.length > 0 ? null : selectedClassOptionText ? (
                  <p className="text-xs text-muted-foreground">{selectedClassOptionText}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Determined by class.</p>
                )}
              </div>
            </div>

            {/* Background Equipment */}
            <div className="rounded-md border border-border bg-muted/40" role="listitem">
              <div
                className="flex items-center gap-2 border-b border-border px-2 py-1.5"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {backgroundEquipmentTitle}
                  {backgroundOptionLabel ? ` (Option ${backgroundOptionLabel})` : ''}
                </span>
                {sortedBackgroundLines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const choices = { ...(data.toolProficiencyChoices ?? {}) };
                      delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY_BG];
                      removeBackgroundEquipmentSet(
                        {
                          ...data,
                          toolProficiencyChoices: choices,
                          holySymbolChoiceItemIds: {
                            ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                            background: null,
                          },
                        },
                        onChange
                      );
                    }}
                    className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove set ${backgroundEquipmentTitle}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                {hasBackgroundEquipmentChoice ? (
                  <button
                    type="button"
                    onPointerDown={() => pendingFlags.dismiss('equipment:bundle:background')}
                    onClick={() => setBackgroundEquipmentChoiceOpen(true)}
                    className={cn(
                      'flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      needsChoiceHighlightSoft(
                        pendingFlags.isFlagged('equipment:bundle:background')
                      )
                    )}
                    aria-label={`Choose option for ${backgroundEquipmentTitle}`}
                  >
                    Choose option
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </button>
                ) : displayBackgroundLines.length > 0 ? (
                  <div
                    role="group"
                    aria-label={`${backgroundEquipmentTitle}${backgroundOptionLabel ? ` (Option ${backgroundOptionLabel})` : ''}`}
                  >
                    {displayBackgroundLines.map((line, idx) =>
                      isMusicalInstrumentPlaceholder(line)
                        ? renderMusicalInstrumentChoice('bg', idx, MUSICAL_INSTRUMENT_CHOICE_KEY_BG)
                        : isHolySymbolPlaceholder(line)
                          ? renderHolySymbolChoice('bg', idx, 'background')
                          : renderItemRow(line, 'bg', idx, false)
                    )}
                  </div>
                ) : sortedBackgroundLines.length > 0 ? null : selectedBackgroundOptionText ? (
                  <p className="text-xs text-muted-foreground">{selectedBackgroundOptionText}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Determined by background.</p>
                )}
              </div>
            </div>

            {/* Additional Equipment */}
            <div className="rounded-md border border-border bg-muted/40" role="listitem">
              <div
                className="flex items-center gap-2 border-b border-border px-2 py-1.5"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Boxes className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Additional Equipment
                </span>
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                {displayManualEntries.length > 0 ? (
                  <div role="group" aria-label="Additional Equipment">
                    {displayManualEntries.map(({ line, index }) =>
                      isMusicalInstrumentPlaceholder(line)
                        ? renderMusicalInstrumentChoice(
                            'manual',
                            index,
                            MUSICAL_INSTRUMENT_CHOICE_KEY
                          )
                        : isHolySymbolPlaceholder(line)
                          ? renderHolySymbolChoice('manual', index, 'class')
                          : renderItemRow(line, 'manual', index, true, index)
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add items with the + button above.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Class equipment choice dialog */}
      <Dialog open={startingEquipmentChoiceOpen} onOpenChange={setStartingEquipmentChoiceOpen}>
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle>{classEquipmentTitle}</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-muted-foreground">
              Choose one of the options below to add to your equipment.
            </p>
          </DialogDescription>
          <div className="flex flex-col gap-2">
            {startingEquipmentOptions.map((opt, idx) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  const prevIdx = data.startingEquipmentSelectedIndex;
                  const prevOpt =
                    prevIdx != null ? data.startingEquipmentOptions?.options?.[prevIdx] : undefined;
                  const sameClassPackage =
                    prevIdx === idx &&
                    prevOpt != null &&
                    normalizeStartingEquipmentOptionTextForCompare(prevOpt.text) ===
                      normalizeStartingEquipmentOptionTextForCompare(opt.text);

                  let dataForApply = data;
                  if (!sameClassPackage) {
                    const choices = { ...(data.toolProficiencyChoices ?? {}) };
                    const newOptLower = opt.text.toLowerCase();
                    // Clear only class-scoped placeholder choices when changing class equipment.
                    // Background-scoped choices are unaffected.
                    if (!newOptLower.includes('musical instrument'))
                      delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY];
                    const holySymbolChoiceItemIds = {
                      ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                      ...(newOptLower.includes('holy symbol') ? {} : { class: null }),
                    };
                    dataForApply = {
                      ...data,
                      toolProficiencyChoices: choices,
                      holySymbolChoiceItemIds,
                    };
                  }
                  applyClassEquipmentChoice(dataForApply, onChange, idx, opt.text);
                  setStartingEquipmentChoiceOpen(false);
                }}
                className="cursor-pointer rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Option ${opt.label}: ${opt.text}`}
              >
                <span className="font-medium text-primary-ink">Option {opt.label}:</span> {opt.text}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Background equipment choice dialog */}
      <Dialog open={backgroundEquipmentChoiceOpen} onOpenChange={setBackgroundEquipmentChoiceOpen}>
        <DialogContent
          className="flex max-h-[85vh] flex-col gap-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle>{backgroundEquipmentTitle}</DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-muted-foreground">
              Choose one of the options below to add to your equipment.
            </p>
          </DialogDescription>
          <div className="flex flex-col gap-2">
            {backgroundEquipmentOptions.map((opt, idx) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  const prevBgIdx = data.backgroundEquipmentSelectedIndex;
                  const prevBgOpt =
                    prevBgIdx != null
                      ? data.backgroundEquipmentOptions?.options?.[prevBgIdx]
                      : undefined;
                  const sameBgPackage =
                    prevBgIdx === idx &&
                    prevBgOpt != null &&
                    normalizeStartingEquipmentOptionTextForCompare(prevBgOpt.text) ===
                      normalizeStartingEquipmentOptionTextForCompare(opt.text);
                  let dataForApply = data;
                  if (!sameBgPackage) {
                    const choices = { ...(data.toolProficiencyChoices ?? {}) };
                    const newOptLower = opt.text.toLowerCase();
                    // Clear only background-scoped placeholder choices when changing background equipment.
                    if (!newOptLower.includes('musical instrument'))
                      delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY_BG];
                    const holySymbolChoiceItemIds = {
                      ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                      ...(newOptLower.includes('holy symbol') ? {} : { background: null }),
                    };
                    dataForApply = {
                      ...data,
                      toolProficiencyChoices: choices,
                      holySymbolChoiceItemIds,
                    };
                  }
                  applyBackgroundEquipmentChoice(dataForApply, onChange, idx, opt.text);
                  setBackgroundEquipmentChoiceOpen(false);
                }}
                className="cursor-pointer rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Option ${opt.label}: ${opt.text}`}
              >
                <span className="font-medium text-primary-ink">Option {opt.label}:</span> {opt.text}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add equipment dialog. The shop body is a child component so its catalogs/rows are only
          built while the dialog is open (search/quantities state resets on unmount). */}
      <Dialog open={equipmentAddOpen} onOpenChange={setEquipmentAddOpen}>
        <DialogContent
          className="flex max-h-[78vh] max-w-[560px] flex-col gap-0 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b border-border px-5 py-4">
            <DialogTitle className="text-base">Add Equipment</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              Items can only be added if you have enough gold.
            </DialogDescription>
          </div>
          <AddEquipmentShop
            coins={coins}
            availableGP={availableGP}
            equipment={data.equipment ?? ''}
            onAddItem={handleShopAdd}
          />
        </DialogContent>
      </Dialog>
    </Section>
  );
}
