'use client';

import * as React from 'react';
import {
  AccordionRowCheckBadge,
  accordionRowHeaderClass,
  accordionSelectButtonClass,
} from '../shared/spell-accordion-row';
import { ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import {
  buildEffectiveAttributeScores,
  buildOwnedFeatIdsSet,
  eldritchInvocationPrerequisiteAllowsSelect,
  evaluateFeatPrerequisite,
  getEldritchInvocationsKnown,
  getFeatMeta,
  invocationRequiresCantrip,
  invocationRequiresOriginFeat,
  isOriginFeat,
  isRepeatableInvocation,
  pruneEldritchInvocationSelections,
  reconcileMagicInitiateChoices,
  reconcileSkilledChoices,
  REPEATABLE_FEAT_NAMES,
  spellsForClass,
  type CharacterFormData,
  type EldritchInvocationSelection,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { useAllSpells } from '../../../sections/spellcasting/hooks/use-all-spells';
import { type FeatureDetail, markdownOptionBodyClass } from '../shared/types';
import { FeatOptionRowBody, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';

interface EldritchInvocationsPanelProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
  featsList: RuleItemResponse[];
}

type InvocationOption = NonNullable<FeatureDetail['options']>[number];

const spellDealsDamage = (s: RuleItemResponse): boolean => {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  if (typeof n.damageRoll === 'string' && n.damageRoll.trim()) return true;
  return Array.isArray(n.damageTypes) && n.damageTypes.length > 0;
};

export function EldritchInvocationsPanel({
  feat,
  data,
  onChange,
  classes,
  featsList,
}: EldritchInvocationsPanelProps) {
  const options = feat.options ?? [];
  const originFeats = React.useMemo(
    () => featsList.filter(isOriginFeat).sort((a, b) => a.name.localeCompare(b.name)),
    [featsList]
  );
  const maxKnown =
    getEldritchInvocationsKnown(feat, data.level) || Math.max(0, feat.gainCount ?? 0);

  const selections = React.useMemo<EldritchInvocationSelection[]>(
    () => data.eldritchInvocationSelections ?? [],
    [data.eldritchInvocationSelections]
  );

  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const toggleExpand = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Eligible cantrips for Agonizing Blast / Eldritch Spear: the character's known Warlock cantrips
  // that deal damage (the class cantrip list, sliced from the catalog, says which deal damage).
  const classItem = classes.find((c) => c.id === data.classRuleItemId) ?? null;
  const { allSpells } = useAllSpells(classItem?.packId ?? null);
  const damagingCantripNames = React.useMemo(() => {
    if (!classItem) return new Set<string>();
    const cantrips = spellsForClass(allSpells, classItem.name).filter(
      (s) => Number((s.normalized as Record<string, unknown> | undefined)?.level ?? 0) === 0
    );
    return new Set(cantrips.filter(spellDealsDamage).map((s) => s.name.trim().toLowerCase()));
  }, [allSpells, classItem]);

  const eligibleCantrips = React.useMemo(() => {
    const known = data.spellsByLevel?.[0] ?? [];
    const names = known
      .map((s) => s.name.trim())
      .filter((name) => damagingCantripNames.has(name.toLowerCase()));
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [data.spellsByLevel, damagingCantripNames]);

  if (options.length === 0 || maxKnown === 0) return null;

  const total = selections.length;
  const canSelectMore = total < maxKnown;
  const featureNamesLower = (data.featureDetails ?? []).map((f) => f.name.trim().toLowerCase());
  const allInvocationOptions = options.map((o) => ({ key: o.key, label: o.label }));
  // Origin feat gating (Lessons of the First Ones), identical to the ASI feat picker.
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);

  // Removing an invocation (or a level/feature change) can orphan ones that required it; the
  // shared prune re-checks every selection transitively and drops the ones no longer allowed.
  // Deselecting a Lessons-of-the-First-Ones feat also removes a Magic Initiate / Skilled source,
  // so reconcile both stores (resets the removed source's choices).
  const commit = (next: EldritchInvocationSelection[]) => {
    const nextData = {
      ...data,
      eldritchInvocationSelections: pruneEldritchInvocationSelections(next, options, {
        characterLevel: data.level,
        featureNamesLower,
      }),
    };
    onChange({
      ...nextData,
      ...reconcileMagicInitiateChoices(nextData, featsList),
      ...reconcileSkilledChoices(nextData, featsList),
    });
  };

  const prereqOkFor = (option: InvocationOption) =>
    eldritchInvocationPrerequisiteAllowsSelect(option.prerequisite, {
      characterLevel: data.level,
      featureNamesLower,
      selectedInvocationKeys: selections.map((s) => s.key),
      allInvocationOptions,
      currentOptionKey: option.key,
    });

  // Simple (non-cantrip) invocation: one instance, toggled on/off.
  const toggleSimple = (key: string) => {
    const idx = selections.findIndex((s) => s.key === key);
    if (idx >= 0) {
      commit(selections.filter((_, i) => i !== idx));
      return;
    }
    if (!canSelectMore) return;
    commit([...selections, { key, spellName: null }]);
  };

  // Cantrip invocation: each chosen cantrip is one instance. Repeatable → many cantrips;
  // non-repeatable → picking another cantrip swaps the single instance.
  const toggleCantrip = (key: string, cantrip: string, repeatable: boolean) => {
    const idx = selections.findIndex((s) => s.key === key && s.spellName === cantrip);
    if (idx >= 0) {
      commit(selections.filter((_, i) => i !== idx));
      return;
    }
    if (!repeatable) {
      const others = selections.filter((s) => s.key !== key);
      if (others.length >= maxKnown) return;
      commit([...others, { key, spellName: cantrip }]);
      return;
    }
    if (!canSelectMore) return;
    commit([...selections, { key, spellName: cantrip }]);
  };

  // Origin-feat invocation (Lessons of the First Ones): each chosen feat is one instance.
  const toggleOriginFeat = (key: string, featId: string, repeatable: boolean) => {
    const idx = selections.findIndex((s) => s.key === key && s.featId === featId);
    if (idx >= 0) {
      commit(selections.filter((_, i) => i !== idx));
      return;
    }
    if (!repeatable) {
      const others = selections.filter((s) => s.key !== key);
      if (others.length >= maxKnown) return;
      commit([...others, { key, featId }]);
      return;
    }
    if (!canSelectMore) return;
    commit([...selections, { key, featId }]);
  };

  const query = search.trim().toLowerCase();
  const visibleOptions = query
    ? options.filter(
        (o) => o.label.toLowerCase().includes(query) || (o.desc ?? '').toLowerCase().includes(query)
      )
    : options;

  return (
    <SelectionSection>
      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invocations..."
          className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
        />
      </div>
      {visibleOptions.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No invocations found.</div>
      ) : (
        <div className="divide-y divide-border/30 overflow-hidden rounded-lg border border-border/60">
          {visibleOptions.map((option) => {
            const requiresCantrip = invocationRequiresCantrip(option.desc);
            const requiresOriginFeat = invocationRequiresOriginFeat(option.desc);
            const repeatable = isRepeatableInvocation(option.desc);
            const prereqOk = prereqOkFor(option);
            const keyHasAny = selections.some((s) => s.key === option.key);
            const isSelected = keyHasAny;
            const isExpanded = expandedKeys.has(option.key);
            const prereq = option.prerequisite?.trim() || null;
            const cost = option.cost?.trim() || null;
            const bodyLines = option.desc?.trim() || '';

            return (
              <div key={option.key}>
                <button
                  type="button"
                  onClick={() => toggleExpand(option.key)}
                  className={accordionRowHeaderClass(isSelected)}
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm font-medium',
                      isSelected ? 'text-primary-ink' : 'text-foreground'
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="ml-2 flex shrink-0 items-center gap-1.5">
                    {isSelected ? <AccordionRowCheckBadge /> : null}
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="space-y-2.5 bg-muted/10 px-4 pb-3 pt-1">
                    {prereq ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Prerequisite:</span> {prereq}
                      </p>
                    ) : null}
                    {cost ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Cost:</span> {cost}
                      </p>
                    ) : null}
                    {bodyLines ? (
                      <div className={markdownOptionBodyClass}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyLines}</ReactMarkdown>
                      </div>
                    ) : null}

                    {requiresCantrip ? (
                      <div className="space-y-1.5">
                        {eligibleCantrips.map((cantrip) => {
                          const selected = selections.some(
                            (s) => s.key === option.key && s.spellName === cantrip
                          );
                          const blockedByCount = repeatable
                            ? !canSelectMore
                            : !keyHasAny && !canSelectMore;
                          const disabled = !selected && (!prereqOk || blockedByCount);
                          return (
                            <FeatureOptionRow
                              key={cantrip}
                              selected={selected}
                              disabled={disabled}
                              onClick={() => toggleCantrip(option.key, cantrip, repeatable)}
                            >
                              {cantrip}
                            </FeatureOptionRow>
                          );
                        })}
                      </div>
                    ) : requiresOriginFeat ? (
                      <div className="space-y-1.5">
                        {originFeats.map((originFeat) => {
                          const { prerequisite } = getFeatMeta(originFeat);
                          const isSelectedHere = selections.some(
                            (s) => s.key === option.key && s.featId === originFeat.id
                          );
                          const isRepeatableFeat = REPEATABLE_FEAT_NAMES.has(
                            originFeat.name.trim().toLowerCase()
                          );
                          // Non-repeatable feats already on the sheet (any source) can't be retaken.
                          const isAlreadyOwned =
                            !isRepeatableFeat &&
                            ownedFeatIdsSet.has(originFeat.id) &&
                            !isSelectedHere;
                          const isMissingPrereq =
                            evaluateFeatPrerequisite(prerequisite, data, effectiveAttributeScores)
                              .length > 0;
                          const blockedByCount = repeatable
                            ? !canSelectMore
                            : !keyHasAny && !canSelectMore;
                          const selected = isSelectedHere || isAlreadyOwned;
                          const disabled =
                            !isSelectedHere &&
                            (isAlreadyOwned || isMissingPrereq || !prereqOk || blockedByCount);
                          return (
                            <FeatureOptionRow
                              key={originFeat.id}
                              selected={selected}
                              disabled={disabled}
                              alignTop
                              mark="check"
                              onClick={() =>
                                toggleOriginFeat(option.key, originFeat.id, repeatable)
                              }
                            >
                              <FeatOptionRowBody feat={originFeat} />
                            </FeatureOptionRow>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleSimple(option.key)}
                        disabled={!isSelected && (!prereqOk || !canSelectMore)}
                        className={accordionSelectButtonClass(
                          isSelected,
                          !prereqOk || !canSelectMore
                        )}
                      >
                        {isSelected ? 'Clear selection' : 'Select invocation'}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
