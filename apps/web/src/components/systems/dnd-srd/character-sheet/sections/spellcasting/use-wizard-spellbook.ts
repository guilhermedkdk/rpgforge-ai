'use client';

import * as React from 'react';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { wizardSpellbookMaxByLevel } from '@/lib/dnd-srd/spellcasting-limits';

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
}

/** Wizard spellbook state: learned-by-level and added-by-scroll spell names per level. */
export function useWizardSpellbook({ data, onChange }: UseWizardSpellbookArgs) {
  const max = React.useMemo(() => wizardSpellbookMaxByLevel(data.level ?? 1), [data.level]);

  const byLevel = React.useMemo(
    () => normalizeNamesByLevel(data.wizardSpellbookByLevel),
    [data.wizardSpellbookByLevel]
  );

  const byScrollByLevel = React.useMemo(
    () => normalizeNamesByLevel(data.wizardSpellbookByScrollByLevel),
    [data.wizardSpellbookByScrollByLevel]
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
      for (const n of byScrollByLevel[lvl] ?? []) {
        set.add(n.toLowerCase());
      }
      out[lvl] = set;
    }
    return out;
  }, [byLevel, byScrollByLevel]);

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

  /** Spell names already in the book, merged per level (level learn vs scroll). */
  const listingLevels = React.useMemo(() => {
    const blocks: Array<{
      level: number;
      entries: Array<{ name: string; byLevel: boolean; byScroll: boolean }>;
    }> = [];
    for (let lvl = 1; lvl <= 9; lvl++) {
      const learned = byLevel[lvl] ?? [];
      const fromScroll = byScrollByLevel[lvl] ?? [];
      const merge = new Map<string, { name: string; byLevel: boolean; byScroll: boolean }>();
      for (const n of learned) {
        const k = n.trim().toLowerCase();
        if (!k) continue;
        const ex = merge.get(k);
        if (ex) ex.byLevel = true;
        else merge.set(k, { name: n.trim(), byLevel: true, byScroll: false });
      }
      for (const n of fromScroll) {
        const k = n.trim().toLowerCase();
        if (!k) continue;
        const ex = merge.get(k);
        if (ex) ex.byScroll = true;
        else merge.set(k, { name: n.trim(), byLevel: false, byScroll: true });
      }
      if (merge.size === 0) continue;
      const entries = Array.from(merge.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
      blocks.push({ level: lvl, entries });
    }
    return blocks;
  }, [byLevel, byScrollByLevel]);

  return {
    max,
    count,
    canAddMore,
    byLevel,
    byScrollByLevel,
    allNameSetByLevel,
    listingLevels,
    addByLevel,
    removeByLevel,
    addByScroll,
    removeByScroll,
  };
}
