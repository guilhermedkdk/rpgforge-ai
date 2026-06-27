'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  isBlessedStrikesPotentSpellcasting,
  isElementalFuryPotentSpellcasting,
  isImprovedElementalFuryPotentSpellcasting,
  isMagicalSecretsFeatureName,
} from '@/lib/dnd-srd/character-state';
import {
  isBardClassItem,
  isHighElfLineageSelected,
  isWizardClassItem,
} from '@/lib/dnd-srd/class-detection';
import { isEldritchInvocationsFeature } from '@/lib/dnd-srd/feature-mechanics';
import {
  isPactOfTomeOption,
  pruneEldritchInvocationSelections,
} from '@/lib/dnd-srd/eldritch-invocations';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { needsChoiceHighlight } from '../../constants';
import { buildSpellModifierBadge, type SpellBadge } from './spell-badge';
import { HighElfCantripSwapDialog } from './high-elf-cantrip-swap-dialog';
import { PactOfTomeDialog } from './pact-of-tome-dialog';
import { SpellLevelBlock } from './spell-level-block';
import { SpellPickerDialog } from './spell-picker-dialog';
import {
  clampSpellSlotsExpended,
  ruleItemDealsDamage,
  ruleItemIsRitual,
  ruleItemRangeFeet,
  ruleItemSpellLevel,
} from './spell-utils';
import { useGrantedSpells } from './use-granted-spells';
import { usePactOfTome } from './use-pact-of-tome';
import { useSpellCatalog } from './use-spell-catalog';
import { useSpellcastingModel } from './use-spellcasting-model';
import { useWizardSpellbook } from './use-wizard-spellbook';
import { WizardSpellbookDialog } from './wizard-spellbook-dialog';

interface SpellcastingProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  proficiencyBonus: number | undefined;
  classes: RuleItemResponse[];
  races: RuleItemResponse[];
  saveAttempted?: boolean;
}

export function SpellcastingSection({
  data,
  onChange,
  proficiencyBonus,
  classes,
  races,
  saveAttempted = false,
}: SpellcastingProps) {
  const model = useSpellcastingModel({ data, onChange, proficiencyBonus });

  const selectedClassItem = React.useMemo(
    () => classes.find((c) => c.id === data.classRuleItemId) ?? null,
    [classes, data.classRuleItemId]
  );
  const isWizardSheetClass = isWizardClassItem(selectedClassItem);
  const wizardSpellbookEnabled = isWizardSheetClass;

  const hasMagicalSecrets = React.useMemo(
    () =>
      (data.featureDetails ?? []).some(
        (f) => f.source === 'class' && isMagicalSecretsFeatureName(f.name)
      ),
    [data.featureDetails]
  );
  const mergeMagicalSecretsSpellLists = hasMagicalSecrets && isBardClassItem(selectedClassItem);

  const catalog = useSpellCatalog({
    data,
    classes,
    races,
    mergeMagicalSecrets: mergeMagicalSecretsSpellLists,
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

  const spellbook = useWizardSpellbook({ data, onChange });

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

  // Map of spell-name (lowercase) → invocation labels, so the spells page can badge any spell/cantrip
  // tied to an Eldritch Invocation (e.g. Eldritch Blast chosen for Agonizing Blast / Repelling Blast).
  const invocationLabelsBySpellName = React.useMemo(() => {
    const map = new Map<string, string[]>();
    const optionByKey = new Map((eldritchFeat?.options ?? []).map((o) => [o.key, o]));
    for (const sel of data.eldritchInvocationSelections ?? []) {
      const name = sel.spellName?.trim().toLowerCase();
      if (!name) continue;
      const label = optionByKey.get(sel.key)?.label ?? 'Eldritch Invocation';
      const labels = map.get(name) ?? [];
      if (!labels.includes(label)) labels.push(label);
      map.set(name, labels);
    }
    return map;
  }, [eldritchFeat, data.eldritchInvocationSelections]);

  // Potent Spellcasting (Cleric Blessed Strikes / Druid Elemental Fury) adds the Wisdom modifier to
  // the damage of any class cantrip — badge the damage-dealing cantrips on the sheet. The badge label
  // names the source feat ("Blessed" / "Elemental").
  const potentSpellcastingSource = isBlessedStrikesPotentSpellcasting(data)
    ? 'Blessed'
    : isElementalFuryPotentSpellcasting(data)
      ? 'Elemental'
      : null;
  const potentSpellcastingDamageCantrips = React.useMemo(() => {
    const set = new Set<string>();
    if (!potentSpellcastingSource) return set;
    for (const s of selectedSpells[0] ?? []) {
      const rule = catalog.resolveSpellRule(s.name);
      if (rule && ruleItemDealsDamage(rule)) set.add(s.name.trim().toLowerCase());
    }
    return set;
  }, [potentSpellcastingSource, selectedSpells, catalog.resolveSpellRule]);

  // Druid Improved Elemental Fury (Potent Spellcasting) extends the range of any Druid cantrip with a
  // range of 10+ ft by 300 ft — badge those cantrips too (aggregated under the same "Elemental" feat).
  const improvedElementalFury = isImprovedElementalFuryPotentSpellcasting(data);
  const improvedElementalFuryRangeCantrips = React.useMemo(() => {
    const set = new Set<string>();
    if (!improvedElementalFury) return set;
    for (const s of selectedSpells[0] ?? []) {
      const rule = catalog.resolveSpellRule(s.name);
      const feet = rule ? ruleItemRangeFeet(rule) : null;
      if (feet != null && feet >= 10) set.add(s.name.trim().toLowerCase());
    }
    return set;
  }, [improvedElementalFury, selectedSpells, catalog.resolveSpellRule]);

  // Unified spell-row badges: every feature that modifies a spell contributes here, aggregated by
  // source feat so each feat renders one badge (label = feat) with a `Modified by: …` tooltip listing
  // the specific modifiers (see spell-badge.tsx for the shared convention).
  const spellBadgesBySpellName = React.useMemo(() => {
    const bySpellThenLabel = new Map<string, Map<string, string[]>>();
    const add = (name: string, label: string, source: string) => {
      let byLabel = bySpellThenLabel.get(name);
      if (!byLabel) {
        byLabel = new Map();
        bySpellThenLabel.set(name, byLabel);
      }
      const sources = byLabel.get(label) ?? [];
      if (!sources.includes(source)) sources.push(source);
      byLabel.set(label, sources);
    };
    for (const [name, labels] of invocationLabelsBySpellName) {
      for (const label of labels) add(name, 'Invocation', label);
    }
    if (potentSpellcastingSource) {
      for (const name of potentSpellcastingDamageCantrips) {
        add(name, potentSpellcastingSource, 'Potent Spellcasting');
      }
    }
    for (const name of improvedElementalFuryRangeCantrips) {
      add(name, 'Elemental', 'Improved Elemental Fury');
    }
    const map = new Map<string, SpellBadge[]>();
    for (const [name, byLabel] of bySpellThenLabel) {
      const badges: SpellBadge[] = [];
      for (const [label, sources] of byLabel) badges.push(buildSpellModifierBadge(label, sources));
      map.set(name, badges);
    }
    return map;
  }, [
    invocationLabelsBySpellName,
    potentSpellcastingSource,
    potentSpellcastingDamageCantrips,
    improvedElementalFuryRangeCantrips,
  ]);

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
      eldritchInvocationSelections: pruneEldritchInvocationSelections(stillValid, feat?.options ?? [], {
        characterLevel: d.level,
        featureNamesLower: (d.featureDetails ?? []).map((f) => f.name.trim().toLowerCase()),
      }),
    });
  }, [knownSpellNamesKey, catalog.packSpellsLoading, catalog.spellsLoading]);

  const isHighElfLineage = React.useMemo(() => isHighElfLineageSelected(data), [data]);
  // The single swappable High Elf cantrip (Prestidigitation by default). Only this row gets the
  // swap control — other race-granted cantrips (e.g. Magic Initiate) are not swappable.
  const highElfCantripName = isHighElfLineage ? (data.highElfCantripName ?? 'Prestidigitation') : null;
  const [highElfSwapOpen, setHighElfSwapOpen] = React.useState(false);

  const handleSelectHighElfCantrip = React.useCallback(
    (spellName: string) => {
      onChange({ ...data, highElfCantripName: spellName });
      setHighElfSwapOpen(false);
    },
    [data, onChange],
  );

  const spellsBySpellLevel = React.useMemo(() => {
    const map: Record<number, RuleItemResponse[]> = {};
    for (const s of catalog.classSpells) {
      const lvl = ruleItemSpellLevel(s);
      if (!map[lvl]) map[lvl] = [];
      map[lvl].push(s);
    }
    for (const key of Object.keys(map)) {
      map[Number(key)].sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [catalog.classSpells]);

  // Book of Shadows picks: any class's cantrips / level-1 ritual spells, minus spells already on
  // the sheet from other sources (the pact's own picks stay visible so they can be removed).
  const pactOfTomeCantripOptions = React.useMemo(() => {
    if (!pactOfTomeEnabled) return [];
    const own = new Set(pactOfTome.cantrips.map((n) => n.toLowerCase()));
    const knownOther = new Set(
      (selectedSpells[0] ?? [])
        .map((s) => s.name.trim().toLowerCase())
        .filter((n) => !own.has(n))
    );
    return catalog.packSpells
      .filter((s) => ruleItemSpellLevel(s) === 0 && !knownOther.has(s.name.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pactOfTomeEnabled, pactOfTome.cantrips, selectedSpells, catalog.packSpells]);

  const pactOfTomeRitualOptions = React.useMemo(() => {
    if (!pactOfTomeEnabled) return [];
    const own = new Set(pactOfTome.rituals.map((n) => n.toLowerCase()));
    const knownOther = new Set(
      (selectedSpells[1] ?? [])
        .map((s) => s.name.trim().toLowerCase())
        .filter((n) => !own.has(n))
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

  const spellsBySpellLevelForSelection = React.useMemo(() => {
    if (!wizardSpellbookEnabled) return spellsBySpellLevel;
    const out: Record<number, RuleItemResponse[]> = { ...spellsBySpellLevel };
    for (let lvl = 1; lvl <= 9; lvl++) {
      const allow = spellbook.allNameSetByLevel[lvl] ?? new Set<string>();
      out[lvl] = (spellsBySpellLevel[lvl] ?? []).filter((s) =>
        allow.has(s.name.trim().toLowerCase())
      );
    }
    return out;
  }, [wizardSpellbookEnabled, spellsBySpellLevel, spellbook.allNameSetByLevel]);
  // Raw data: used for add/remove operations that write back to data.spellsByLevel.
  const rawSpells = data.spellsByLevel ?? {};

  const totalSelectedLevel1Plus = React.useMemo(() => {
    let count = 0;
    for (const [lvlStr, spells] of Object.entries(selectedSpells)) {
      if (Number(lvlStr) >= 1) {
        count += spells.filter((s) => !s.granted).length;
      }
    }
    return count;
  }, [selectedSpells]);

  const catalogLoading = catalog.spellsLoading || catalog.packSpellsLoading;

  const canSelectMoreLevel1Plus = totalSelectedLevel1Plus < model.maxPreparedSpells;
  const classPickedCantripCount = (selectedSpells[0] ?? []).filter((s) => !s.granted).length;
  const canSelectMoreCantrips = classPickedCantripCount < model.maxCantrips;

  const addSpell = (level: number, spell: RuleItemResponse) => {
    const current = selectedSpells[level] ?? [];
    if (current.some((s) => s.name === spell.name)) return;
    onChange({
      ...data,
      spellsByLevel: {
        ...rawSpells,
        [level]: [...(rawSpells[level] ?? []), { name: spell.name }],
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
  const [spellbookPickerOpen, setSpellbookPickerOpen] = React.useState(false);

  const handleTogglePicker = React.useCallback((level: number) => {
    setPickerLevel((prev) => (prev === level ? null : level));
  }, []);

  const modalLevel = pickerLevel;
  const modalSpellsAll =
    modalLevel === null ? [] : (spellsBySpellLevelForSelection[modalLevel] ?? []);
  const modalSelected = modalLevel === null ? [] : (selectedSpells[modalLevel] ?? []);
  const modalAvailable = modalSpellsAll.filter(
    (s) => !modalSelected.some((ms) => ms.name === s.name)
  );
  const modalIsCantrip = modalLevel === 0;
  const modalCanAdd =
    modalLevel != null && (modalIsCantrip ? canSelectMoreCantrips : canSelectMoreLevel1Plus);

  const handleSelectFromPicker = (spell: RuleItemResponse) => {
    if (modalLevel === null) return;
    addSpell(modalLevel, spell);
    if (
      (modalIsCantrip && classPickedCantripCount + 1 >= model.maxCantrips) ||
      (!modalIsCantrip && totalSelectedLevel1Plus + 1 >= model.maxPreparedSpells)
    ) {
      setPickerLevel(null);
    }
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
      canSelectMoreCantrips={canSelectMoreCantrips}
      canSelectMoreLevel1Plus={canSelectMoreLevel1Plus}
      onTogglePicker={handleTogglePicker}
      spellsLoading={catalog.spellsLoading}
      catalogLoading={catalogLoading}
      spellPackId={catalog.spellPackId}
      spellcastingAbility={model.spellcastingAbility}
      spellAbilityMap={model.spellAbilityMap}
      spellBadgesBySpellName={spellBadgesBySpellName}
      resolveSpellRule={catalog.resolveSpellRule}
      fetchSpellDetailsOnDemand={catalog.fetchSpellDetailsOnDemand}
      onDemandSpellLoading={catalog.onDemandSpellLoading}
      onDemandSpellFailed={catalog.onDemandSpellFailed}
      isHighElfLineage={isHighElfLineage}
      highElfCantripName={highElfCantripName}
      onOpenHighElfSwap={() => setHighElfSwapOpen(true)}
      onRemoveSpell={removeSpell}
      onSlotChange={handleSlotChange}
      saveAttempted={saveAttempted}
    />
  );

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={0}>
      <div className="flex w-full min-w-0 flex-col gap-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  id="spellcasting-class-label"
                >
                  Spellcasting Class
                </span>
                <input
                  type="text"
                  value={data.className ?? ''}
                  readOnly
                  aria-labelledby="spellcasting-class-label"
                  className="mt-1 h-8 w-full rounded-md border border-border bg-secondary/50 px-2 text-sm font-semibold text-foreground outline-none cursor-default"
                  aria-label="Spellcasting Class"
                />
              </div>

              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  id="spellcasting-ability-label"
                >
                  Spellcasting Ability
                </span>
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
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  id="spell-dc-label"
                >
                  Spell Save DC
                </span>
                <div
                  aria-labelledby="spell-dc-label"
                  className="mt-1 flex h-8 items-center justify-center rounded-md border border-border bg-secondary/50"
                >
                  <span className="text-sm font-bold text-foreground">
                    {model.multiDCStr}
                  </span>
                </div>
              </div>

              <div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  id="spell-attack-label"
                >
                  Spell Attack Bonus
                </span>
                <div
                  aria-labelledby="spell-attack-label"
                  className="mt-1 flex h-8 items-center justify-center rounded-md border border-border bg-secondary/50"
                >
                  <span className="text-sm font-bold text-foreground">
                    {model.multiAttackStr}
                  </span>
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
                onClick={() => setSpellbookPickerOpen(true)}
                className={cn(
                  'h-8 cursor-pointer rounded-md border px-2 text-xs font-semibold transition-colors',
                  spellbook.canAddMore
                    ? needsChoiceHighlight(saveAttempted)
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
                onClick={() => setPactOfTomeOpen(true)}
                className={cn(
                  'h-8 cursor-pointer rounded-md border px-2 text-xs font-semibold transition-colors',
                  pactOfTome.canAddCantrip || pactOfTome.canAddRitual
                    ? needsChoiceHighlight(saveAttempted)
                    : 'border-border bg-secondary/60 text-foreground hover:border-primary hover:bg-secondary/70'
                )}
              >
                Manage Book of Shadows
              </button>
            </div>
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

        <SpellPickerDialog
          level={modalLevel}
          availableSpells={modalAvailable}
          spellsLoading={catalog.spellsLoading}
          canAdd={modalCanAdd}
          onSelect={handleSelectFromPicker}
          onClose={() => setPickerLevel(null)}
        />

        <WizardSpellbookDialog
          open={spellbookPickerOpen}
          onClose={() => setSpellbookPickerOpen(false)}
          spellsLoading={catalog.spellsLoading}
          availableWizardLevels={availableWizardLevels}
          spellsBySpellLevel={spellsBySpellLevel}
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
