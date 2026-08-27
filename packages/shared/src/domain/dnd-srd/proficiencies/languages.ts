/**
 * Standard-language helpers shared by the web editor and the backend save-time validation
 * (Common always first, dedupe, cap at MAX_STANDARD_LANGUAGES_TOTAL).
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';

/** Player picks Common (always) + up to 2 other standard languages. */
export const MAX_STANDARD_LANGUAGES_TOTAL = 3;

/** Tag on a language rule item marking it STANDARD (vs rare). DB-query filter for the catalog. */
export const STANDARD_LANGUAGE_TAG = 'language:rarity:standard';

/** Canonical "Common" row from the standard languages catalog. */
export function getCommonLanguageItem(options: RuleItemResponse[]): RuleItemResponse | null {
  return options.find((o) => o.name.trim().toLowerCase() === 'common') ?? null;
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

/**
 * Whether the standard-language picks are all placed. Single source for the save-time validation and
 * the play-mode lock; the target is capped at what the pack offers, so a small catalog can never read
 * as incomplete. With no catalog loaded, treats it as complete (the check only ever loosens).
 */
export function areStandardLanguagesComplete(
  data: CharacterFormData,
  options: RuleItemResponse[]
): boolean {
  if (options.length === 0) return true;
  const required = Math.min(MAX_STANDARD_LANGUAGES_TOTAL, options.length);
  return normalizeStandardLanguageNames(data.standardLanguageNames, options).length >= required;
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
