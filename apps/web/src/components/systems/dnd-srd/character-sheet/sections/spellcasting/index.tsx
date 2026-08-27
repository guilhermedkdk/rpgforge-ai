'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  computeSpellModifiers,
  getCastingClasses,
  isMagicalSecretsFeature,
  isBardClassItem,
  isHighElfLineageSelected,
  isWizardClassItem,
  isEldritchInvocationsFeature,
  isPactOfTomeOption,
  pruneEldritchInvocationSelections,
  clampSpellSlotsExpended,
  ruleItemIsRitual,
  ruleItemSpellLevel,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { ChevronDown } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { needsChoiceHighlight } from '../../constants';
import type { PendingFlags } from '../../pending-flags';
import { HighElfCantripSwapDialog } from './dialogs/high-elf-cantrip-swap-dialog';
import { PactOfTomeDialog } from './dialogs/pact-of-tome-dialog';
import { SpellLevelBlock } from './spell-level-block';
import { SpellPickerDialog } from './dialogs/spell-picker-dialog';
import { useGrantedSpells } from './hooks/use-granted-spells';
import { usePactOfTome } from './hooks/use-pact-of-tome';
import { useSpellCatalog } from './hooks/use-spell-catalog';
import { useSpellcastingModel } from './hooks/use-spellcasting-model';
import { useWizardSpellbook } from './hooks/use-wizard-spellbook';
import { WizardSpellbookDialog } from './dialogs/wizard-spellbook-dialog';

const allowanceLabelClass =
  'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground';
const allowanceChipClass =
  'rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-xs font-bold tabular-nums text-foreground';

/** One class's share of an allowance, listed inside the counter's breakdown. */
interface SpellAllowanceShare {
  className: string;
  picked: number;
  max: number;
}

/**
 * One "picked / allowance" read-out. Shared by the cantrip and the level 1+ counters.
 *
 * The row stays ONE line at any class count: the chip shows the total and the per-class split opens
 * from it. Rendering the split inline does not scale, and a five-class caster is legal: laying out
 * "BARD 0/2 SORCERER 0/4 WARLOCK 0/2 CLERIC 0/3 DRUID 0/2" twice buried the sheet under a wall of
 * numbers. The split is also already visible where it is actionable, as the picker's class tabs.
 */
function SpellAllowanceCounter({
  label,
  picked,
  max,
  title,
  breakdown,
}: {
  label: string;
  picked: number;
  max: number;
  title: string;
  /** Per-class shares; only rendered with 2+ casters, where the total alone hides the split. */
  breakdown?: SpellAllowanceShare[];
}) {
  if (max <= 0) return null;
  if (!breakdown || breakdown.length < 2) {
    return (
      <div className="flex items-center gap-2">
        <span className={allowanceLabelClass}>{label}</span>
        <span className={allowanceChipClass} title={title}>
          {picked}/{max}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className={allowanceLabelClass}>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              allowanceChipClass,
              'flex cursor-pointer items-center gap-1 transition-colors hover:border-primary'
            )}
            aria-label={`${label}: ${picked} of ${max}. Show the split per class`}
          >
            {picked}/{max}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 p-2 text-xs">
          <p className={cn(allowanceLabelClass, 'mb-1.5 block')}>{label} per class</p>
          <ul className="space-y-1">
            {breakdown.map((share) => {
              const done = share.picked >= share.max;
              return (
                <li key={share.className} className="flex items-center justify-between gap-3">
                  <span
                    className={cn('truncate', done ? 'text-muted-foreground' : 'text-foreground')}
                  >
                    {share.className}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 tabular-nums',
                      done ? 'text-muted-foreground' : 'font-semibold text-primary'
                    )}
                  >
                    {share.picked}/{share.max}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 border-t border-border pt-1.5 text-[11px] leading-snug text-muted-foreground">
            Each class draws from its own list and its own allowance; one can&apos;t pay for
            another.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HeaderFieldLabel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span className="flex h-5 items-center gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        id={id}
      >
        {children}
      </span>
    </span>
  );
}

interface SpellcastingProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  proficiencyBonus: number | undefined;
  classes: RuleItemResponse[];
  races: RuleItemResponse[];
  pendingFlags: PendingFlags;
}

const SPELL_LEVELS_1_TO_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * Prunes player-picked (non-granted) spells across `levels` down to `cap`, dropping the
 * highest-level, most-recently-added picks first (granted rows are always kept). Returns the SAME
 * object when nothing changes so callers can skip the update. `cap <= 0` is treated as "don't touch"
 * to avoid wiping a pool when the cap hasn't settled. Shared by the cantrip (level 0) and
 * prepared/known (level 1+) caps so both shrink the same way.
 */
const prunePickedSpellsToCap = (
  byLevel: CharacterFormData['spellsByLevel'],
  levels: number[],
  cap: number
): CharacterFormData['spellsByLevel'] => {
  let picked = 0;
  for (const lvl of levels) picked += (byLevel[lvl] ?? []).filter((s) => !s.granted).length;
  if (cap <= 0 || picked <= cap) return byLevel;
  let toDrop = picked - cap;
  const next = { ...byLevel };
  for (const lvl of [...levels].sort((a, b) => b - a)) {
    if (toDrop <= 0) break;
    const rows = next[lvl] ?? [];
    if (rows.length === 0) continue;
    const kept: typeof rows = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      if (toDrop > 0 && !rows[i].granted) {
        toDrop--;
        continue;
      }
      kept.unshift(rows[i]);
    }
    next[lvl] = kept;
  }
  return next;
};

export function SpellcastingSection({
  data,
  onChange,
  proficiencyBonus,
  classes,
  races,
  pendingFlags,
}: SpellcastingProps) {
  // Resolved before the catalog: it needs the same list to slice each class's own spell list, and
  // the model needs the catalog's lookup to attribute spells. One shared resolution, no second copy.
  const castingClasses = React.useMemo(() => getCastingClasses(data, classes), [data, classes]);
  const castingClassIds = React.useMemo(
    () => castingClasses.map((c) => c.classRuleItemId),
    [castingClasses]
  );

  const selectedClassItem = React.useMemo(
    () => classes.find((c) => c.id === data.classRuleItemId) ?? null,
    [classes, data.classRuleItemId]
  );
  // The Wizard among the casting classes, not just the sheet's initial class: a Cleric 4 / Wizard 3
  // owns a spellbook, and its capacity follows the WIZARD level (10 at Wizard 3, not 18 at total 7).
  const wizardCastingClass = React.useMemo(
    () =>
      castingClasses.find((c) =>
        isWizardClassItem(classes.find((ci) => ci.id === c.classRuleItemId) ?? null)
      ) ?? null,
    [castingClasses, classes]
  );
  const wizardSpellbookEnabled = wizardCastingClass != null;

  const hasMagicalSecrets = React.useMemo(
    () =>
      (data.featureDetails ?? []).some((f) => f.source === 'class' && isMagicalSecretsFeature(f)),
    [data.featureDetails]
  );
  const mergeMagicalSecretsSpellLists = hasMagicalSecrets && isBardClassItem(selectedClassItem);

  const catalog = useSpellCatalog({
    data,
    classes,
    races,
    mergeMagicalSecrets: mergeMagicalSecretsSpellLists,
    castingClassIds,
  });

  const model = useSpellcastingModel({
    data,
    onChange,
    proficiencyBonus,
    castingClasses,
    resolveSpell: catalog.resolveSpellRule,
  });

  const granted = useGrantedSpells({
    data,
    onChange,
    spellPackId: catalog.spellPackId,
    packSpellsLoading: catalog.packSpellsLoading,
    packSpells: catalog.packSpells,
    classSpells: catalog.classSpells,
    lookupSpellByParsedName: catalog.lookupSpellByParsedName,
  });
  const selectedSpells = granted.selectedSpells;

  const spellbook = useWizardSpellbook({
    data,
    onChange,
    wizardLevel: wizardCastingClass?.level ?? data.level ?? 1,
  });

  const pactOfTome = usePactOfTome({ data, onChange });
  const eldritchFeat = React.useMemo(
    () =>
      (data.featureDetails ?? []).find(
        (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
      ) ?? null,
    [data.featureDetails]
  );
  // Book of Shadows is available once the Pact of the Tome invocation is selected.
  const pactOfTomeEnabled = React.useMemo(() => {
    const options = eldritchFeat?.options ?? [];
    const selections = data.eldritchInvocationSelections ?? [];
    if (!eldritchFeat || options.length === 0 || selections.length === 0) return false;
    const optionByKey = new Map(options.map((o) => [o.key, o]));
    return selections.some((s) => isPactOfTomeOption(optionByKey.get(s.key)?.desc));
  }, [eldritchFeat, data.eldritchInvocationSelections]);
  const [pactOfTomeOpen, setPactOfTomeOpen] = React.useState(false);

  // Per-spell modifier badges: which features change a spell and WHAT they change, with the
  // character's numbers already resolved (see shared `computeSpellModifiers` for the rules).
  const spellModifiersBySpellName = React.useMemo(
    () =>
      computeSpellModifiers({
        data: { ...data, spellsByLevel: selectedSpells },
        resolveSpell: catalog.resolveSpellRule,
      }),
    [data, selectedSpells, catalog.resolveSpellRule]
  );

  // Reset an Eldritch Invocation's spell pick when that cantrip/spell leaves the sheet — covers any
  // disappearance (a race-granted cantrip vanishing after a sub-race change, a manual removal, etc.),
  // not just removals through the spell row X.
  const knownSpellNamesKey = React.useMemo(() => {
    const names: string[] = [];
    for (const rows of Object.values(data.spellsByLevel ?? {})) {
      for (const r of rows) names.push(r.name.trim().toLowerCase());
    }
    return names.sort().join('|');
  }, [data.spellsByLevel]);

  const invocationSyncRef = React.useRef({ data, onChange });
  invocationSyncRef.current = { data, onChange };

  React.useEffect(() => {
    // Don't prune while spells are still loading — the sheet's granted spells aren't settled yet.
    if (catalog.packSpellsLoading || catalog.spellsLoading) return;
    const { data: d, onChange: emit } = invocationSyncRef.current;
    const selections = d.eldritchInvocationSelections ?? [];
    if (!selections.some((s) => s.spellName)) return;
    const known = new Set(knownSpellNamesKey ? knownSpellNamesKey.split('|') : []);
    const stillValid = selections.filter(
      (sel) => !sel.spellName || known.has(sel.spellName.trim().toLowerCase())
    );
    if (stillValid.length === selections.length) return;
    const feat = (d.featureDetails ?? []).find(
      (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
    );
    emit({
      ...d,
      eldritchInvocationSelections: pruneEldritchInvocationSelections(
        stillValid,
        feat?.options ?? [],
        {
          characterLevel: d.level,
          featureNamesLower: (d.featureDetails ?? []).map((f) => f.name.trim().toLowerCase()),
        }
      ),
    });
  }, [knownSpellNamesKey, catalog.packSpellsLoading, catalog.spellsLoading]);

  // When a cap shrinks — a class-feature option that granted an extra cantrip is removed (Cleric
  // Thaumaturge / Druid Magician), OR the character's level drops — prune the excess player-picked
  // spells so the count follows the cap, like every other feature-driven grant. Cantrips (level 0,
  // maxCantrips) and prepared/known spells (levels 1+, maxPreparedSpells) shrink the SAME way.
  // Guarded on the DERIVED spellcasting feature (never null mid-hydration) so it can't wipe valid
  // spells before the sheet settles.
  React.useEffect(() => {
    if (catalog.packSpellsLoading || catalog.spellsLoading) return;
    if (!model.spellcastingFeature) return;
    const { data: d, onChange: emit } = invocationSyncRef.current;
    const current = d.spellsByLevel ?? {};
    let next = prunePickedSpellsToCap(current, [0], model.maxCantrips);
    next = prunePickedSpellsToCap(next, SPELL_LEVELS_1_TO_9, model.maxPreparedSpells);
    if (next === current) return;
    emit({ ...d, spellsByLevel: next });
  }, [
    model.maxCantrips,
    model.maxPreparedSpells,
    model.spellcastingFeature,
    knownSpellNamesKey,
    catalog.packSpellsLoading,
    catalog.spellsLoading,
  ]);

  const isHighElfLineage = React.useMemo(() => isHighElfLineageSelected(data), [data]);
  // The single swappable High Elf cantrip (Prestidigitation by default). Only this row gets the
  // swap control — other race-granted cantrips (e.g. Magic Initiate) are not swappable.
  const highElfCantripName = isHighElfLineage
    ? (data.highElfCantripName ?? 'Prestidigitation')
    : null;
  const [highElfSwapOpen, setHighElfSwapOpen] = React.useState(false);

  const handleSelectHighElfCantrip = React.useCallback(
    (spellName: string) => {
      onChange({ ...data, highElfCantripName: spellName });
      setHighElfSwapOpen(false);
    },
    [data, onChange]
  );

  const groupBySpellLevel = (spells: RuleItemResponse[]): Record<number, RuleItemResponse[]> => {
    const map: Record<number, RuleItemResponse[]> = {};
    for (const s of spells) {
      const lvl = ruleItemSpellLevel(s);
      (map[lvl] ??= []).push(s);
    }
    for (const rows of Object.values(map)) rows.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  };

  const spellsBySpellLevel = React.useMemo(
    () => groupBySpellLevel(catalog.classSpells),
    [catalog.classSpells]
  );

  // The spellbook is stocked from the WIZARD's list, which on a multiclass sheet is not the union.
  const wizardSpellsBySpellLevel = React.useMemo(() => {
    const wizardId = wizardCastingClass?.classRuleItemId;
    if (!wizardId) return spellsBySpellLevel;
    return groupBySpellLevel(catalog.classSpellsByClass[wizardId] ?? []);
  }, [wizardCastingClass, catalog.classSpellsByClass, spellsBySpellLevel]);

  // Book of Shadows picks: any class's cantrips / level-1 ritual spells, minus spells already on
  // the sheet from other sources (the pact's own picks stay visible so they can be removed).
  const pactOfTomeCantripOptions = React.useMemo(() => {
    if (!pactOfTomeEnabled) return [];
    const own = new Set(pactOfTome.cantrips.map((n) => n.toLowerCase()));
    const knownOther = new Set(
      (selectedSpells[0] ?? []).map((s) => s.name.trim().toLowerCase()).filter((n) => !own.has(n))
    );
    return catalog.packSpells
      .filter((s) => ruleItemSpellLevel(s) === 0 && !knownOther.has(s.name.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pactOfTomeEnabled, pactOfTome.cantrips, selectedSpells, catalog.packSpells]);

  const pactOfTomeRitualOptions = React.useMemo(() => {
    if (!pactOfTomeEnabled) return [];
    const own = new Set(pactOfTome.rituals.map((n) => n.toLowerCase()));
    const knownOther = new Set(
      (selectedSpells[1] ?? []).map((s) => s.name.trim().toLowerCase()).filter((n) => !own.has(n))
    );
    return catalog.packSpells
      .filter(
        (s) =>
          ruleItemSpellLevel(s) === 1 &&
          ruleItemIsRitual(s) &&
          !knownOther.has(s.name.trim().toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pactOfTomeEnabled, pactOfTome.rituals, selectedSpells, catalog.packSpells]);

  // Raw data: used for add/remove operations that write back to data.spellsByLevel.
  const rawSpells = data.spellsByLevel ?? {};

  const catalogLoading = catalog.spellsLoading || catalog.packSpellsLoading;

  /**
   * One picking budget per casting class: the spells it can still add (its OWN list, minus what the
   * sheet already has) and how much of its own allowance is left. Multiclassing makes a single flat
   * budget wrong: a Cleric 4 / Wizard 3 owes 4 Cleric cantrips AND 3 Wizard ones, and neither pool
   * may pay for the other.
   */
  const classBudgets = React.useMemo(() => {
    return model.allowanceByClass.map((c) => {
      const isWizard = c.classRuleItemId === wizardCastingClass?.classRuleItemId;
      const availableByLevel: Record<number, RuleItemResponse[]> = {};
      for (const spell of catalog.classSpellsByClass[c.classRuleItemId] ?? []) {
        const lvl = ruleItemSpellLevel(spell);
        // The multiclass slot table hands out slots this class's own progression never would, and
        // those only upcast: a Ranger 4 / Sorcerer 3 has level-3 slots but prepares Ranger spells at
        // level 1 and Sorcerer spells at level 2.
        if (lvl > c.maxSpellLevel) continue;
        // A Wizard prepares only what is in the spellbook; other classes prepare off the full list.
        if (
          isWizard &&
          lvl >= 1 &&
          !spellbook.allNameSetByLevel[lvl]?.has(spell.name.trim().toLowerCase())
        ) {
          continue;
        }
        if ((selectedSpells[lvl] ?? []).some((ms) => ms.name === spell.name)) continue;
        (availableByLevel[lvl] ??= []).push(spell);
      }
      for (const rows of Object.values(availableByLevel)) {
        rows.sort((a, b) => a.name.localeCompare(b.name));
      }
      let leveledOpen = 0;
      for (let lvl = 1; lvl <= 9; lvl++) leveledOpen += availableByLevel[lvl]?.length ?? 0;
      // Cap each allowance at what its own pool can still offer, so a class whose list is exhausted
      // never keeps the section red (nor blocks a save) with nothing left to pick.
      return {
        ...c,
        availableByLevel,
        maxCantrips: Math.min(c.cantrips, c.pickedCantrips + (availableByLevel[0]?.length ?? 0)),
        maxPrepared: Math.min(c.prepared, c.pickedPrepared + leveledOpen),
      };
    });
  }, [
    model.allowanceByClass,
    catalog.classSpellsByClass,
    selectedSpells,
    spellbook.allNameSetByLevel,
    wizardCastingClass,
  ]);

  const classPickedCantripCount = (selectedSpells[0] ?? []).filter((s) => !s.granted).length;
  const totalSelectedLevel1Plus = React.useMemo(() => {
    let count = 0;
    for (const [lvlStr, spells] of Object.entries(selectedSpells)) {
      if (Number(lvlStr) >= 1) count += spells.filter((s) => !s.granted).length;
    }
    return count;
  }, [selectedSpells]);

  // With no casting class resolved (mid-hydration) fall back to the aggregate, so the section keeps
  // working exactly as it did before per-class budgets existed.
  const hasClassBudgets = classBudgets.length > 0;
  const effectiveMaxCantrips = hasClassBudgets
    ? classBudgets.reduce((sum, c) => sum + c.maxCantrips, 0)
    : model.maxCantrips;
  const effectiveMaxPrepared = hasClassBudgets
    ? classBudgets.reduce((sum, c) => sum + c.maxPrepared, 0)
    : model.maxPreparedSpells;

  /** Classes that may still add a spell at this level, in sheet order. */
  const budgetsWithRoomAt = React.useCallback(
    (level: number) =>
      classBudgets.filter((c) => {
        const room =
          level === 0 ? c.pickedCantrips < c.maxCantrips : c.pickedPrepared < c.maxPrepared;
        return room && (c.availableByLevel[level]?.length ?? 0) > 0;
      }),
    [classBudgets]
  );

  /**
   * Whether the `+` on a given level block does anything. Per level, because a class's allowance is
   * useless where its list has nothing left: the multiclass slot table opens levels no class can
   * prepare at yet, and the global "can I still pick?" flag made those open an empty picker.
   */
  const canAddAtLevel = React.useCallback(
    (level: number) => {
      if (hasClassBudgets) return budgetsWithRoomAt(level).length > 0;
      return level === 0
        ? classPickedCantripCount < effectiveMaxCantrips
        : totalSelectedLevel1Plus < effectiveMaxPrepared;
    },
    [
      hasClassBudgets,
      budgetsWithRoomAt,
      classPickedCantripCount,
      effectiveMaxCantrips,
      totalSelectedLevel1Plus,
      effectiveMaxPrepared,
    ]
  );

  const addSpell = (level: number, spell: RuleItemResponse, classRuleItemId?: string) => {
    const current = selectedSpells[level] ?? [];
    if (current.some((s) => s.name === spell.name)) return;
    // The owner is recorded only when it is a real choice; on one casting class it is implied, and
    // writing it would change what a single-class sheet serializes.
    const row =
      classRuleItemId && classBudgets.length > 1
        ? { name: spell.name, classRuleItemId }
        : { name: spell.name };
    onChange({
      ...data,
      spellsByLevel: {
        ...rawSpells,
        [level]: [...(rawSpells[level] ?? []), row],
      },
    });
  };

  const removeSpell = (level: number, index: number) => {
    const display = selectedSpells[level] ?? [];
    if (display[index]?.granted) return;
    const spellName = display[index]?.name;
    if (!spellName) return;
    const rawLevel = [...(rawSpells[level] ?? [])];
    const rawIdx = rawLevel.findIndex((s) => s.name === spellName && !s.granted);
    if (rawIdx < 0) return;
    rawLevel.splice(rawIdx, 1);
    // Invocations that referenced this spell are dropped reactively by the sync effect below.
    onChange({
      ...data,
      spellsByLevel: {
        ...rawSpells,
        [level]: rawLevel,
      },
    });
  };

  const handleSlotChange = (level: number, field: 'total' | 'expended', value: number) => {
    // Pact Magic: every prepared-spell level shares one slot pool, stored at slotLevel.
    if (model.pactMagicInfo && level <= model.pactMagicInfo.slotLevel) {
      level = model.pactMagicInfo.slotLevel;
    }
    const slots = data.spellSlots?.[level] ?? {};
    if (field === 'expended') {
      const maxTotal = level === 0 ? 0 : (model.slotTotalsByLevel[level] ?? 0);
      if (maxTotal <= 0) return;
      const clamped = clampSpellSlotsExpended(value, maxTotal);
      onChange({
        ...data,
        spellSlots: {
          ...(data.spellSlots || {}),
          [level]: { ...slots, expended: clamped },
        },
      });
      return;
    }
    onChange({
      ...data,
      spellSlots: {
        ...(data.spellSlots || {}),
        [level]: { ...slots, [field]: value },
      },
    });
  };
  const [pickerLevel, setPickerLevel] = React.useState<number | null>(null);
  // Which class the open picker is buying for. Reset per opening: the classes with room differ by
  // level, so a tab remembered from another level could be one that cannot pick here.
  const [pickerClassId, setPickerClassId] = React.useState<string | null>(null);
  const [spellbookPickerOpen, setSpellbookPickerOpen] = React.useState(false);

  const handleTogglePicker = React.useCallback(
    (level: number) => {
      setPickerLevel((prev) => (prev === level ? null : level));
      setPickerClassId(budgetsWithRoomAt(level)[0]?.classRuleItemId ?? null);
    },
    [budgetsWithRoomAt]
  );

  const modalLevel = pickerLevel;
  const modalIsCantrip = modalLevel === 0;
  /**
   * The class tabs shown in the picker. A class with nothing to offer AT THIS LEVEL is left out: a
   * Ranger has no cantrips at all, and a class whose table stops at level 2 has nothing to give on
   * the level-3 block, so a "Ranger 0/0" tab would only open an empty list. A class that is full but
   * still has spells in its list stays, so you can see it is done.
   */
  const modalClassTabs =
    modalLevel === null || classBudgets.length < 2
      ? []
      : classBudgets
          .map((c) => ({
            classRuleItemId: c.classRuleItemId,
            className: c.className,
            picked: modalIsCantrip ? c.pickedCantrips : c.pickedPrepared,
            max: modalIsCantrip ? c.maxCantrips : c.maxPrepared,
            available: c.availableByLevel[modalLevel]?.length ?? 0,
          }))
          .filter((t) => t.max > 0 && t.available > 0);
  const modalBudget =
    modalLevel === null
      ? null
      : (classBudgets.find((c) => c.classRuleItemId === pickerClassId) ??
        classBudgets.find((c) => c.classRuleItemId === modalClassTabs[0]?.classRuleItemId) ??
        classBudgets[0] ??
        null);
  const modalSelected = modalLevel === null ? [] : (selectedSpells[modalLevel] ?? []);
  const modalAvailable =
    modalLevel === null
      ? []
      : (modalBudget?.availableByLevel[modalLevel] ??
        // No per-class budget (mid-hydration): the union list, minus what is already on the sheet.
        (spellsBySpellLevel[modalLevel] ?? []).filter(
          (s) => !modalSelected.some((ms) => ms.name === s.name)
        ));
  const modalCanAdd =
    modalLevel === null
      ? false
      : modalBudget
        ? modalIsCantrip
          ? modalBudget.pickedCantrips < modalBudget.maxCantrips
          : modalBudget.pickedPrepared < modalBudget.maxPrepared
        : canAddAtLevel(modalLevel);

  const handleSelectFromPicker = (spell: RuleItemResponse) => {
    if (modalLevel === null) return;
    addSpell(modalLevel, spell, modalBudget?.classRuleItemId);
    // Close once THIS class's allowance is spent; with another class still owed, reopening lands on
    // its tab, so the picker never closes on a sheet that still has picks to make elsewhere.
    const spent = modalBudget
      ? modalIsCantrip
        ? modalBudget.pickedCantrips + 1 >= modalBudget.maxCantrips
        : modalBudget.pickedPrepared + 1 >= modalBudget.maxPrepared
      : modalIsCantrip
        ? classPickedCantripCount + 1 >= effectiveMaxCantrips
        : totalSelectedLevel1Plus + 1 >= effectiveMaxPrepared;
    if (spent && modalClassTabs.filter((t) => t.picked < t.max).length <= 1) setPickerLevel(null);
  };

  const availableWizardLevels = React.useMemo(
    () => Array.from({ length: 9 }, (_, i) => i + 1).filter((lvl) => model.slotAvailability[lvl]),
    [model.slotAvailability]
  );

  const renderLevelBlock = (level: number) => (
    <SpellLevelBlock
      key={level}
      level={level}
      spells={selectedSpells[level] ?? []}
      spellSlots={data.spellSlots}
      slotAvailability={model.slotAvailability}
      slotTotalsByLevel={model.slotTotalsByLevel}
      pactMagicInfo={model.pactMagicInfo}
      canAddSpell={canAddAtLevel(level)}
      onTogglePicker={handleTogglePicker}
      spellsLoading={catalog.spellsLoading}
      catalogLoading={catalogLoading}
      spellPackId={catalog.spellPackId}
      spellcastingAbility={model.spellcastingAbility}
      spellAbilityMap={model.spellAbilityMap}
      spellModifiersBySpellName={spellModifiersBySpellName}
      resolveSpellRule={catalog.resolveSpellRule}
      fetchSpellDetailsOnDemand={catalog.fetchSpellDetailsOnDemand}
      onDemandSpellLoading={catalog.onDemandSpellLoading}
      onDemandSpellFailed={catalog.onDemandSpellFailed}
      isHighElfLineage={isHighElfLineage}
      highElfCantripName={highElfCantripName}
      onOpenHighElfSwap={() => setHighElfSwapOpen(true)}
      onRemoveSpell={removeSpell}
      onSlotChange={handleSlotChange}
      pendingFlags={pendingFlags}
    />
  );

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <div className="flex w-full min-w-0 flex-col gap-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <div>
                <HeaderFieldLabel id="spellcasting-class-label">
                  {model.castingClassNames.length > 1
                    ? 'Spellcasting Classes'
                    : 'Spellcasting Class'}
                </HeaderFieldLabel>
                <input
                  type="text"
                  value={model.castingClassNames.join(' · ')}
                  readOnly
                  aria-labelledby="spellcasting-class-label"
                  className="mt-1 h-8 w-full rounded-md border border-border bg-secondary/50 px-2 text-sm font-semibold text-foreground outline-none cursor-default"
                  aria-label="Spellcasting Class"
                />
              </div>

              <div>
                <HeaderFieldLabel id="spellcasting-ability-label">
                  Spellcasting Ability
                </HeaderFieldLabel>
                <input
                  type="text"
                  value={model.allSpellcastingAbilities}
                  readOnly
                  aria-labelledby="spellcasting-ability-label"
                  className="mt-1 h-8 w-full rounded-md border border-border bg-secondary/50 px-2 text-sm font-semibold text-foreground outline-none cursor-default"
                  aria-label="Spellcasting Ability"
                />
              </div>

              <div>
                <HeaderFieldLabel id="spell-dc-label">Spell Save DC</HeaderFieldLabel>
                <div
                  aria-labelledby="spell-dc-label"
                  className="mt-1 flex h-8 items-center justify-center rounded-md border border-border bg-secondary/50"
                >
                  <span className="text-sm font-bold text-foreground">{model.multiDCStr}</span>
                </div>
              </div>

              <div>
                <HeaderFieldLabel id="spell-attack-label">Spell Attack Bonus</HeaderFieldLabel>
                <div
                  aria-labelledby="spell-attack-label"
                  className="mt-1 flex h-8 items-center justify-center rounded-md border border-border bg-secondary/50"
                >
                  <span className="text-sm font-bold text-foreground">{model.multiAttackStr}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {wizardSpellbookEnabled && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">Wizard Spellbook</span>
              <button
                type="button"
                onPointerDown={() => pendingFlags.dismiss('spells:wizard-spellbook')}
                onClick={() => setSpellbookPickerOpen(true)}
                className={cn(
                  'h-8 cursor-pointer rounded-md border px-2 text-xs font-semibold transition-colors',
                  spellbook.canAddMore
                    ? needsChoiceHighlight(pendingFlags.isFlagged('spells:wizard-spellbook'))
                    : 'border-border bg-secondary/60 text-foreground hover:border-primary hover:bg-secondary/70'
                )}
              >
                Manage spellbook
              </button>
            </div>
          </div>
        )}

        {pactOfTomeEnabled && (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground">Book of Shadows</span>
              <button
                type="button"
                onPointerDown={() => pendingFlags.dismiss('spells:pact-of-tome')}
                onClick={() => setPactOfTomeOpen(true)}
                className={cn(
                  'h-8 cursor-pointer rounded-md border px-2 text-xs font-semibold transition-colors',
                  pactOfTome.canAddCantrip || pactOfTome.canAddRitual
                    ? needsChoiceHighlight(pendingFlags.isFlagged('spells:pact-of-tome'))
                    : 'border-border bg-secondary/60 text-foreground hover:border-primary hover:bg-secondary/70'
                )}
              >
                Manage Book of Shadows
              </button>
            </div>
          </div>
        )}

        {/* Both allowances read out the same way, above the blocks they govern: the card header
            scrolls away on a ~2000px section. Right-aligned so it isn't read as a column title.
            Multiclass splits them per class, because the pools are separate: a combined "5/7" hides
            that the Wizard half is already full while the Cleric half still owes two. */}
        <div className="flex flex-col gap-2">
          {(effectiveMaxCantrips > 0 || effectiveMaxPrepared > 0) && (
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
              <SpellAllowanceCounter
                label="Cantrips"
                picked={classPickedCantripCount}
                max={effectiveMaxCantrips}
                title="Cantrips you picked, out of your allowance (granted ones don't count)"
                breakdown={classBudgets
                  .filter((c) => c.maxCantrips > 0)
                  .map((c) => ({
                    className: c.className,
                    picked: c.pickedCantrips,
                    max: c.maxCantrips,
                  }))}
              />
              <SpellAllowanceCounter
                label="Spells Prepared"
                picked={totalSelectedLevel1Plus}
                max={effectiveMaxPrepared}
                title="Spells you prepared at levels 1-9, out of your allowance (granted ones don't count)"
                breakdown={classBudgets
                  .filter((c) => c.maxPrepared > 0)
                  .map((c) => ({
                    className: c.className,
                    picked: c.pickedPrepared,
                    max: c.maxPrepared,
                  }))}
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-4 min-w-0">
              {renderLevelBlock(0)}
              {renderLevelBlock(1)}
              {renderLevelBlock(2)}
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              {renderLevelBlock(3)}
              {renderLevelBlock(4)}
              {renderLevelBlock(5)}
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              {renderLevelBlock(6)}
              {renderLevelBlock(7)}
              {renderLevelBlock(8)}
              {renderLevelBlock(9)}
            </div>
          </div>
        </div>

        <SpellPickerDialog
          level={modalLevel}
          availableSpells={modalAvailable}
          spellsLoading={catalog.spellsLoading}
          canAdd={modalCanAdd}
          classTabs={modalClassTabs}
          activeClassId={modalBudget?.classRuleItemId ?? null}
          onSelectClass={setPickerClassId}
          onSelect={handleSelectFromPicker}
          onClose={() => setPickerLevel(null)}
        />

        <WizardSpellbookDialog
          open={spellbookPickerOpen}
          onClose={() => setSpellbookPickerOpen(false)}
          spellsLoading={catalog.spellsLoading}
          availableWizardLevels={availableWizardLevels}
          spellsBySpellLevel={wizardSpellsBySpellLevel}
          spellbook={spellbook}
        />

        <PactOfTomeDialog
          open={pactOfTomeOpen}
          onClose={() => setPactOfTomeOpen(false)}
          spellsLoading={catalog.packSpellsLoading}
          cantripOptions={pactOfTomeCantripOptions}
          ritualOptions={pactOfTomeRitualOptions}
          pact={pactOfTome}
        />
      </div>

      <HighElfCantripSwapDialog
        open={highElfSwapOpen}
        onOpenChange={setHighElfSwapOpen}
        spellPackId={catalog.spellPackId}
        currentCantripName={data.highElfCantripName}
        onSelect={handleSelectHighElfCantrip}
      />
    </TooltipProvider>
  );
}
