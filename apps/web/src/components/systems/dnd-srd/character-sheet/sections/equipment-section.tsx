'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus, Minus, Trash2, Shield, Swords, Package, ChevronRight, Coins, Check, Wrench, Music, Dices, Backpack, ScrollText, FlaskConical, Crosshair, Wand2, Sparkles, Circle } from 'lucide-react';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TruncatedTooltip, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  parseEquipmentLine,
  splitEquipmentBySource,
  isEquipmentLineGP,
  getAvailableGP,
  getAvailableGpUnclamped,
  getItemCostGP,
  formatCostInfo,
  breakdownGP,
  coerceNonNegativeWalletInt,
  getEquipmentItemQuantity,
  WALLET_COIN_MAX,
  resolveEquipmentToolPlaceholder,
  normalizeStartingEquipmentOptionTextForCompare,
  buildEquipmentItemIdLookupMap,
  resolveEquipmentItemId,
  normalizeEquipmentLookupKey,
} from '@/lib/dnd-srd/equipment-utils';
import { useRuleLibraryData } from '../context';
import { Section } from '../ui/section';
import {
  needsChoiceAccent,
  needsChoiceBorder,
  needsChoiceHighlightSoft,
  numberInputNoSpinner,
} from '../constants';
import {
  removeEquipmentItem,
  changeEquipmentQuantity,
  addEquipmentItem,
  getClassOptionText,
  getBackgroundOptionText,
  applyClassEquipmentChoice,
  applyBackgroundEquipmentChoice,
  removeClassEquipmentSet,
  removeBackgroundEquipmentSet,
} from '../helpers';
import { stripToolItemPriceSuffix } from '../helpers/proficiency';
import type { CharacterFormData } from '../types';

interface EquipmentSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  readOnly?: boolean;
  saveAttempted?: boolean;
}

export function EquipmentSection({
  data,
  onChange,
  readOnly = false,
  saveAttempted = false,
}: EquipmentSectionProps) {
  const { weapons, armors, adventuringGear, toolItemsByCategory, equipmentItemsLoading } = useRuleLibraryData();
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
    return { equipmentLookupMap: buildEquipmentItemIdLookupMap(allItems), equipmentItemTags: itemTags };
  }, [weapons, armors, adventuringGear, artisanTools, generalTools, toolItemsByCategory]);

  // Pre-resolve every equipment line name → tagKeys once.
  // Icon lookup uses only tagKeys — no name matching at render time.
  const resolvedLineTags = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const line of (data.equipment ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const { name } = parseEquipmentLine(line);
      if (map.has(name)) continue;
      let id = resolveEquipmentItemId(name, equipmentLookupMap);
      if (!id) {
        const normPrefix = normalizeEquipmentLookupKey(name) + ' ';
        for (const [key, val] of equipmentLookupMap) {
          if (key.startsWith(normPrefix)) { id = val; break; }
        }
      }
      map.set(name, id ? (equipmentItemTags.get(id) ?? []) : []);
    }
    return map;
  }, [data.equipment, equipmentLookupMap, equipmentItemTags]);

  const bundleStepByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of adventuringGear) {
      const displayName = stripToolItemPriceSuffix(item.name);
      const bundleMatch = displayName.match(/\s*\(\s*(\d+)\s*\)\s*$/);
      if (!bundleMatch) continue;
      const bundleQty = parseInt(bundleMatch[1], 10);
      const baseName = displayName.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();
      map.set(singularizeFirst(baseName).toLowerCase(), bundleQty);
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
      .filter((i) => i.name.toLowerCase().startsWith('holy symbol,'))
      .map((i) => ({ ...i, displayName: stripToolItemPriceSuffix(i.name) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [adventuringGear]);

  const wGp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletGP));
  const wSp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletSP));
  const wCp = Math.min(WALLET_COIN_MAX, coerceNonNegativeWalletInt(data.walletCP));
  const walletDecimal = wGp + wSp * 0.1 + wCp * 0.01;
  const fromEquipmentDecimal = Math.max(
    0,
    getAvailableGpUnclamped(data.equipment, data.equipmentSpentGP ?? 0)
  );

  // Read-only: wallet ints from DB; if all zero but a GP line exists on equipment, use that fallback.
  const coins = readOnly
    ? walletDecimal > 0
      ? { gp: wGp, sp: wSp, cp: wCp }
      : fromEquipmentDecimal > 0
        ? breakdownGP(fromEquipmentDecimal)
        : { gp: wGp, sp: wSp, cp: wCp }
    : breakdownGP(getAvailableGP(data.equipment, data.equipmentSpentGP));

  const availableGP = readOnly
    ? walletDecimal > 0
      ? walletDecimal
      : fromEquipmentDecimal
    : getAvailableGP(data.equipment, data.equipmentSpentGP);

  // View mode: wrap addEquipmentItem to also deduct cost from wallet.
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
          onChange({ ...updated, walletGP: newWalletGP, walletSP: newWalletSP, walletCP: newWalletCP }),
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
      packTotalCost: number | undefined,
    ) => {
      if (readOnly) {
        addItemAndDeductWallet(equipmentName, effectiveQty, costGP);
      } else {
        addEquipmentItem(data, onChange, equipmentName, effectiveQty, costGP, packTotalCost);
      }
    },
    [readOnly, addItemAndDeductWallet, data, onChange],
  );

  // splitEquipmentBySource runs on the original equipment string so placeholder lines
  // are correctly attributed to class or background based on the option text budget.
  // Placeholders are resolved to real tool names (or removed) only after the split.
  const { classLines, backgroundLines, manualLines, manualIndices } = useMemo(
    () =>
      splitEquipmentBySource(
        data.equipment ?? '',
        getClassOptionText(data),
        getBackgroundOptionText(data)
      ),
    [data]
  );

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
  const getLineCategoryOrder = useCallback((line: string): number => {
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
    ) return 3;
    if (tags.includes('item:category:equipment-pack')) return 4;
    if (tags.includes('item:category:musical-instrument')) return 5;
    if (tags.includes('item:category:gaming-set')) return 6;
    if (tags.includes('item:category:artisan') || tags.includes('item:category:tools')) return 7;
    if (tags.includes('item:category:scroll')) return 8;
    if (tags.includes('item:category:potion')) return 9;
    if (tags.includes('item:category:ring')) return 10;
    if (tags.includes('item:category:wondrous-item')) return 11;
    return 12;
  }, [resolvedLineTags]);

  const sortedClassLines = [...resolvedClassLines].sort(
    (a, b) => getLineCategoryOrder(a) - getLineCategoryOrder(b)
  );
  const sortedBackgroundLines = [...resolvedBackgroundLines].sort(
    (a, b) => getLineCategoryOrder(a) - getLineCategoryOrder(b)
  );
  const sortedManualEntries = [...resolvedManualWithIndices].sort(
    (a, b) => getLineCategoryOrder(a.line) - getLineCategoryOrder(b.line)
  );

  /** Sheet view only: GP total is in the header — omit GP rows from lists. Creation shows GP per section. */
  const displayClassLines = readOnly
    ? sortedClassLines.filter((l) => !isEquipmentLineGP(l))
    : sortedClassLines;
  const displayBackgroundLines = readOnly
    ? sortedBackgroundLines.filter((l) => !isEquipmentLineGP(l))
    : sortedBackgroundLines;
  const displayManualEntries = readOnly
    ? sortedManualEntries.filter(({ line }) => !isEquipmentLineGP(line))
    : sortedManualEntries;

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
    return (
      /* Container matches renderItemRow exactly (px-2 py-1).
         The dashed border goes on the container when unselected so it has
         the full px-2 py-1 breathing room around the content. */
      <div
        key={`${keyPrefix}-${idx}-musical-choice`}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1 text-left text-sm',
          hasChoice ? 'border-transparent' : needsChoiceBorder(saveAttempted)
        )}
        role="listitem"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-editable="true"
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={
                hasChoice
                  ? `Change musical instrument (current: ${chosen})`
                  : 'Choose a musical instrument for starting equipment'
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <Package
                  className={cn('h-4 w-4 shrink-0', hasChoice ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted))}
                  aria-hidden
                />
                {hasChoice ? (
                  <TruncatedTooltip text={chosen} />
                ) : (
                  <span className={cn('truncate text-sm', needsChoiceAccent(saveAttempted))}>Choose Musical Instrument</span>
                )}
              </span>
              {!hasChoice && (
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0', needsChoiceAccent(saveAttempted))} aria-hidden />
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
              <p className="mb-3 text-xs text-muted-foreground">
                Choose 1 from the list below.
              </p>
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
                            onChange({ ...data, toolProficiencyChoices: { ...(data.toolProficiencyChoices ?? {}), [choiceKey]: [item.displayName] } });
                          }
                        }}
                        disabled={maxReached}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          maxReached
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40'
                        )}
                        aria-label={selected ? `Uncheck ${item.displayName}` : `Select ${item.displayName}`}
                        aria-pressed={selected}
                        aria-disabled={maxReached}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-[10px]',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground/50'
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
        {hasChoice && (
          <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>
        )}
      </div>
    );
  };

  const isHolySymbolPlaceholder = (line: string) =>
    line.trim().toLowerCase() === 'holy symbol';

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
    scope: 'class' | 'background',
  ) => {
    const chosenId = data.holySymbolChoiceItemIds?.[scope] ?? null;
    const chosen = chosenId
      ? (holySymbolItems.find((i) => i.id === chosenId)?.displayName ?? null)
      : null;
    const hasChoice = chosenId !== null;
    return (
      <div
        key={`${keyPrefix}-${idx}-holy-symbol-choice`}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-dashed px-2 py-1 text-left text-sm',
          hasChoice ? 'border-transparent' : needsChoiceBorder(saveAttempted)
        )}
        role="listitem"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-editable="true"
              className="flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={
                hasChoice
                  ? `Change holy symbol (current: ${chosen})`
                  : 'Choose a holy symbol for starting equipment'
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <Package
                  className={cn('h-4 w-4 shrink-0', hasChoice ? 'text-muted-foreground' : needsChoiceAccent(saveAttempted))}
                  aria-hidden
                />
                {hasChoice ? (
                  <TruncatedTooltip text={chosen ?? 'Holy Symbol'} />
                ) : (
                  <span className={cn('truncate text-sm', needsChoiceAccent(saveAttempted))}>Choose Holy Symbol</span>
                )}
              </span>
              {!hasChoice && (
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0', needsChoiceAccent(saveAttempted))} aria-hidden />
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
                        aria-label={selected ? `Uncheck ${item.displayName}` : `Select ${item.displayName}`}
                        aria-pressed={selected}
                        aria-disabled={maxReached}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-[10px]',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground/50'
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
        {hasChoice && (
          <span className="min-w-5 shrink-0 text-center text-xs tabular-nums">1</span>
        )}
      </div>
    );
  };

  const renderItemRow = (
    line: string,
    keyPrefix: string,
    idx: number,
    editable: boolean,
    editIndex?: number
  ) => {
    const { quantity, name } = parseEquipmentLine(line);
    const displayName = getEquipmentDisplayName(quantity, name);
    const isGP = name.toUpperCase() === 'GP';
    const bundleStep = !readOnly ? (bundleStepByName.get(name.toLowerCase()) ?? 1) : 1;
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
              data-editable="true"
              onClick={() =>
                changeEquipmentQuantity(data, onChange, editIndex!, -bundleStep, {
                  refundSpentGP: !readOnly,
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
              data-editable="true"
              onClick={() => changeEquipmentQuantity(data, onChange, editIndex!, bundleStep)}
              className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Increase quantity of ${name}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              data-editable="true"
              onClick={() =>
                removeEquipmentItem(data, onChange, editIndex!, { refundSpentGP: !readOnly })
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
      icon={<Package className="h-4 w-4" />}
      className="flex min-h-0 flex-[1.4] flex-col lg:max-h-[36rem]"
      headerAction={
        <button
          type="button"
          data-editable="true"
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
          {readOnly ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.gp)}
              data-editable="true"
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
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-amber-600 outline-none dark:text-amber-400',
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
          {readOnly ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.sp)}
              data-editable="true"
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
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-slate-500 outline-none dark:text-slate-400',
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
          {readOnly ? (
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={String(coins.cp)}
              data-editable="true"
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
                'h-full min-h-7 min-w-10 flex-1 self-stretch border-l border-border bg-card px-1.5 py-1 text-right text-sm font-semibold tabular-nums text-orange-600 outline-none dark:text-orange-500',
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
        {readOnly ? (
          <div className="rounded-md border border-border bg-muted/40" role="listitem">
            {(sortedClassLines.length > 0 || sortedBackgroundLines.length > 0) && (
              <div className="flex items-center justify-end gap-0.5 border-b border-border px-2 py-1.5">
                {sortedClassLines.length > 0 && (
                  <button
                    type="button"
                    data-editable="true"
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
                    className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove class starting equipment set`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                {sortedBackgroundLines.length > 0 && (
                  <button
                    type="button"
                    data-editable="true"
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
                    className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove background equipment set`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-0.5 px-2 py-1.5">
              <div role="group" aria-label="All equipment">
                {displayClassLines.map((line, idx) =>
                  isMusicalInstrumentPlaceholder(line)
                    ? renderMusicalInstrumentChoice('class-ro', idx, MUSICAL_INSTRUMENT_CHOICE_KEY)
                    : isHolySymbolPlaceholder(line)
                      ? renderHolySymbolChoice('class-ro', idx, 'class')
                      : renderItemRow(line, 'class', idx, false)
                )}
                {displayBackgroundLines.map((line, idx) =>
                  isMusicalInstrumentPlaceholder(line)
                    ? renderMusicalInstrumentChoice('bg-ro', idx, MUSICAL_INSTRUMENT_CHOICE_KEY_BG)
                    : isHolySymbolPlaceholder(line)
                      ? renderHolySymbolChoice('bg-ro', idx, 'background')
                      : renderItemRow(line, 'bg', idx, false)
                )}
                {displayManualEntries.map(({ line, index }) =>
                  isMusicalInstrumentPlaceholder(line)
                    ? renderMusicalInstrumentChoice('manual-ro', index, MUSICAL_INSTRUMENT_CHOICE_KEY)
                    : isHolySymbolPlaceholder(line)
                      ? renderHolySymbolChoice('manual-ro', index, 'class')
                      : renderItemRow(line, 'manual', index, true, index)
                )}
              </div>
              {displayClassLines.length === 0 &&
              displayBackgroundLines.length === 0 &&
              displayManualEntries.length === 0 &&
              !hasClassEquipmentChoice &&
              !hasBackgroundEquipmentChoice ? (
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
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {classEquipmentTitle}
                  {classOptionLabel ? ` (Option ${classOptionLabel})` : ''}
                </span>
                {sortedClassLines.length > 0 && (
                  <button
                    type="button"
                    data-editable="true"
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
                    data-editable="true"
                    onClick={() => setStartingEquipmentChoiceOpen(true)}
                    className={cn(
                      'flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      needsChoiceHighlightSoft(saveAttempted)
                    )}
                    aria-label={`Choose option for ${classEquipmentTitle}`}
                  >
                    <Package className="h-3 w-3" aria-hidden />
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
                ) : sortedClassLines.length > 0 ? null : (
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
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  {backgroundEquipmentTitle}
                  {backgroundOptionLabel ? ` (Option ${backgroundOptionLabel})` : ''}
                </span>
                {sortedBackgroundLines.length > 0 && (
                  <button
                    type="button"
                    data-editable="true"
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
                    data-editable="true"
                    onClick={() => setBackgroundEquipmentChoiceOpen(true)}
                    className={cn(
                      'flex w-fit cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      needsChoiceHighlightSoft(saveAttempted)
                    )}
                    aria-label={`Choose option for ${backgroundEquipmentTitle}`}
                  >
                    <Package className="h-3 w-3" aria-hidden />
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
                ) : sortedBackgroundLines.length > 0 ? null : (
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
                <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Additional Equipment
                </span>
              </div>
              <div className="flex flex-col gap-0.5 px-2 py-1.5">
                {displayManualEntries.length > 0 ? (
                  <div role="group" aria-label="Additional Equipment">
                    {displayManualEntries.map(({ line, index }) =>
                      isMusicalInstrumentPlaceholder(line)
                        ? renderMusicalInstrumentChoice('manual', index, MUSICAL_INSTRUMENT_CHOICE_KEY)
                        : isHolySymbolPlaceholder(line)
                          ? renderHolySymbolChoice('manual', index, 'class')
                          : renderItemRow(line, 'manual', index, true, index)
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Add items with the + button above.</p>
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
                    if (!newOptLower.includes('musical instrument')) delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY];
                    const holySymbolChoiceItemIds = {
                      ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                      ...(newOptLower.includes('holy symbol') ? {} : { class: null }),
                    };
                    dataForApply = { ...data, toolProficiencyChoices: choices, holySymbolChoiceItemIds };
                  }
                  applyClassEquipmentChoice(dataForApply, onChange, idx, opt.text);
                  setStartingEquipmentChoiceOpen(false);
                }}
                className="cursor-pointer rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Option ${opt.label}: ${opt.text}`}
              >
                <span className="font-medium text-primary">Option {opt.label}:</span> {opt.text}
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
                    if (!newOptLower.includes('musical instrument')) delete choices[MUSICAL_INSTRUMENT_CHOICE_KEY_BG];
                    const holySymbolChoiceItemIds = {
                      ...(data.holySymbolChoiceItemIds ?? { class: null, background: null }),
                      ...(newOptLower.includes('holy symbol') ? {} : { background: null }),
                    };
                    dataForApply = { ...data, toolProficiencyChoices: choices, holySymbolChoiceItemIds };
                  }
                  applyBackgroundEquipmentChoice(dataForApply, onChange, idx, opt.text);
                  setBackgroundEquipmentChoiceOpen(false);
                }}
                className="cursor-pointer rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Option ${opt.label}: ${opt.text}`}
              >
                <span className="font-medium text-primary">Option {opt.label}:</span> {opt.text}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add equipment dialog. The shop body is a child component so its catalogs/rows are only
          built while the dialog is open (search/quantities state resets on unmount). */}
      <Dialog open={equipmentAddOpen} onOpenChange={setEquipmentAddOpen}>
        <DialogContent
          className="flex max-h-[78vh] w-[min(92vw,560px)] max-w-none flex-col gap-0 p-0"
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

interface AddEquipmentShopProps {
  coins: { gp: number; sp: number; cp: number };
  availableGP: number;
  /** Current equipment text — for the "already owned ×N" badges. */
  equipment: string;
  onAddItem: (
    equipmentName: string,
    effectiveQty: number,
    costGP: number | undefined,
    packTotalCost: number | undefined,
  ) => void;
}

/**
 * Body of the "Add Equipment" dialog. Lives outside EquipmentSection so the catalog rows
 * (hundreds of elements) are only built while the dialog is open — as inline children they were
 * rebuilt on every sheet render even with the dialog closed.
 */
function AddEquipmentShop({ coins, availableGP, equipment, onAddItem }: AddEquipmentShopProps) {
  const { weapons, armors, adventuringGear, toolItemsByCategory } = useRuleLibraryData();
  const [search, setSearch] = useState('');
  const [addQuantities, setAddQuantities] = useState<Record<string, number>>({});
  const [activeCategory, setActiveCategory] = useState<'weapons' | 'armor' | 'tools' | 'gear'>('weapons');

  const allToolItems = useMemo(() => {
    const artisanTools = toolItemsByCategory['item:category:artisan'] ?? [];
    const generalTools = toolItemsByCategory['item:category:tools'] ?? [];
    const seen = new Set<string>();
    return [...artisanTools, ...generalTools]
      .filter((i) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [toolItemsByCategory]);

  const shopWeapons = useMemo(
    () =>
      weapons
        .filter((w) => w.name.trim().toLowerCase() !== 'unarmed strike')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [weapons],
  );
  const sortedArmors = useMemo(
    () => [...armors].sort((a, b) => a.name.localeCompare(b.name)),
    [armors],
  );
  const sortedAdventuringGear = useMemo(
    () => [...adventuringGear].sort((a, b) => a.name.localeCompare(b.name)),
    [adventuringGear],
  );

  const searchLower = search.trim().toLowerCase();
  const filteredWeapons = searchLower
    ? shopWeapons.filter((w) => w.name.toLowerCase().includes(searchLower))
    : shopWeapons;
  const filteredArmors = searchLower
    ? sortedArmors.filter((a) => a.name.toLowerCase().includes(searchLower))
    : sortedArmors;
  const filteredArtisanTools = searchLower
    ? allToolItems.filter((a) => a.name.toLowerCase().includes(searchLower))
    : allToolItems;
  const filteredAdventuringGear = searchLower
    ? sortedAdventuringGear.filter((g) => g.name.toLowerCase().includes(searchLower))
    : sortedAdventuringGear;

  const renderAddItemRow = (item: RuleItemResponse) => {
    const displayName = stripToolItemPriceSuffix(item.name);
    const bundleMatch = displayName.match(/\s*\(\s*(\d+)\s*\)\s*$/);
    const bundleQty = bundleMatch ? parseInt(bundleMatch[1], 10) : null;
    const baseName = displayName.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();
    const equipmentName = bundleQty != null ? singularizeFirst(baseName) : baseName;
    const qty = addQuantities[item.id] ?? 1;
    const effectiveQty = bundleQty != null ? qty * bundleQty : qty;
    const costGP = getItemCostGP(item.normalized as Record<string, unknown>);
    const totalCost = costGP != null ? costGP * qty : 0;
    const canAfford = availableGP >= totalCost;
    const alreadyHave = getEquipmentItemQuantity(equipment, equipmentName);
    return (
      <div
        key={item.id}
        className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 truncate cursor-pointer rounded-lg border border-border/50 bg-muted/60 px-2.5 py-1 text-foreground">{displayName}</span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[300px] max-h-[60vh] overflow-y-auto p-3" sideOffset={8}>
              <ItemTooltipContent item={item} />
            </TooltipContent>
          </Tooltip>
          {alreadyHave > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              ×{alreadyHave}
            </span>
          )}
        </span>
        {costGP != null ? (() => {
          const { text, currency } = formatCostInfo(costGP);
          const colorClass = {
            gp: 'text-amber-600 dark:text-amber-400',
            sp: 'text-slate-400 dark:text-slate-300',
            cp: 'text-orange-600 dark:text-orange-500',
          }[currency];
          return (
            <span className={cn('shrink-0 text-xs tabular-nums', colorClass)}>
              {text}
            </span>
          );
        })() : (
          <span className="shrink-0 text-xs text-muted-foreground/40">—</span>
        )}
        <span className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            data-editable="true"
            onClick={() =>
              setAddQuantities((prev) => ({
                ...prev,
                [item.id]: Math.max(1, (prev[item.id] ?? 1) - 1),
              }))
            }
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Decrease quantity of ${displayName}`}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="min-w-6 text-center text-xs tabular-nums">{qty}</span>
          <button
            type="button"
            data-editable="true"
            onClick={() =>
              setAddQuantities((prev) => ({
                ...prev,
                [item.id]: (prev[item.id] ?? 1) + 1,
              }))
            }
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Increase quantity of ${displayName}`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
        <button
          type="button"
          data-editable="true"
          disabled={!canAfford}
          onClick={() => {
            if (!canAfford) return;
            const packTotalCost = bundleQty != null && costGP != null ? costGP * qty : undefined;
            onAddItem(equipmentName, effectiveQty, costGP ?? undefined, packTotalCost);
            setAddQuantities((prev) => ({ ...prev, [item.id]: 1 }));
          }}
          className="ml-1 flex h-6 shrink-0 cursor-pointer items-center rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div
          className="flex flex-wrap gap-1"
          aria-label={`Available: ${coins.gp} GP, ${coins.sp} SP, ${coins.cp} CP`}
        >
          <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40">
            <span className="flex shrink-0 items-center gap-1 rounded-l-md bg-muted/70 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <Coins className="h-3 w-3 shrink-0" aria-hidden />
              GP
            </span>
            <span className="flex flex-1 items-center justify-end rounded-r-md px-2 py-1 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
              {coins.gp}
            </span>
          </div>
          <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40">
            <span className="flex shrink-0 items-center gap-1 rounded-l-md bg-muted/70 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Coins className="h-3 w-3 shrink-0" aria-hidden />
              SP
            </span>
            <span className="flex flex-1 items-center justify-end rounded-r-md px-2 py-1 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
              {coins.sp}
            </span>
          </div>
          <div className="flex flex-1 basis-0 items-stretch overflow-hidden rounded-md border border-border bg-muted/40">
            <span className="flex shrink-0 items-center gap-1 rounded-l-md bg-muted/70 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-orange-600 dark:text-orange-500">
              <Coins className="h-3 w-3 shrink-0" aria-hidden />
              CP
            </span>
            <span className="flex flex-1 items-center justify-end rounded-r-md px-2 py-1 text-sm font-semibold tabular-nums text-orange-600 dark:text-orange-500">
              {coins.cp}
            </span>
          </div>
        </div>
        <Input
          type="search"
          placeholder="Search equipment..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm [&::-webkit-search-cancel-button]:cursor-pointer [&::-moz-search-clear-button]:cursor-pointer"
          aria-label="Search equipment"
        />
      </div>

      {/* Category tabs + list */}
      <Tabs
        value={activeCategory}
        onValueChange={(v) =>
          setActiveCategory(v as 'weapons' | 'armor' | 'tools' | 'gear')
        }
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
            <div className="border-b border-border px-4 pt-3 pb-0">
              <TabsList className="h-8 w-full gap-1 bg-transparent p-0">
                <TabsTrigger
                  value="weapons"
                  className="h-8 flex-1 cursor-pointer rounded-none border-b-2 border-transparent px-2 text-xs transition-[background-color,color,border-radius] duration-150 hover:rounded-t-md hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Weapons
                </TabsTrigger>
                <TabsTrigger
                  value="armor"
                  className="h-8 flex-1 cursor-pointer rounded-none border-b-2 border-transparent px-2 text-xs transition-[background-color,color,border-radius] duration-150 hover:rounded-t-md hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Armor
                </TabsTrigger>
                <TabsTrigger
                  value="tools"
                  className="h-8 flex-1 cursor-pointer rounded-none border-b-2 border-transparent px-2 text-xs transition-[background-color,color,border-radius] duration-150 hover:rounded-t-md hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Tools
                </TabsTrigger>
                <TabsTrigger
                  value="gear"
                  className="h-8 flex-1 cursor-pointer rounded-none border-b-2 border-transparent px-2 text-xs transition-[background-color,color,border-radius] duration-150 hover:rounded-t-md hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  Gear
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="weapons" className="mt-0 flex-1 overflow-y-auto p-2">
              {filteredWeapons.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No weapons found.</p>
              ) : (
                filteredWeapons.map((item) => renderAddItemRow(item))
              )}
            </TabsContent>
            <TabsContent value="armor" className="mt-0 flex-1 overflow-y-auto p-2">
              {filteredArmors.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No armor found.</p>
              ) : (
                filteredArmors.map((item) => renderAddItemRow(item))
              )}
            </TabsContent>
            <TabsContent value="tools" className="mt-0 flex-1 overflow-y-auto p-2">
              {filteredArtisanTools.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No tools found.</p>
              ) : (
                filteredArtisanTools.map((item) => renderAddItemRow(item))
              )}
            </TabsContent>
            <TabsContent value="gear" className="mt-0 flex-1 overflow-y-auto p-2">
              {filteredAdventuringGear.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">No gear found.</p>
              ) : (
                filteredAdventuringGear.map((item) => renderAddItemRow(item))
              )}
            </TabsContent>
          </Tabs>
    </>
  );
}

/** Singularizes the first word of a name, e.g. "Arrows" → "Arrow", "Bullets, Sling" → "Bullet, Sling". */
function singularizeFirst(name: string): string {
  const commaIdx = name.indexOf(',');
  if (commaIdx > 0) {
    const first = name.slice(0, commaIdx);
    const rest = name.slice(commaIdx);
    return (first.endsWith('s') ? first.slice(0, -1) : first) + rest;
  }
  return name.endsWith('s') ? name.slice(0, -1) : name;
}

function ItemTooltipContent({ item }: { item: RuleItemResponse }) {
  const displayName = stripToolItemPriceSuffix(item.name);
  const norm = (item.normalized ?? {}) as Record<string, unknown>;
  const tags = item.tagKeys;

  const weightRaw = typeof norm.weight === 'string' ? parseFloat(norm.weight) : null;
  const weightText = weightRaw != null && weightRaw > 0
    ? `${weightRaw % 1 === 0 ? weightRaw : weightRaw} ${norm.weightUnit ?? 'lb'}`
    : null;

  const categoryLabel = (() => {
    if (tags.includes('weapon:type:simple')) return 'Simple Weapon';
    if (tags.includes('weapon:type:martial')) return 'Martial Weapon';
    if (tags.includes('item:weapon:yes')) return 'Weapon';
    if (tags.includes('item:armor:yes')) return 'Armor';
    if (tags.includes('item:category:artisan')) return 'Artisan Tool';
    if (tags.includes('item:category:tools')) return 'Tool';
    if (tags.includes('item:category:gaming-set')) return 'Gaming Set';
    if (tags.includes('item:category:musical-instrument')) return 'Musical Instrument';
    if (tags.includes('item:category:equipment-pack')) return 'Equipment Pack';
    if (tags.includes('item:category:scroll')) return 'Scroll';
    if (tags.includes('item:category:potion')) return 'Potion';
    if (tags.includes('item:category:adventuring-gear')) return 'Adventuring Gear';
    return null;
  })();

  const weaponObj = norm.weapon as Record<string, unknown> | null | undefined;
  const armorObj = norm.armor as Record<string, unknown> | null | undefined;
  const desc = typeof norm.desc === 'string' ? norm.desc.trim() : null;

  const properties = Array.isArray(weaponObj?.properties)
    ? (weaponObj!.properties as Array<{ property?: { name?: string }; detail?: string | null }>)
        .map((p) => {
          const name = p?.property?.name;
          if (!name) return null;
          return p.detail ? `${name} (${p.detail})` : name;
        })
        .filter((v): v is string => v !== null)
    : [];

  return (
    <div className="flex flex-col gap-2">
      <p className="font-semibold text-foreground leading-tight">{displayName}</p>

      <div className="flex flex-wrap items-center gap-1.5">
        {categoryLabel && (
          <span className="rounded-full bg-background/60 border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {categoryLabel}
          </span>
        )}
        {weightText && (
          <span className="text-[11px] text-muted-foreground">{weightText}</span>
        )}
      </div>

      {weaponObj && (
        <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
          {!!weaponObj.damageDice && (
            <p className="text-[11px]">
              <span className="text-muted-foreground">Damage: </span>
              <span className="font-medium text-foreground">
                {String(weaponObj.damageDice)}
                {(weaponObj.damageType as { name?: string } | undefined)?.name
                  ? ` ${(weaponObj.damageType as { name: string }).name}`
                  : ''}
              </span>
            </p>
          )}
          {properties.length > 0 && (
            <p className="text-[11px]">
              <span className="text-muted-foreground">Properties: </span>
              <span className="font-medium text-foreground">{properties.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {armorObj && (
        <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
          {typeof armorObj.acDisplay === 'string' && (
            <p className="text-[11px]">
              <span className="text-muted-foreground">CA: </span>
              <span className="font-medium text-foreground">{armorObj.acDisplay}</span>
            </p>
          )}
          {armorObj.strengthScoreRequired != null && (
            <p className="text-[11px]">
              <span className="text-muted-foreground">Str required: </span>
              <span className="font-medium text-foreground">{String(armorObj.strengthScoreRequired)}</span>
            </p>
          )}
          {armorObj.grantsStealthDisadvantage === true && (
            <p className="text-[11px] text-destructive/80">Stealth disadvantage</p>
          )}
        </div>
      )}

      {desc && (
        <p className="border-t border-border/40 pt-2 text-[11px] leading-relaxed text-muted-foreground">
          {desc}
        </p>
      )}
    </div>
  );
}
