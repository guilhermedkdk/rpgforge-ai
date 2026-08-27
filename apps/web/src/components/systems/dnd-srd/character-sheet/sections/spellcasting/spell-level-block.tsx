'use client';

import * as React from 'react';
import { AiSpellHint } from '../../ui/ai-hint';
import { X, ArrowLeftRight, Lock } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import {
  abilityAbbr,
  clampSpellSlotsExpended,
  type RuleItemResponse,
  type CharacterFormData,
  type SheetSpellRow,
  type SpellModifier,
} from '@rpgforce-ai/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { needsChoiceAccent, needsChoiceHighlight, numberInputNoSpinner } from '../../constants';
import type { PendingFlags } from '../../pending-flags';
import { SpellModifierBadges } from './spell-modifier-badges';
import { SpellRuleItemDetailBody } from './spell-detail';
import { DEFAULT_ROWS_BY_LEVEL, SPELL_LIST_MAX_H_CLASS } from './spell-display';

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
  /**
   * Whether a spell can still be added AT THIS LEVEL. Per level, not per sheet: the multiclass slot
   * table opens levels no class can prepare at yet, and a `+` there used to open an empty picker.
   */
  canAddSpell: boolean;
  onTogglePicker: (level: number) => void;
  spellsLoading: boolean;
  catalogLoading: boolean;
  spellPackId: string | null;
  spellcastingAbility: string;
  spellAbilityMap: Map<string, string>;
  /** Spell-name (lowercase) → features modifying it (invocations, Potent Spellcasting, …). */
  spellModifiersBySpellName: Map<string, SpellModifier[]>;
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
  pendingFlags: PendingFlags;
}

export function SpellLevelBlock({
  level,
  spells,
  spellSlots,
  slotAvailability,
  slotTotalsByLevel,
  pactMagicInfo,
  canAddSpell,
  onTogglePicker,
  spellsLoading,
  catalogLoading,
  spellPackId,
  spellcastingAbility,
  spellAbilityMap,
  spellModifiersBySpellName,
  resolveSpellRule,
  fetchSpellDetailsOnDemand,
  onDemandSpellLoading,
  onDemandSpellFailed,
  isHighElfLineage,
  highElfCantripName,
  onOpenHighElfSwap,
  onRemoveSpell,
  onSlotChange,
  pendingFlags,
}: SpellLevelBlockProps) {
  const levelFlagKey = `spells:level:${level}`;
  const levelFlagged = pendingFlags.isFlagged(levelFlagKey);
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

  const canAdd = canAddSpell && !isLevelLocked;

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
            <span className={cn(labelClass, 'leading-tight block w-full text-center')}>Spell</span>
            <span className={cn(labelClass, 'leading-tight block w-full text-center')}>Level</span>
          </div>
          {isCantrip ? (
            <div className="flex flex-1 items-center justify-center min-w-0">
              <span className={cn(labelClass, 'block w-full text-center')}>{title ?? 'Level'}</span>
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
                ? cn('cursor-pointer border', needsChoiceHighlight(levelFlagged))
                : barBorder
            )}
            onPointerDown={() => pendingFlags.dismiss(levelFlagKey)}
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
                !isLevelLocked && canAdd ? needsChoiceAccent(levelFlagged) : 'text-foreground'
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
          // `pt-1.5` matches the row gap, giving the first row's corner marker the same room the
          // inter-row gap gives the rest, so it straddles the top edge instead of being clipped.
          'flex w-full flex-col gap-1.5 overflow-y-auto pr-1 pt-1.5',
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
            spellAbilityMap.get(spellKey) ??
            (spellcastingAbility ? abilityAbbr(spellcastingAbility) : null);
          const spellModifiers = spellModifiersBySpellName.get(spellKey) ?? [];
          return (
            <div key={`${s.name}-${i}`} className="flex min-w-0 items-center justify-center gap-2">
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
                        'flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-left text-sm text-foreground shadow-[0_0_0_1px_rgba(250,250,250,0.03)] outline-none transition-colors hover:border-primary hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring',
                        // Granted rows: the accent IS the row's left border, so it follows the
                        // rounded corners. `pl-1.75` (7px) hands back the 1px the thicker border
                        // takes, keeping the text position identical (the row has 0px of slack).
                        s.granted && 'border-l-2 border-l-primary/60 pl-1.75'
                      )}
                      aria-label={
                        spellModifiers.length > 0
                          ? `Spell details: ${s.name}. Enhanced by ${spellModifiers
                              .map((m) => m.featureName)
                              .join(', ')}`
                          : `Spell details: ${s.name}`
                      }
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <SpellModifierBadges modifiers={spellModifiers} spellName={s.name} />
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
                      <SpellRuleItemDetailBody
                        spell={spellRule}
                        showNameAndTags
                        modifiers={spellModifiers}
                      />
                    ) : catalogLoading ? (
                      <LoadingState inline className="justify-center py-4" />
                    ) : !spellPackId ? (
                      <p className="text-muted-foreground">
                        Spell details need a pack (select class or race).
                      </p>
                    ) : demandLoading ? (
                      <LoadingState inline className="justify-center py-4" />
                    ) : demandFailed ? (
                      <p className="text-muted-foreground">
                        Spell details are not available (could not load this spell from the pack).
                      </p>
                    ) : (
                      <LoadingState inline className="justify-center py-4" />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Floating corner marker, straddling the row's top-right like the section-card
                    badges (`-top-1.5 -right-1`); sits in the gap between the name and the delete/lock
                    control, so it never steals width. The container's `pt-1.5` keeps the first row's
                    marker from clipping against `overflow-y-auto`. */}
                <AiSpellHint spell={s.name} className="absolute -right-1 -top-1.5 z-20" />
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
                  <TooltipContent side="right" className="max-w-65 text-xs">
                    <div>Granted by {s.grantSource ?? 'a feature'}</div>
                    <div className="text-muted-foreground">Swap for a different Wizard cantrip</div>
                  </TooltipContent>
                </Tooltip>
              ) : s.granted ? (
                // A lock, not a disabled X: the row can't be removed, so a remove button was the
                // wrong affordance. Uses the slot the X already reserved, costing no row width.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="img"
                      aria-label={`${s.name}: granted by ${s.grantSource ?? 'a feature'}, does not count toward your picks`}
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground/50"
                    >
                      <Lock className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-65 text-xs">
                    <div>Granted by {s.grantSource ?? 'a feature'}</div>
                    <div className="text-muted-foreground">
                      Doesn&apos;t count toward your picks
                    </div>
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
