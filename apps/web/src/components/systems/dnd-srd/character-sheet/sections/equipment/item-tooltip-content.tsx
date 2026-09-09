'use client';

import { stripToolItemPriceSuffix, type RuleItemResponse } from '@rpgforce-ai/shared';

export function ItemTooltipContent({ item }: { item: RuleItemResponse }) {
  const displayName = stripToolItemPriceSuffix(item.name);
  const norm = (item.normalized ?? {}) as Record<string, unknown>;
  const tags = item.tagKeys;

  const weightRaw = typeof norm.weight === 'string' ? parseFloat(norm.weight) : null;
  const weightText =
    weightRaw != null && weightRaw > 0
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
        {weightText && <span className="text-[11px] text-muted-foreground">{weightText}</span>}
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
              <span className="font-medium text-foreground">
                {String(armorObj.strengthScoreRequired)}
              </span>
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
