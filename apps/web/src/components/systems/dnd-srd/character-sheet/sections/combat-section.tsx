'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Swords, Heart, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import { DeferredNumberInput } from '../ui/deferred-number-input';
import { updateField } from '../helpers';
import { numberInputNoSpinner, SHEET_TEMPORARY_HP_INPUT_MAX } from '../constants';

interface CombatSectionProps {
  data: import('../types').CharacterFormData;
  onChange: (data: import('../types').CharacterFormData) => void;
  readOnly?: boolean;
}

export function CombatSection({ data, onChange }: CombatSectionProps) {
  const {
    effectiveArmorClassValue,
    displaySpeed,
    armorItemsInEquipment,
    armorChoices,
    shieldChoices,
    strengthScore,
    isArmorItemProficient,
  } = useCharacterComputed();

  const [combatEquipmentMenuOpen, setCombatEquipmentMenuOpen] = useState(false);
  const [combatEquipmentAcknowledged, setCombatEquipmentAcknowledged] = useState(false);

  const armorItemIdsInEquipment = useMemo(
    () => armorItemsInEquipment.map((a) => a.id),
    [armorItemsInEquipment]
  );

  const hasCombatEquipment = armorItemsInEquipment.length > 0;
  const prevArmorItemIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const prevIds = prevArmorItemIdsRef.current;
    const prevSet = new Set(prevIds);
    const currIds = armorItemIdsInEquipment;
    const currSet = new Set(currIds);

    const hadAnyBefore = prevIds.length > 0;
    const hasAnyNow = currIds.length > 0;

    let nextEquippedArmorId = data.equippedArmorId;
    let nextEquippedShieldId = data.equippedShieldId;

    // Only unequip if armor data has been observed at least once. Skipping when the list
    // is still empty avoids clearing a persisted equippedArmorId before the armors API loads.
    const armorListEverLoaded = hadAnyBefore || hasAnyNow;

    if (armorListEverLoaded && nextEquippedArmorId && !currSet.has(nextEquippedArmorId)) {
      nextEquippedArmorId = null;
    }
    if (armorListEverLoaded && nextEquippedShieldId && !currSet.has(nextEquippedShieldId)) {
      nextEquippedShieldId = null;
    }

    let shouldRehighlight = false;

    if (!hadAnyBefore && hasAnyNow) {
      shouldRehighlight = true;
    } else if (hadAnyBefore && hasAnyNow) {
      const hasNewId = currIds.some((id) => !prevSet.has(id));
      if (hasNewId && !data.equippedArmorId && !data.equippedShieldId) {
        shouldRehighlight = true;
      }
    }

    if (
      nextEquippedArmorId !== data.equippedArmorId ||
      nextEquippedShieldId !== data.equippedShieldId
    ) {
      onChange({
        ...data,
        equippedArmorId: nextEquippedArmorId,
        equippedShieldId: nextEquippedShieldId,
      });
      shouldRehighlight = true;
    }

    if (shouldRehighlight) {
      setCombatEquipmentAcknowledged(false);
    }

    prevArmorItemIdsRef.current = currIds;
  }, [armorItemIdsInEquipment, data, onChange]);

  return (
    <Section
      title="Combat"
      icon={<Swords className="h-4 w-4" />}
      className="flex min-h-0 flex-col shrink-0"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        {/* Row 1: AC | Initiative | Speed */}
        <div className="grid grid-cols-3 gap-2">
          <DropdownMenu
            open={combatEquipmentMenuOpen}
            onOpenChange={(open) => {
              setCombatEquipmentMenuOpen(open);
              if (open) setCombatEquipmentAcknowledged(true);
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-editable="true"
                className={cn(
                  'flex cursor-pointer items-center justify-center rounded-md border bg-transparent px-1.5 py-1.5 text-foreground shadow-[0_0_0_1px_rgba(250,250,250,0.03)] outline-none transition-colors hover:border-primary hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring',
                  hasCombatEquipment && !combatEquipmentAcknowledged
                    ? 'border-dashed border-primary/70'
                    : 'border-transparent'
                )}
                aria-label="View and adjust combat equipment"
              >
                <div className="relative flex items-center justify-center">
                  <Shield className="h-15 w-13 text-border" strokeWidth={1.5} aria-hidden="true" />
                  <input
                    type="number"
                    value={effectiveArmorClassValue}
                    readOnly
                    disabled
                    className={cn(
                      numberInputNoSpinner,
                      'absolute inset-0 m-auto h-7 w-9 bg-transparent text-center text-base font-bold text-foreground outline-none cursor-pointer disabled:opacity-100'
                    )}
                    aria-label="Armor Class"
                  />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="right"
              className="min-w-[280px] max-w-[340px] p-0"
              sideOffset={6}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Combat Equipment
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Choose which armor and shield from your equipment are considered{' '}
                    <span className="font-semibold text-foreground">
                      equipped for combat
                    </span>
                    . The displayed AC uses these choices.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/20 p-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Equipped Armor
                    </span>
                    {armorChoices.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        No armor found in your equipment.
                      </p>
                    ) : (
                      <ul
                        className="max-h-40 space-y-1 overflow-y-auto"
                        role="list"
                        aria-label="Available armor to equip"
                      >
                        <li role="listitem">
                          <button
                            type="button"
                            onClick={() =>
                              onChange({ ...data, equippedArmorId: null })
                            }
                            className={cn(
                              'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              data.equippedArmorId == null &&
                                'border-primary/60 bg-primary/10'
                            )}
                            aria-label="No armor equipped"
                            aria-pressed={data.equippedArmorId == null}
                          >
                            <span className="font-medium">No armor</span>
                          </button>
                        </li>
                        {armorChoices.map((armor) => {
                          const isSelected = data.equippedArmorId === armor.id;
                          const isProficient = isArmorItemProficient(armor);
                          const norm = (armor.normalized ?? {}) as Record<string, unknown>;
                          const armorData = norm.armor as
                            | { strengthScoreRequired?: number | null }
                            | null
                            | undefined;
                          const requiredStr =
                            typeof armorData?.strengthScoreRequired === 'number'
                              ? armorData.strengthScoreRequired
                              : null;
                          const meetsStrength =
                            requiredStr == null || !Number.isFinite(requiredStr)
                              ? true
                              : strengthScore >= requiredStr;
                          const canUse = isProficient && meetsStrength;
                          const tooltipParts: string[] = [];
                          if (!isProficient) {
                            tooltipParts.push(
                              'You are not proficient with this armor category.'
                            );
                          }
                          if (!meetsStrength && requiredStr != null) {
                            tooltipParts.push(
                              `You need Strength ${requiredStr} to use this armor (current: ${strengthScore}).`
                            );
                          }
                          const tooltipText = tooltipParts.join(' ');
                          return (
                            <li key={armor.id} role="listitem">
                              {canUse ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onChange({ ...data, equippedArmorId: armor.id })
                                  }
                                  className={cn(
                                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    isSelected && 'border-primary/60 bg-primary/10'
                                  )}
                                  aria-label={`Equip ${armor.name}`}
                                  aria-pressed={isSelected}
                                >
                                  <span className="font-medium">{armor.name}</span>
                                </button>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      disabled
                                      className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-left text-[11px] text-muted-foreground opacity-70"
                                      aria-label={`Cannot use ${armor.name}`}
                                      aria-pressed={false}
                                    >
                                      <span className="font-medium">{armor.name}</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    className="max-w-[260px] text-xs text-muted-foreground"
                                  >
                                    {tooltipText}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary/20 p-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Equipped Shield
                    </span>
                    {shieldChoices.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">
                        No shield found in your equipment.
                      </p>
                    ) : (
                      <ul
                        className="max-h-32 space-y-1 overflow-y-auto"
                        role="list"
                        aria-label="Available shields to equip"
                      >
                        <li role="listitem">
                          <button
                            type="button"
                            onClick={() =>
                              onChange({ ...data, equippedShieldId: null })
                            }
                            className={cn(
                              'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              data.equippedShieldId == null &&
                                'border-primary/60 bg-primary/10'
                            )}
                            aria-label="No shield equipped"
                            aria-pressed={data.equippedShieldId == null}
                          >
                            <span className="font-medium">No shield</span>
                          </button>
                        </li>
                        {shieldChoices.map((shield) => {
                          const isSelected = data.equippedShieldId === shield.id;
                          const isProficient = isArmorItemProficient(shield);
                          const canUse = isProficient;
                          return (
                            <li key={shield.id} role="listitem">
                              {canUse ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onChange({ ...data, equippedShieldId: shield.id })
                                  }
                                  className={cn(
                                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    isSelected && 'border-primary/60 bg-primary/10'
                                  )}
                                  aria-label={`Equip ${shield.name}`}
                                  aria-pressed={isSelected}
                                >
                                  <span className="font-medium">{shield.name}</span>
                                </button>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      disabled
                                      className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/10 px-2 py-1.5 text-left text-[11px] text-muted-foreground opacity-70"
                                      aria-label={`Not proficient with ${shield.name}`}
                                      aria-pressed={false}
                                    >
                                      <span className="font-medium">{shield.name}</span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    className="max-w-[260px] text-xs text-muted-foreground"
                                  >
                                    You are not proficient with shields.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Initiative
            </span>
            <input
              type="number"
              value={
                data.initiative !== '' && data.initiative != null ? data.initiative : '0'
              }
              readOnly
              className={cn(
                numberInputNoSpinner,
                'h-8 w-full rounded-md border border-border bg-card text-center text-sm font-semibold text-foreground outline-none cursor-default'
              )}
              aria-label="Initiative"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Speed
            </span>
            <input
              type="number"
              value={displaySpeed}
              readOnly
              className={cn(
                numberInputNoSpinner,
                'h-8 w-full rounded-md border border-border bg-card text-center text-sm font-semibold text-foreground outline-none cursor-default'
              )}
              aria-label="Speed"
            />
          </div>
        </div>

        {/* Row 2: Hit Points */}
        <div className="flex flex-col gap-2">
          <div className="flex min-h-18 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card p-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Hit Points
            </span>
            <div className="flex min-w-0 items-center gap-1.5">
              <Heart
                className="ml-1 h-5 w-5 shrink-0 text-primary"
                strokeWidth={2}
                aria-hidden
              />
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <DeferredNumberInput
                  value={data.currentHp}
                  data-editable="true"
                  onCommit={(raw) => {
                    const n = raw === '' ? 0 : parseInt(raw, 10);
                    const clamped = Math.min(n, data.maxHp ?? 0);
                    if (clamped !== data.currentHp) {
                      updateField(data, onChange, 'currentHp', clamped);
                    }
                    return clamped;
                  }}
                  className={cn(
                    numberInputNoSpinner,
                    'h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-center text-sm font-bold text-foreground outline-none focus:border-primary'
                  )}
                  aria-label="Current Hit Points"
                />
                <span
                  className="shrink-0 text-xl font-semibold text-muted-foreground leading-none"
                  aria-hidden
                >
                  /
                </span>
                <input
                  type="number"
                  value={data.maxHp}
                  readOnly
                  className={cn(
                    numberInputNoSpinner,
                    'h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-center text-sm font-bold text-foreground outline-none cursor-default'
                  )}
                  aria-label="Max HP"
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-16 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card p-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Temporary Hit Points
            </span>
            <div className="flex min-w-0 items-center gap-2">
              <Heart
                className="ml-1 h-5 w-5 shrink-0 text-teal-600 dark:text-teal-500"
                strokeWidth={2}
                aria-hidden
              />
              <DeferredNumberInput
                value={data.temporaryHp}
                data-editable="true"
                onCommit={(raw) => {
                  const n = raw === '' ? 0 : parseInt(raw, 10);
                  const clamped = Math.min(n, SHEET_TEMPORARY_HP_INPUT_MAX);
                  if (clamped !== data.temporaryHp) {
                    updateField(data, onChange, 'temporaryHp', clamped);
                  }
                  return clamped;
                }}
                className={cn(
                  numberInputNoSpinner,
                  'h-9 w-full rounded-md border border-border bg-card px-2 text-center text-sm font-semibold text-foreground outline-none focus:border-primary'
                )}
                aria-label="Temporary Hit Points"
              />
            </div>
          </div>
        </div>

        {/* Row 3: Hit Dice | Death Saving Throws */}
        <div className="grid grid-cols-[1.2fr_1.8fr] gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Hit Dice
            </span>
            <div className="flex h-7 items-center justify-center rounded-md border border-border bg-card">
              <span className="text-center text-sm font-bold text-foreground">
                {data.classRuleItemId ? data.hitDice || '' : '0'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Death Saving Throws
            </span>
              <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Successes</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    data-editable="true"
                    onClick={() =>
                      updateField(
                        data,
                        onChange,
                        'deathSaveSuccesses',
                        i < data.deathSaveSuccesses ? i : i + 1
                      )
                    }
                    className={cn(
                      'h-4 w-4 cursor-pointer rounded-full border-2 border-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      i < data.deathSaveSuccesses
                        ? 'bg-foreground border-foreground'
                        : 'bg-transparent'
                    )}
                    aria-label={`Successes ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">Failures</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    type="button"
                    data-editable="true"
                    onClick={() =>
                      updateField(
                        data,
                        onChange,
                        'deathSaveFailures',
                        i < data.deathSaveFailures ? i : i + 1
                      )
                    }
                    className={cn(
                      'h-4 w-4 cursor-pointer rounded-full border-2 border-border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      i < data.deathSaveFailures
                        ? 'bg-foreground border-foreground'
                        : 'bg-transparent'
                    )}
                    aria-label={`Failures ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
