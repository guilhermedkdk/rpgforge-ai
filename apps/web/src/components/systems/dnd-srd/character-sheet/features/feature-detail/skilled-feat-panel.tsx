'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  computeActiveSkilledSources,
  reconcileSkilledChoices,
  SKILLED_PICKS_PER_SOURCE,
} from '@/lib/dnd-srd/derived-character-stats';
import { skilledToolChoiceKey, stripToolItemPriceSuffix } from '../../helpers';
import { SelectionSection } from './feature-detail-primitives';
import { SkillChoiceFromListBlock } from './skill-choice-from-list-block';

const SKILL_PREFIX = 'skill:';

interface SkilledFeatPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
}

/**
 * Skilled feat selection, paginated by granting source (Background / each ASI / Lessons of the
 * First Ones …) — same UX as the Magic Initiate panel. Each source holds its own 3 picks under its
 * key in `skilledChoicesBySource`, so removing one source clears exactly that source's picks.
 */
export function SkilledFeatPanel({
  data,
  onChange,
  featsList,
  skillsList,
  toolItemsByCategory,
}: SkilledFeatPanelProps) {
  const sources = React.useMemo(
    () =>
      computeActiveSkilledSources(
        data.featureDetails ?? [],
        data.abilityScoreImprovementByGain,
        featsList,
        data.versatileFeatId,
        data.eldritchInvocationSelections,
      ),
    [
      data.featureDetails,
      data.abilityScoreImprovementByGain,
      featsList,
      data.versatileFeatId,
      data.eldritchInvocationSelections,
    ],
  );

  const [pageIndex, setPageIndex] = React.useState(0);
  const safeCount = Math.max(1, sources.length);
  React.useEffect(() => {
    if (pageIndex >= safeCount) setPageIndex(Math.max(0, safeCount - 1));
  }, [safeCount, pageIndex]);
  const slotIndex = Math.min(pageIndex, safeCount - 1);
  const showPager = safeCount > 1;
  const currentKey = sources[slotIndex]?.key ?? '';

  const skilledEntries = React.useMemo(() => {
    const skillEntries = skillsList
      .map((s) => ({ key: `${SKILL_PREFIX}${s.key}`, label: s.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const allToolItems = Object.values(toolItemsByCategory ?? {}).flat();
    const seen = new Set<string>();
    const toolEntries: Array<{ key: string; label: string }> = [];
    for (const item of allToolItems) {
      const label = stripToolItemPriceSuffix(item.name).trim();
      if (!label) continue;
      const key = skilledToolChoiceKey(label);
      if (seen.has(key)) continue;
      seen.add(key);
      toolEntries.push({ key, label });
    }
    toolEntries.sort((a, b) => a.label.localeCompare(b.label));
    return [...skillEntries, ...toolEntries];
  }, [skillsList, toolItemsByCategory]);

  if (sources.length === 0) return null;

  const bySource = data.skilledChoicesBySource ?? {};
  const currentPicks = (bySource[currentKey] ?? []).filter((id) =>
    skilledEntries.some((e) => e.key === id),
  );

  const otherSourcePicks = new Set<string>();
  for (const [key, picks] of Object.entries(bySource)) {
    if (key === currentKey) continue;
    for (const id of picks) otherSourcePicks.add(id);
  }

  const proficientMap = data.skillProficiencies ?? {};
  const chosenToolLabelKeys = new Set(
    Object.values(data.toolProficiencyChoices ?? {})
      .flat()
      .map((name) => name.trim().toLowerCase()),
  );

  // Locked here = taken by another Skilled source, or already proficient from a non-Skilled source.
  const lockedIds = skilledEntries
    .filter(({ key, label }) => {
      if (currentPicks.includes(key)) return false;
      if (otherSourcePicks.has(key)) return true;
      if (key.startsWith(SKILL_PREFIX)) return proficientMap[key.slice(SKILL_PREFIX.length)] === true;
      if (key.startsWith('tool:')) return chosenToolLabelKeys.has(label.toLowerCase());
      return false;
    })
    .map(({ key }) => key);

  const handleChangeIds = (ids: string[]) => {
    const capped = ids.slice(0, SKILLED_PICKS_PER_SOURCE);
    const nextBySource: Record<string, string[]> = { ...bySource };
    if (capped.length > 0) nextBySource[currentKey] = capped;
    else delete nextBySource[currentKey];

    // Single reconciliation path (flatten + skill-proficiency sync) shared with the derivation.
    const withSource = { ...data, skilledChoicesBySource: nextBySource };
    onChange({ ...withSource, ...reconcileSkilledChoices(withSource, featsList) });
  };

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {showPager && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
          <button
            type="button"
            aria-label="Previous Skilled source"
            disabled={slotIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex <= 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="text-xs font-semibold text-foreground">
            {sources[slotIndex]?.label ?? `Skilled ${slotIndex + 1} of ${safeCount}`}
          </p>
          <button
            type="button"
            aria-label="Next Skilled source"
            disabled={slotIndex >= safeCount - 1}
            onClick={() => setPageIndex((i) => Math.min(safeCount - 1, i + 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex >= safeCount - 1
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <SkillChoiceFromListBlock
        selectionMode="multi"
        bare
        entries={skilledEntries}
        selectedIds={currentPicks}
        lockedIds={lockedIds}
        maxSelections={SKILLED_PICKS_PER_SOURCE}
        onChangeIds={handleChangeIds}
      />
    </SelectionSection>
  );
}
