'use client';

import * as React from 'react';
import { X, ArrowLeftRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { needsChoiceAccent, needsChoiceHighlight, numberInputNoSpinner } from '../../constants';
import { SpellBadges, type SpellBadge } from './spell-badge';
import { SpellRuleItemDetailBody } from './spell-detail';
import {
  DEFAULT_ROWS_BY_LEVEL,
  SPELL_LIST_MAX_H_CLASS,
  abilityAbbr,
  clampSpellSlotsExpended,
  type SheetSpellRow,
} from './spell-utils';

const labelClass = 'text-[8px] font-semibold uppercase tracking-widest text-muted-foreground';
const barHeight = 'h-9';
const barBg = 'bg-muted/80';
const barBorder = 'border border-border';

interface SpellLevelBlockProps {
  level: number;
  spells: SheetSpellRow[];
  spellSlots: CharacterFormData['spellSlots'];
  slotAvailability: Record<number, boolean>;
  slotTotalsByLevel: Record<number, number>;
  pactMagicInfo: { slotLevel: number; totalSlots: number } | null;
  canSelectMoreCantrips: boolean;
  canSelectMoreLevel1Plus: boolean;
  onTogglePicker: (level: number) => void;
  spellsLoading: boolean;
  catalogLoading: boolean;
  spellPackId: string | null;
  spellcastingAbility: string;
  spellAbilityMap: Map<string, string>;
  /** Spell-name (lowercase) → modifier badges for the spell row (invocations, Potent Spellcasting, …). */
  spellBadgesBySpellName: Map<string, SpellBadge[]>;
  resolveSpellRule: (name: string) => RuleItemResponse | null;
  fetchSpellDetailsOnDemand: (name: string) => void;
  onDemandSpellLoading: Record<string, boolean>;
  onDemandSpellFailed: Record<string, boolean>;
  isHighElfLineage: boolean;
  /** Name of the High Elf lineage cantrip — only this one shows the swap control. */
  highElfCantripName: string | null;
  onOpenHighElfSwap: () => void;
  onRemoveSpell: (level: number, index: number) => void;
  onSlotChange: (level: number, field: 'total' | 'expended', value: number) => void;
  /** True after a blocked save: the "add" affordance turns red while spells are still required. */
  saveAttempted: boolean;
}

export function SpellLevelBlock({
  level,
  spells,
  spellSlots,
  slotAvailability,
  slotTotalsByLevel,
  pactMagicInfo,
  canSelectMoreCantrips,
  canSelectMoreLevel1Plus,
  onTogglePicker,
  spellsLoading,
  catalogLoading,
  spellPackId,
  spellcastingAbility,
  spellAbilityMap,
  spellBadgesBySpellName,
  resolveSpellRule,
  fetchSpellDetailsOnDemand,
  onDemandSpellLoading,
  onDemandSpellFailed,
  isHighElfLineage,
  highElfCantripName,
  onOpenHighElfSwap,
  onRemoveSpell,
  onSlotChange,
  saveAttempted,
}: SpellLevelBlockProps) {
  const isCantrip = level === 0;
  const title = isCantrip ? 'Cantrips' : undefined;
  const isLevelLocked = !isCantrip && !slotAvailability[level];
  const currentSpells = spells;
  const baseRowsCount = DEFAULT_ROWS_BY_LEVEL[level] ?? 0;
  // Pact Magic: every prepared-spell level shares one slot pool, stored at slotLevel.
  const slotsStorageLevel =
    pactMagicInfo && level >= 1 && level <= pactMagicInfo.slotLevel
      ? pactMagicInfo.slotLevel
      : level;
  const slots = spellSlots?.[slotsStorageLevel] ?? {};
  const slotsTotalFromTable = level === 0 ? 0 : (slotTotalsByLevel[level] ?? 0);
  const hasSlotsForLevel = slotsTotalFromTable > 0;
  const slotsExpendedDisplay = hasSlotsForLevel
    ? clampSpellSlotsExpended(slots.expended, slotsTotalFromTable)
    : null;

  const canAdd = isCantrip ? canSelectMoreCantrips : canSelectMoreLevel1Plus && !isLevelLocked;

  // Keep fixed visual empty rows per spell level block.
  // Selection fills one row at a time, but the empty scaffold remains.
  const displayRowsCount = Math.max(baseRowsCount, currentSpells.length);
  const emptySlotCount = Math.max(0, displayRowsCount - currentSpells.length);

  const togglePicker = () => {
    if (isLevelLocked || !canAdd || spellsLoading) return;
    onTogglePicker(level);
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-sm min-w-0">
      <div className="mb-3 flex flex-col min-w-0">
        <div className="flex items-center mb-1 min-w-0">
          <div
            className="flex w-10 shrink-0 flex-col items-center justify-center self-stretch"
            id={`spell-level-${level}-label`}
          >
            <span className={cn(labelClass, 'leading-tight block w-full text-center')}>
              Spell
            </span>
            <span className={cn(labelClass, 'leading-tight block w-full text-center')}>
              Level
            </span>
          </div>
          {isCantrip ? (
            <div className="flex flex-1 items-center justify-center min-w-0">
              <span className={cn(labelClass, 'block w-full text-center')}>
                {title ?? 'Level'}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 min-w-0">
              <div className="flex flex-1 flex-col items-center justify-center min-w-0">
                <span className={cn(labelClass, 'block w-full text-center')}>Slots Total</span>
              </div>
              <div className="w-px shrink-0" aria-hidden />
              <div className="flex flex-1 flex-col items-center justify-center min-w-0">
                <span className={cn(labelClass, 'block w-full text-center')}>Slots Expended</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-stretch gap-0 min-w-0">
          <div
            aria-labelledby={`spell-level-${level}-label`}
            className={cn(
              'relative flex shrink-0 items-center justify-center w-10 rounded-l-lg',
              barHeight,
              barBg,
              !isLevelLocked && canAdd
                ? cn('cursor-pointer border', needsChoiceHighlight(saveAttempted))
                : barBorder
            )}
            onClick={togglePicker}
            role={!isLevelLocked && canAdd ? 'button' : undefined}
            tabIndex={!isLevelLocked && canAdd ? 0 : undefined}
            onKeyDown={(e) => {
              if (isLevelLocked || !canAdd || spellsLoading) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTogglePicker(level);
              }
            }}
          >
            <span
              className={cn(
                'relative z-10 text-lg leading-none font-bold',
                !isLevelLocked && canAdd ? needsChoiceAccent(saveAttempted) : 'text-foreground'
              )}
            >
              {level}
            </span>
          </div>

          <div
            className={cn(
              'flex flex-1 items-stretch min-w-0 rounded-r-lg -ml-px',
              barHeight,
              barBg,
              barBorder
            )}
          >
            {isCantrip ? (
              <div className="flex-1 flex items-center justify-center px-2 min-w-0">
                <span className="text-xs font-bold uppercase tracking-widest text-foreground">
                  {title ?? 'Level'}
                </span>
              </div>
            ) : (
              <>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <input
                    type="number"
                    value={slotsTotalFromTable || ''}
                    readOnly
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      numberInputNoSpinner,
                      'w-full bg-transparent px-1 py-0 text-center text-sm font-semibold text-foreground outline-none focus:ring-0 border-0 cursor-default'
                    )}
                    aria-label={`Total slots for level ${level}`}
                    disabled={isLevelLocked}
                  />
                </div>
                <div className="w-px shrink-0 self-stretch bg-border" aria-hidden />
                <div className="flex-1 flex flex-col justify-center min-w-0">
                  <input
                    type="number"
                    min={hasSlotsForLevel ? 0 : undefined}
                    max={hasSlotsForLevel ? slotsTotalFromTable : undefined}
                    step={hasSlotsForLevel ? 1 : undefined}
                    value={slotsExpendedDisplay === null ? '' : slotsExpendedDisplay}
                    onChange={(e) => {
                      if (!hasSlotsForLevel) return;
                      const raw = e.target.value;
                      const n = raw === '' ? 0 : Number(raw);
                      onSlotChange(level, 'expended', Number.isFinite(n) ? n : 0);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      numberInputNoSpinner,
                      'w-full bg-transparent px-1 py-0 text-center text-sm font-semibold text-foreground outline-none focus:ring-0 border-0',
                      !hasSlotsForLevel && 'cursor-default'
                    )}
                    aria-label={`Expended slots for level ${level}`}
                    disabled={isLevelLocked || !hasSlotsForLevel}
                    readOnly={!hasSlotsForLevel}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex w-full flex-col gap-1.5 overflow-y-auto pr-1',
          SPELL_LIST_MAX_H_CLASS[baseRowsCount]
        )}
      >
        {/* Selected spells */}
        {currentSpells.map((s, i) => {
          const spellKey = s.name.trim().toLowerCase();
          const spellRule = resolveSpellRule(s.name);
          const demandLoading = Boolean(onDemandSpellLoading[spellKey]);
          const demandFailed = Boolean(onDemandSpellFailed[spellKey]);
          const spellAbilityBadge =
            spellAbilityMap.get(spellKey)
            ?? (spellcastingAbility ? abilityAbbr(spellcastingAbility) : null);
          const spellBadges = spellBadgesBySpellName.get(spellKey) ?? [];
          return (
            <div
              key={`${s.name}-${i}`}
              className="flex min-w-0 items-center justify-center gap-2"
            >
              <div className="relative flex min-h-7 flex-1 min-w-0 items-center">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (open) fetchSpellDetailsOnDemand(s.name);
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-left text-sm text-foreground shadow-[0_0_0_1px_rgba(250,250,250,0.03)] outline-none transition-colors hover:border-primary hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                      aria-label={`Spell details: ${s.name}`}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <SpellBadges badges={spellBadges} />
                        {spellAbilityBadge && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {spellAbilityBadge}
                          </span>
                        )}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    sideOffset={6}
                    className="max-h-[min(70vh,22rem)] max-w-lg space-y-3 overflow-y-auto p-3 text-xs"
                  >
                    {spellRule ? (
                      <SpellRuleItemDetailBody spell={spellRule} showNameAndTags />
                    ) : catalogLoading ? (
                      <LoadingState inline label="Loading spells…" className="justify-center py-4" />
                    ) : !spellPackId ? (
                      <p className="text-muted-foreground">
                        Spell details need a pack (select class or race).
                      </p>
                    ) : demandLoading ? (
                      <LoadingState inline label="Loading spell details…" className="justify-center py-4" />
                    ) : demandFailed ? (
                      <p className="text-muted-foreground">
                        Spell details are not available (could not load this spell from the pack).
                      </p>
                    ) : (
                      <LoadingState inline label="Loading spell details…" className="justify-center py-4" />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {s.granted &&
              isHighElfLineage &&
              level === 0 &&
              highElfCantripName != null &&
              s.name.trim().toLowerCase() === highElfCantripName.trim().toLowerCase() ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                      <button
                        type="button"
                        onClick={onOpenHighElfSwap}
                        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none"
                        aria-label={`Swap ${s.name} for a different Wizard cantrip`}
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[260px] text-xs">
                    Swap for a different Wizard cantrip
                  </TooltipContent>
                </Tooltip>
              ) : s.granted ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onRemoveSpell(level, i)}
                        disabled
                        className="flex h-5 w-5 shrink-0 cursor-not-allowed items-center justify-center rounded opacity-30 transition-colors focus:outline-none"
                        aria-label={`${s.name} (granted, cannot remove)`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[260px] text-xs">
                    Granted by {s.grantSource ?? 'a feature'}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  onClick={() => onRemoveSpell(level, i)}
                  className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none"
                  aria-label={`Remove ${s.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        {/* Empty slots */}
        {Array.from({ length: emptySlotCount }).map((_, i) => (
          <div key={`empty-${i}`} className="flex min-w-0 items-center justify-center gap-2">
            <div className="relative min-h-7 flex-1 min-w-0">
              <div className="w-full border-b border-border/80 border-dashed px-1 py-0.5 text-sm text-transparent select-none">
                &nbsp;
              </div>
            </div>
            <div className="h-5 w-5 shrink-0" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}
