'use client';

import { useState, useMemo } from 'react';
import { Plus, Minus, Coins } from 'lucide-react';
import {
  getItemCostGP,
  formatCostInfo,
  getEquipmentItemQuantity,
  parseBundleItemName,
  singularizeIfPlural,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useRuleLibraryData } from '../../context';
import { ItemTooltipContent } from './item-tooltip-content';

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
export function AddEquipmentShop({ coins, availableGP, equipment, onAddItem }: AddEquipmentShopProps) {
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
    const { displayName, bundleQty, baseName } = parseBundleItemName(item.name);
    const equipmentName = bundleQty != null ? singularizeIfPlural(baseName, bundleQty) : baseName;
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
