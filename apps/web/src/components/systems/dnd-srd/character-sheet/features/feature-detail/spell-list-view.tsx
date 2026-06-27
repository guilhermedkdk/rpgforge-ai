'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { useAllSpells, spellsForClass } from '../../sections/spellcasting/use-all-spells';
import { SpellAccordionRow } from './spell-accordion-row';
import { markdownBodyClass } from './types';
import type { FeatureDetail } from './types';

interface SpellListViewProps {
  feat: FeatureDetail;
  classItem: RuleItemResponse | null;
}

export function SpellListView({ feat, classItem }: SpellListViewProps) {
  const [expandedSpellLevels, setExpandedSpellLevels] = React.useState<Set<number>>(
    new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  );
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());

  const { allSpells: spellCatalog, allSpellsLoading: spellsLoading } = useAllSpells(
    classItem?.packId ?? null,
  );
  const allSpells = React.useMemo(
    () => (classItem ? spellsForClass(spellCatalog, classItem.name) : []),
    [spellCatalog, classItem],
  );

  React.useEffect(() => {
    setExpandedSpellIds(new Set());
  }, [classItem?.id]);

  React.useEffect(() => {
    if (spellsLoading || !classItem || allSpells.length === 0) return;
    const levelSet = new Set<number>();
    for (const s of allSpells) {
      const n = (s.normalized ?? {}) as Record<string, unknown>;
      levelSet.add(Number(n.level ?? 0));
    }
    setExpandedSpellLevels(levelSet);
  }, [spellsLoading, classItem, allSpells.length]);

  const rawDesc = feat.desc ?? '';
  const spellListStartIdx = rawDesc.search(/\*\*(?:Cantrips \(Level 0\)|Level\s+\d+)\*\*/i);
  const introMd = (
    spellListStartIdx >= 0 ? rawDesc.slice(0, spellListStartIdx) : rawDesc
  ).trim();

  const getLevelLabel = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

  const levelGroups = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((level) => ({
      level,
      spells: allSpells
        .filter((s) => {
          const n = (s.normalized ?? {}) as Record<string, unknown>;
          return Number(n.level ?? 0) === level;
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.spells.length > 0);

  const toggleExpand = (id: string) =>
    setExpandedSpellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <DialogTitle className="pr-8">{feat.name}</DialogTitle>
      <DialogDescription asChild>
        <div className={markdownBodyClass}>
          {introMd ? (
            <div className="mb-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{ table: () => null }}
              >
                {introMd}
              </ReactMarkdown>
            </div>
          ) : null}

          {spellsLoading && (
            <LoadingState inline label="Loading spells…" className="justify-center py-10" />
          )}

          {!spellsLoading && levelGroups.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              No spells found for this class.
            </p>
          )}

          {!spellsLoading && levelGroups.length > 0 && (
            <div className="space-y-1.5">
              {levelGroups.map(({ level, spells: levelSpells }) => {
                const isLevelOpen = expandedSpellLevels.has(level);
                return (
                  <div key={level} className="overflow-hidden rounded-lg border border-border/60">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSpellLevels((prev) => {
                          const next = new Set(prev);
                          if (next.has(level)) next.delete(level);
                          else next.add(level);
                          return next;
                        })
                      }
                      className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-serif text-lg font-semibold leading-none text-foreground">
                        {getLevelLabel(level)}
                      </span>
                      {isLevelOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {isLevelOpen && (
                      <div className="divide-y divide-border/30">
                        {levelSpells.map((spell) => (
                          <SpellAccordionRow
                            key={spell.id}
                            spell={spell}
                            isExpanded={expandedSpellIds.has(spell.id)}
                            onToggleExpand={toggleExpand}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogDescription>
    </>
  );
}
