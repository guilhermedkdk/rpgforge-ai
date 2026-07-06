'use client';

import { useState, useMemo, useEffect, useRef, memo } from 'react';
import * as React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getEffectiveModifier,
  getTotalAbilityScoreImprovementFromGains,
} from '@/lib/dnd-srd/character-state';
import { getEffectiveProficiencies } from '@/lib/dnd-srd/derived-character-stats';
import type { NormalizedWeapon } from '@rpgforce-ai/shared';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import {
  getWeaponNamesFromEquipment,
  parseWeaponProficiencyRules,
  isWeaponProficientByRules,
  getWeaponAttackAbilityMod,
  hasSelectedFightingStyle,
} from '../helpers';
import { ATTRIBUTES } from '../constants';

function weaponHasAmmunitionProperty(
  weaponTagKeys: string[],
  normRecord: Record<string, unknown>,
  weaponSubNorm:
    | {
        properties?: Array<{ property?: { name?: string | null } | null }> | null;
      }
    | null
    | undefined
): boolean {
  if (weaponTagKeys.includes('weapon:property:ammunition')) return true;
  for (const p of weaponSubNorm?.properties ?? []) {
    const n = p?.property?.name?.trim().toLowerCase();
    if (n === 'ammunition') return true;
  }
  const top = normRecord.properties;
  if (!Array.isArray(top)) return false;
  for (const p of top) {
    if (!p || typeof p !== 'object' || !('property' in p)) continue;
    const prop = (p as { property?: { name?: unknown } }).property;
    const name = typeof prop?.name === 'string' ? prop.name.trim().toLowerCase() : '';
    if (name === 'ammunition') return true;
  }
  return false;
}

interface AttacksSectionProps {
  data: import('../types').CharacterFormData;
  onChange: (data: import('../types').CharacterFormData) => void;
  readOnly?: boolean;
}

export const AttacksSection = memo(function AttacksSection({ data }: AttacksSectionProps) {
  const {
    weapons,
    feats,
    proficiencyBonus,
    effectiveEpicBoonAbilityScore,
    hasPrimalChampion,
    hasBodyAndMind,
  } = useCharacterComputed();

  const [weaponInfoAcknowledged, setWeaponInfoAcknowledged] = useState<Record<string, boolean>>({});

  const hasMartialArts = useMemo(
    () => (data.featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'martial arts'),
    [data.featureDetails]
  );
  const isUnarmoredAndUnshielded = useMemo(
    () => !data.equippedArmorId && !data.equippedShieldId,
    [data.equippedArmorId, data.equippedShieldId]
  );
  const martialArtsDie = useMemo((): string | null => {
    if (!hasMartialArts) return null;
    const currentLevel = Math.max(1, Math.min(20, data.level ?? 1));
    const martialFeature = (data.featureDetails ?? []).find(
      (f) => f.name.trim().toLowerCase() === 'martial arts'
    );
    const tableData = martialFeature?.tableData ?? [];
    if (tableData.length === 0) return null;
    const dieTables = tableData.filter((t) =>
      (t.rows ?? []).some((r) => /d\s*\d+/i.test(String(r.value ?? '')))
    );
    const preferredFromTables = dieTables.length > 0 ? dieTables : tableData;
    const preferredTable =
      preferredFromTables.find((t) => t.label.trim().toLowerCase() === 'martial arts die') ??
      preferredFromTables.find((t) => t.label.trim().toLowerCase().includes('martial arts die')) ??
      preferredFromTables.find((t) => t.label.trim().toLowerCase().includes('martial arts')) ??
      preferredFromTables[0];
    const eligible = (preferredTable?.rows ?? [])
      .filter((r) => r.level <= currentLevel)
      .sort((a, b) => b.level - a.level);
    const rawValue = eligible[0]?.value?.trim() ?? '';
    if (!rawValue) return null;
    const compact = rawValue.replace(/\s+/g, '');
    const matchWithCount = compact.match(/^(\d+)d(\d+)$/i);
    if (matchWithCount) return `${matchWithCount[1]}d${matchWithCount[2]}`;
    const matchOnlyDie = compact.match(/^d(\d+)$/i);
    if (matchOnlyDie) return `1d${matchOnlyDie[1]}`;
    const matchAnyDie = compact.match(/d(\d+)/i);
    if (matchAnyDie) return `1d${matchAnyDie[1]}`;
    return null;
  }, [data.featureDetails, data.level, hasMartialArts]);

  const parseDiceFaces = (dice: string | null | undefined): number | null => {
    if (!dice) return null;
    const compact = String(dice).replace(/\s+/g, '').trim();
    if (/^\d+$/.test(compact)) return parseInt(compact, 10);
    const m = compact.match(/^(\d+)?d(\d+)$/i) ?? compact.match(/d(\d+)/i);
    if (!m) return null;
    const facesStr = m[m.length - 1];
    const faces = parseInt(facesStr, 10);
    return Number.isFinite(faces) ? faces : null;
  };

  const weaponNames = useMemo(() => {
    const fromEquipment = getWeaponNamesFromEquipment(data.equipment, weapons);
    const unarmedName = 'Unarmed Strike';
    return fromEquipment.includes(unarmedName) ? fromEquipment : [unarmedName, ...fromEquipment];
  }, [data.equipment, weapons]);

  const weaponProficiencyRules = useMemo(
    () => parseWeaponProficiencyRules(getEffectiveProficiencies(data)),
    [data.proficiencies, data.raceTraitSelections]
  );

  const hasArcheryFightingStyleSelected = useMemo(
    () => hasSelectedFightingStyle(data, feats, 'archery'),
    [data, feats]
  );

  const effectiveModifiers = useMemo(
    () =>
      Object.fromEntries(
        ATTRIBUTES.map((a) => {
          const combinedBonus: Record<string, number> = {};
          const bg = data.backgroundAbilityScoreIncrease ?? {};
          const asi = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
          for (const k of new Set([...Object.keys(bg), ...Object.keys(asi)])) {
            combinedBonus[k] = (bg[k] ?? 0) + (asi[k] ?? 0);
          }
          return [
            a,
            getEffectiveModifier(
              data.attributes ?? {},
              combinedBonus,
              a,
              effectiveEpicBoonAbilityScore,
              hasPrimalChampion,
              hasBodyAndMind,
              data.grapplerAbilityScore
            ),
          ];
        })
      ),
    [
      data.attributes,
      data.backgroundAbilityScoreIncrease,
      data.abilityScoreImprovementByGain,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ]
  );

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
          {weaponNames.map((weaponName) => {
            const weapon = weapons.find((w) => w.name === weaponName);
            const norm = (weapon?.normalized ?? {}) as NormalizedWeapon & Record<string, unknown>;
            const weaponNorm = (
              norm as unknown as {
                weapon?: {
                  damageDice?: string;
                  damageType?: { name?: string } | null;
                  properties?: Array<{
                    property?: { name?: string | null } | null;
                  }> | null;
                } | null;
                damage?: string;
                damageDice?: string;
              }
            ).weapon;
            const normRecord = norm as Record<string, unknown>;
            const topLevelDamage =
              typeof normRecord.damage === 'string'
                ? (normRecord.damage as string)
                : typeof normRecord.damageDice === 'string'
                  ? (normRecord.damageDice as string)
                  : typeof normRecord.damage_dice === 'string'
                    ? (normRecord.damage_dice as string)
                    : '';
            let baseDamageDisplay = topLevelDamage;
            if (!baseDamageDisplay && weaponNorm) {
              const dice = typeof weaponNorm.damageDice === 'string' ? weaponNorm.damageDice : '';
              baseDamageDisplay = dice;
            }
            let damageTypeName =
              (weaponNorm?.damageType?.name as string | undefined) ??
              (normRecord.damageType as string | undefined) ??
              ((normRecord.damage_type as { name?: unknown } | undefined)?.name as
                | string
                | undefined) ??
              '';
            const weaponCategory: 'simple' | 'martial' | undefined = weapon?.tagKeys?.includes(
              'weapon:type:simple'
            )
              ? 'simple'
              : weapon?.tagKeys?.includes('weapon:type:martial')
                ? 'martial'
                : undefined;
            const weaponTagKeys = weapon?.tagKeys ?? [];
            const proficientWithWeapon = isWeaponProficientByRules(
              weaponCategory,
              weaponTagKeys,
              weaponProficiencyRules
            );
            const isUnarmedStrike = weaponName.trim().toLowerCase() === 'unarmed strike';
            const weaponHasLightProp = weaponTagKeys.includes('weapon:property:light');
            const isRangedByAmmo = weaponTagKeys.includes('weapon:property:ammunition');
            const isMartialArtsWeapon =
              (weaponCategory === 'simple' && !isRangedByAmmo) ||
              (weaponCategory === 'martial' && weaponHasLightProp && !isRangedByAmmo);
            const martialArtsApplies =
              hasMartialArts &&
              isUnarmoredAndUnshielded &&
              !!martialArtsDie &&
              (isUnarmedStrike || isMartialArtsWeapon);

            const strMod = effectiveModifiers['Strength'] ?? 0;
            const dexMod = effectiveModifiers['Dexterity'] ?? 0;

            const baseModFromRules = getWeaponAttackAbilityMod(
              norm,
              effectiveModifiers,
              weaponTagKeys
            );
            const baseMod = martialArtsApplies ? Math.max(strMod, dexMod) : baseModFromRules;

            if (isUnarmedStrike) {
              if (!baseDamageDisplay) baseDamageDisplay = '1';
              if (!damageTypeName) damageTypeName = 'Bludgeoning';
            }

            if (martialArtsApplies && martialArtsDie) {
              const martialFaces = parseDiceFaces(martialArtsDie);
              const originalFaces = parseDiceFaces(baseDamageDisplay);
              if (martialFaces != null && originalFaces != null && originalFaces <= martialFaces) {
                baseDamageDisplay = martialArtsDie;
              }
            }
            const toHitBonus =
              proficiencyBonus != null && isUnarmedStrike
                ? proficiencyBonus
                : proficientWithWeapon && proficiencyBonus != null
                  ? proficiencyBonus
                  : 0;
            const hasAmmunitionProperty = weapon
              ? weaponHasAmmunitionProperty(weaponTagKeys, normRecord, weaponNorm)
              : false;
            const archeryToHitBonus =
              hasArcheryFightingStyleSelected && !isUnarmedStrike && hasAmmunitionProperty ? 2 : 0;
            const totalToHit = baseMod + toHitBonus + archeryToHitBonus;
            const damageDisplay =
              baseDamageDisplay && baseMod !== 0
                ? `${baseDamageDisplay} ${baseMod > 0 ? '+' : '-'} ${Math.abs(baseMod)}`
                : baseDamageDisplay ||
                  (baseMod !== 0 ? (baseMod > 0 ? `+${baseMod}` : `${baseMod}`) : '');

            const weaponNormFull = (weapon?.normalized ?? {}) as {
              weapon?: {
                properties?: Array<{
                  detail?: string | null;
                  property?: {
                    name?: string | null;
                    desc?: string | null;
                    type?: string | null;
                  } | null;
                }>;
              };
            };
            const hasWeaponMastery =
              weapon != null &&
              Array.isArray(data.weaponMasteryWeaponIds) &&
              data.weaponMasteryWeaponIds.includes(weapon.id);
            const weaponPropertiesAll =
              weaponNormFull.weapon?.properties?.filter(
                (p) => p && p.property && typeof p.property.name === 'string'
              ) ?? [];
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
            const weaponPropertiesForTooltip = [...weaponPropertiesAll, ...topLevelProperties];

            const toHitDisplay =
              proficientWithWeapon && proficiencyBonus == null
                ? `${baseMod >= 0 ? '+' : ''}${baseMod} —`
                : totalToHit >= 0
                  ? `+${totalToHit}`
                  : `${totalToHit}`;
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
                      data-editable="true"
                      className={cn(
                        'col-span-5 flex h-7 cursor-pointer items-center rounded-md border bg-secondary/60 px-2 py-1.5 text-sm text-foreground shadow-[0_0_0_1px_rgba(250,250,250,0.03)] outline-none transition-colors hover:border-primary hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring',
                        weaponAcknowledged ? 'border-border' : 'border-dashed border-primary/70'
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
