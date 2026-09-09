'use client';

import { useState, useMemo, useEffect, useRef, memo } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { computeAttackRows } from '@rpgforce-ai/shared';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import { unacknowledgedCueBorder } from '../constants';

interface AttacksSectionProps {
  data: import('../types').CharacterFormData;
}

export const AttacksSection = memo(function AttacksSection({ data }: AttacksSectionProps) {
  const { weapons, feats, proficiencyBonus } = useCharacterComputed();

  const [weaponInfoAcknowledged, setWeaponInfoAcknowledged] = useState<Record<string, boolean>>({});

  // Same shared rows the PDF export renders, so a printed sheet can't disagree with this one.
  const attackRows = useMemo(
    () => computeAttackRows({ data, weapons, feats, proficiencyBonus }),
    [data, weapons, feats, proficiencyBonus]
  );
  const weaponNames = useMemo(() => attackRows.map((row) => row.weaponName), [attackRows]);

  const prevWeaponNamesRef = useRef<string[]>([]);

  useEffect(() => {
    const prevNames = prevWeaponNamesRef.current;
    const prevSet = new Set(prevNames);

    setWeaponInfoAcknowledged((current) => {
      const next: Record<string, boolean> = { ...current };
      for (const name of weaponNames) {
        if (!prevSet.has(name) && !(name in next)) {
          next[name] = false;
        }
      }
      for (const key of Object.keys(next)) {
        if (!weaponNames.includes(key)) {
          delete next[key];
        }
      }
      return next;
    });

    prevWeaponNamesRef.current = weaponNames;
  }, [weaponNames]);

  return (
    <Section
      title="Attacks"
      icon={<Zap className="h-4 w-4" />}
      className="flex min-h-0 flex-[0.6] shrink flex-col lg:max-h-80"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-secondary/30 px-1.5 py-1.5 text-sm"
          role="list"
          aria-label="Attack list"
        >
          <div className="grid grid-cols-12 gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="col-span-5 text-center">Weapon</span>
            <span className="col-span-3 text-center">Hit</span>
            <span className="col-span-4 text-center">Damage</span>
          </div>
          {attackRows.map((row) => {
            const {
              weaponName,
              toHit: toHitDisplay,
              damage: damageDisplay,
              mastery: hasWeaponMastery,
            } = row;
            const weapon = weapons.find((w) => w.name === weaponName);
            const normRecord = (weapon?.normalized ?? {}) as Record<string, unknown>;
            const weaponNorm = (
              normRecord as {
                weapon?: {
                  damageType?: { name?: string } | null;
                  properties?: Array<{
                    detail?: string | null;
                    property?: {
                      name?: string | null;
                      desc?: string | null;
                      type?: string | null;
                    } | null;
                  }>;
                } | null;
              }
            ).weapon;
            const damageTypeName =
              (weaponNorm?.damageType?.name as string | undefined) ??
              (normRecord.damageType as string | undefined) ??
              ((normRecord.damage_type as { name?: unknown } | undefined)?.name as
                | string
                | undefined) ??
              '';
            const topLevelProperties = Array.isArray(normRecord.properties)
              ? (normRecord.properties as unknown[])
                  .filter((p) => p && typeof p === 'object' && 'property' in (p as object))
                  .filter((p) => {
                    const prop = (p as { property?: { name?: unknown } }).property;
                    return typeof prop?.name === 'string';
                  })
                  .map(
                    (p) =>
                      p as {
                        detail?: string | null;
                        property?: {
                          name?: string | null;
                          desc?: string | null;
                          type?: string | null;
                        } | null;
                      }
                  )
              : [];
            const weaponPropertiesForTooltip = [
              ...(weaponNorm?.properties?.filter(
                (p) => p && p.property && typeof p.property.name === 'string'
              ) ?? []),
              ...topLevelProperties,
            ];
            const weaponAcknowledged = weaponInfoAcknowledged[weaponName] ?? true;
            return (
              <div key={weaponName} className="grid grid-cols-12 gap-1.5">
                <DropdownMenu
                  onOpenChange={(open) => {
                    if (open) {
                      setWeaponInfoAcknowledged((prev) => ({
                        ...prev,
                        [weaponName]: true,
                      }));
                    }
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'col-span-5 flex h-7 cursor-pointer items-center rounded-md border bg-secondary/60 px-2 py-1.5 text-sm text-foreground shadow-[0_0_0_1px_rgba(250,250,250,0.03)] outline-none transition-colors hover:border-primary hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring',
                        weaponAcknowledged ? 'border-border' : unacknowledgedCueBorder
                      )}
                      aria-label={`Weapon details ${weaponName}`}
                    >
                      <span className="truncate">{weaponName}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    className="max-w-xs space-y-3 p-3 text-xs"
                    sideOffset={6}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-foreground">{weaponName}</div>
                      {damageTypeName && (
                        <div className="text-[11px] text-muted-foreground">
                          Damage type: {damageTypeName}
                        </div>
                      )}
                    </div>
                    {weaponPropertiesForTooltip.length > 0 && (
                      <>
                        <div className="h-px w-full bg-border/60" />
                        {weaponPropertiesForTooltip.map((p, idx) => {
                          const name = (p.property?.name ?? '').toString();
                          const detail = p.detail ?? '';
                          const desc = p.property?.desc ?? '';
                          const isMasteryProp = String(p.property?.type ?? '')
                            .toLowerCase()
                            .includes('mastery');
                          const noMasteryMessage = isMasteryProp && !hasWeaponMastery;
                          return (
                            <div key={`${weaponName}-prop-${idx}`} className="space-y-0.5">
                              <div className="font-semibold text-foreground">
                                {name}
                                {detail ? ` (${detail})` : ''}
                              </div>
                              {desc && (
                                <div className="text-[11px] leading-snug text-muted-foreground">
                                  {desc}
                                </div>
                              )}
                              {noMasteryMessage && (
                                <p className="text-[10px] italic text-amber-600 dark:text-amber-500">
                                  This property requires weapon mastery to use it.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div
                  className="col-span-3 flex h-7 items-center justify-center rounded-md border border-border bg-secondary/50 px-1.5 text-sm text-foreground"
                  aria-label={`To hit ${weaponName}: ${toHitDisplay}`}
                >
                  <span className="tabular-nums">{toHitDisplay}</span>
                </div>
                <div
                  className="col-span-4 flex h-7 items-center justify-center rounded-md border border-border bg-secondary/50 px-1.5 text-sm text-foreground"
                  aria-label={`Damage ${weaponName}: ${damageDisplay}`}
                >
                  <span className="tabular-nums">{damageDisplay}</span>
                </div>
              </div>
            );
          })}
          {(() => {
            const unarmedName = 'Unarmed Strike';
            const hasNonUnarmed = weaponNames.some((w) => w !== unarmedName);
            if (hasNonUnarmed) return null;
            return Array.from({ length: 2 }).map((_, i) => (
              <div key={`empty-weapon-${i}`} className="grid grid-cols-12 gap-1.5">
                <div className="col-span-5 flex h-7 items-center rounded-md border border-border bg-secondary/50 px-2 py-1.5" />
                <div className="col-span-3 flex h-7 items-center justify-center rounded-md border border-border bg-secondary/50 px-1.5" />
                <div className="col-span-4 flex h-7 items-center justify-center rounded-md border border-border bg-secondary/50 px-1.5" />
              </div>
            ));
          })()}
        </div>
      </div>
    </Section>
  );
});
