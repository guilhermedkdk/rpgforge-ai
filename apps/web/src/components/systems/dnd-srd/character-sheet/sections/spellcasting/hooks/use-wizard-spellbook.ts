'use client';

import * as React from 'react';
import { wizardSpellbookMaxByLevel, type CharacterFormData } from '@rpgforce-ai/shared';

const normalizeNamesByLevel = (
  src: Record<number, string[]> | undefined,
): Record<number, string[]> => {
  const out: Record<number, string[]> = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    const raw = src?.[lvl] ?? [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const name of raw) {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(trimmed);
    }
    if (list.length > 0) out[lvl] = list;
  }
  return out;
};

interface UseWizardSpellbookArgs {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  /** Level in the WIZARD class: capacity is a class-table value, never the character level. */
  wizardLevel: number;
}

/** Wizard spellbook state: learned-by-level and added-by-scroll spell names per level. */
export function useWizardSpellbook({ data, onChange, wizardLevel }: UseWizardSpellbookArgs) {
  const max = React.useMemo(() => wizardSpellbookMaxByLevel(wizardLevel), [wizardLevel]);

  const byLevel = React.useMemo(
    () => normalizeNamesByLevel(data.wizardSpellbookByLevel),
    [data.wizardSpellbookByLevel]
  );

  const byScrollByLevel = React.useMemo(
    () => normalizeNamesByLevel(data.wizardSpellbookByScrollByLevel),
    [data.wizardSpellbookByScrollByLevel]
  );

  /** Free from Evocation Savant: they enter the spellbook, but don't count toward per-level capacity. */
  const bySavantByLevel = React.useMemo(
    () => normalizeNamesByLevel(data.evocationSavantSpellbookByLevel),
    [data.evocationSavantSpellbookByLevel]
  );

  const count = React.useMemo(() => {
    let total = 0;
    for (let lvl = 1; lvl <= 9; lvl++) total += byLevel[lvl]?.length ?? 0;
    return total;
  }, [byLevel]);

  const allNameSetByLevel = React.useMemo(() => {
    const out: Record<number, Set<string>> = {};
    for (let lvl = 1; lvl <= 9; lvl++) {
      const set = new Set<string>((byLevel[lvl] ?? []).map((n) => n.toLowerCase()));
      for (const n of [...(byScrollByLevel[lvl] ?? []), ...(bySavantByLevel[lvl] ?? [])]) {
        set.add(n.toLowerCase());
      }
      out[lvl] = set;
    }
    return out;
  }, [byLevel, byScrollByLevel, bySavantByLevel]);

  const canAddMore = count < max;

  const addByLevel = React.useCallback(
    (level: number, spellName: string) => {
      const trimmed = spellName.trim();
      if (!trimmed || level < 1 || level > 9) return;
      const current = data.wizardSpellbookByLevel ?? {};
      const currentLevel = current[level] ?? [];
      if (currentLevel.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())) return;
      if (count >= max) return;
      onChange({
        ...data,
        wizardSpellbookByLevel: {
          ...current,
          [level]: [...currentLevel, trimmed],
        },
      });
    },
    [data, onChange, count, max]
  );

  const removeByLevel = React.useCallback(
    (level: number, spellName: string) => {
      const trimmed = spellName.trim();
      if (!trimmed || level < 1 || level > 9) return;
      const current = data.wizardSpellbookByLevel ?? {};
      const currentLevel = current[level] ?? [];
      const nextLevel = currentLevel.filter(
        (n) => n.trim().toLowerCase() !== trimmed.toLowerCase()
      );
      onChange({
        ...data,
        wizardSpellbookByLevel: {
          ...current,
          [level]: nextLevel,
        },
      });
    },
    [data, onChange]
  );

  const addByScroll = React.useCallback(
    (level: number, spellName: string) => {
      const trimmed = spellName.trim();
      if (!trimmed || level < 1 || level > 9) return;
      const currentScroll = data.wizardSpellbookByScrollByLevel ?? {};
      const currentScrollLevel = currentScroll[level] ?? [];
      const existsInScroll = currentScrollLevel.some(
        (n) => n.trim().toLowerCase() === trimmed.toLowerCase()
      );
      const existsInLearned = (data.wizardSpellbookByLevel?.[level] ?? []).some(
        (n) => n.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (existsInScroll || existsInLearned) return;
      onChange({
        ...data,
        wizardSpellbookByScrollByLevel: {
          ...currentScroll,
          [level]: [...currentScrollLevel, trimmed],
        },
      });
    },
    [data, onChange]
  );

  const removeByScroll = React.useCallback(
    (level: number, spellName: string) => {
      const trimmed = spellName.trim();
      if (!trimmed || level < 1 || level > 9) return;
      const currentScroll = data.wizardSpellbookByScrollByLevel ?? {};
      const currentScrollLevel = currentScroll[level] ?? [];
      const nextLevel = currentScrollLevel.filter(
        (n) => n.trim().toLowerCase() !== trimmed.toLowerCase()
      );
      onChange({
        ...data,
        wizardSpellbookByScrollByLevel: {
          ...currentScroll,
          [level]: nextLevel,
        },
      });
    },
    [data, onChange]
  );

  /** Spell names already in the book, merged per level (level learn vs scroll vs Evocation Savant). */
  const listingLevels = React.useMemo(() => {
    type Entry = { name: string; byLevel: boolean; byScroll: boolean; bySavant: boolean };
    const blocks: Array<{ level: number; entries: Entry[] }> = [];
    for (let lvl = 1; lvl <= 9; lvl++) {
      const merge = new Map<string, Entry>();
      const mark = (names: string[], flag: 'byLevel' | 'byScroll' | 'bySavant') => {
        for (const n of names) {
          const k = n.trim().toLowerCase();
          if (!k) continue;
          const ex = merge.get(k);
          if (ex) ex[flag] = true;
          else {
            merge.set(k, {
              name: n.trim(),
              byLevel: false,
              byScroll: false,
              bySavant: false,
              [flag]: true,
            });
          }
        }
      };
      mark(byLevel[lvl] ?? [], 'byLevel');
      mark(byScrollByLevel[lvl] ?? [], 'byScroll');
      mark(bySavantByLevel[lvl] ?? [], 'bySavant');
      if (merge.size === 0) continue;
      const entries = Array.from(merge.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
      blocks.push({ level: lvl, entries });
    }
    return blocks;
  }, [byLevel, byScrollByLevel, bySavantByLevel]);

  return {
    max,
    count,
    canAddMore,
    byLevel,
    byScrollByLevel,
    bySavantByLevel,
    allNameSetByLevel,
    listingLevels,
    addByLevel,
    removeByLevel,
    addByScroll,
    removeByScroll,
  };
}
