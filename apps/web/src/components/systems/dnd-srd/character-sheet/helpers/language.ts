import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { MAX_STANDARD_LANGUAGES_TOTAL } from '../constants';

/** Canonical "Common" row from seeded standard languages (sourceKey or name). */
export function getCommonLanguageItem(options: RuleItemResponse[]): RuleItemResponse | null {
  return (
    options.find((o) => o.sourceKey === 'manual-lang-common') ??
    options.find((o) => o.name.trim().toLowerCase() === 'common') ??
    null
  );
}

/** Ensures Common is first when present; dedupes; max MAX_STANDARD_LANGUAGES_TOTAL. */
export function normalizeStandardLanguageNames(
  names: string[] | undefined,
  options: RuleItemResponse[]
): string[] {
  if (!options.length) return [...(names ?? [])].slice(0, MAX_STANDARD_LANGUAGES_TOTAL);
  const commonItem = getCommonLanguageItem(options);
  const commonName = commonItem?.name.trim() ?? 'Common';
  const validByLower = new Map<string, string>();
  for (const o of options) {
    const n = o.name.trim();
    validByLower.set(n.toLowerCase(), n);
  }
  const hasCommon = validByLower.has(commonName.toLowerCase());
  const key = (s: string) => s.trim().toLowerCase();

  if (!hasCommon) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of names ?? []) {
      const c = validByLower.get(key(raw));
      if (!c || seen.has(key(c))) continue;
      seen.add(key(c));
      out.push(c);
      if (out.length >= MAX_STANDARD_LANGUAGES_TOTAL) break;
    }
    return out;
  }

  const out: string[] = [validByLower.get(commonName.toLowerCase())!];
  const seen = new Set<string>([key(commonName)]);
  for (const raw of names ?? []) {
    const c = validByLower.get(key(raw));
    if (!c || seen.has(key(c))) continue;
    if (key(c) === key(commonName)) continue;
    seen.add(key(c));
    out.push(c);
    if (out.length >= MAX_STANDARD_LANGUAGES_TOTAL) break;
  }
  return out;
}

export type LanguageSource = 'standard' | 'deftExplorer' | 'thievesCant';

/**
 * Languages the character already knows from every source EXCEPT `except`, normalized to lowercase.
 * Each language picker passes its own source so it can disable languages already learned elsewhere,
 * keeping the pools mutually exclusive (no duplicate language across standard / Deft Explorer /
 * Thieves' Cant). Single source of truth for "is this language already taken by another source".
 */
export function getKnownLanguageNamesExcept(
  data: CharacterFormData,
  except: LanguageSource,
  options: RuleItemResponse[]
): Set<string> {
  const set = new Set<string>();
  const add = (n: string | null | undefined) => {
    const t = (n ?? '').trim().toLowerCase();
    if (t) set.add(t);
  };
  if (except !== 'standard') {
    for (const n of normalizeStandardLanguageNames(data.standardLanguageNames, options)) add(n);
  }
  if (except !== 'deftExplorer') {
    for (const n of data.deftExplorerLanguageNames ?? []) add(n);
  }
  if (except !== 'thievesCant') add(data.thievesCantExtraLanguageName);
  return set;
}

export function toggleStandardLanguageSelection(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  options: RuleItemResponse[],
  item: RuleItemResponse
): void {
  const name = item.name.trim();
  const commonItem = getCommonLanguageItem(options);
  const commonName = commonItem?.name.trim() ?? 'Common';
  if (name.toLowerCase() === commonName.toLowerCase()) return;

  let current = [...(data.standardLanguageNames ?? [])];
  const k = (s: string) => s.trim().toLowerCase();
  const has = current.some((n) => k(n) === k(name));
  if (has) {
    current = current.filter((n) => k(n) !== k(name));
  } else if (current.length < MAX_STANDARD_LANGUAGES_TOTAL) {
    current.push(name);
  }
  const next = normalizeStandardLanguageNames(current, options);
  onChange({ ...data, standardLanguageNames: next });
}
