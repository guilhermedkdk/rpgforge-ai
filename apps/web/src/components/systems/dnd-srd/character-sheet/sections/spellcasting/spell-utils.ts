import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import type { RuleItemResponse } from '@rpgforce-ai/shared';

export type FeatureDetail = NonNullable<CharacterFormData['featureDetails']>[number];
export type SheetSpellRow = CharacterFormData['spellsByLevel'][number][number];

const ABILITY_ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export function abilityAbbr(ability: string): string {
  return ABILITY_ABBR[ability.toLowerCase()] ?? ability.substring(0, 3).toUpperCase();
}

export const DEFAULT_ROWS_BY_LEVEL: Record<number, number> = {
  0: 8,
  1: 12,
  2: 13,
  3: 13,
  4: 13,
  5: 9,
  6: 9,
  7: 9,
  8: 7,
  9: 7,
};

// Caps a level block's spell list to the height of its default scaffold so it scrolls
// internally instead of growing when more spells than DEFAULT_ROWS_BY_LEVEL are added.
// Each row is h-7 (1.75rem) with gap-1.5 (0.375rem): height = rows*1.75 + (rows-1)*0.375rem.
// Keyed by the distinct DEFAULT_ROWS_BY_LEVEL values (literal classes so Tailwind emits them).
export const SPELL_LIST_MAX_H_CLASS: Record<number, string> = {
  7: 'max-h-[14.5rem]',
  8: 'max-h-[16.625rem]',
  9: 'max-h-[18.75rem]',
  12: 'max-h-[25.125rem]',
  13: 'max-h-[27.25rem]',
};

/** Match rule item slug convention (e.g. Fire Bolt → fire-bolt). */
export function spellNameToKebabSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isSlotAvailable(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed === '0') return false;
  return true;
}

/** Slots expended when the character has slots at this level: default 0, clamped to [0, maxTotal]. */
export function clampSpellSlotsExpended(raw: unknown, maxTotal: number): number {
  const max = Math.max(0, Math.floor(Number(maxTotal) || 0));
  if (max <= 0) return 0;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export const spellChipClass =
  'inline-flex items-center rounded border border-border/60 bg-muted/30 px-2 py-px text-[10px] font-medium text-muted-foreground';

export const spellDetailMarkdownClass =
  'text-xs leading-relaxed text-muted-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground';

export function stableSpellsByLevelKey(sb: CharacterFormData['spellsByLevel'] | undefined): string {
  if (!sb) return '';
  const keys = Object.keys(sb)
    .map((k) => Number(k))
    .filter((k) => !Number.isNaN(k) && k >= 0 && k <= 9)
    .sort((a, b) => a - b);
  return keys
    .map((lvl) => {
      const arr = sb[lvl] ?? [];
      return `${lvl}:[${arr
        .map((s) => `${s.name}\t${s.granted ? 1 : 0}\t${s.grantSource ?? ''}`)
        .join('|')}]`;
    })
    .join(';');
}

export type GrantedSpellPlacement = {
  name: string;
  spellLevel: number;
  /** Where the spell was granted from — shown in the spell row tooltip. */
  grantSource?: string;
};

/** Strip auto-granted rows, re-apply from placements, keep player-picked spells. */
export function mergeGrantedSpellPlacements(
  base: CharacterFormData['spellsByLevel'] | undefined,
  placements: GrantedSpellPlacement[]
): CharacterFormData['spellsByLevel'] {
  const baseSafe = { ...(base ?? {}) };
  const userByLevel: Record<number, SheetSpellRow[]> = {};
  for (let lvl = 0; lvl <= 9; lvl++) {
    userByLevel[lvl] = (baseSafe[lvl] ?? []).filter((s) => !s.granted);
  }

  const grantKeys = new Set(
    placements.map((p) => `${p.spellLevel}:${p.name.trim().toLowerCase()}`)
  );

  for (let lvl = 0; lvl <= 9; lvl++) {
    userByLevel[lvl] = userByLevel[lvl].filter((u) => {
      const k = `${lvl}:${u.name.trim().toLowerCase()}`;
      return !grantKeys.has(k);
    });
  }

  const autoByLevel = new Map<number, SheetSpellRow[]>();
  for (const p of placements) {
    if (p.spellLevel < 0 || p.spellLevel > 9) continue;
    const nm = p.name.trim();
    if (!nm) continue;
    const list = autoByLevel.get(p.spellLevel) ?? [];
    const low = nm.toLowerCase();
    if (!list.some((x) => x.name.toLowerCase() === low)) {
      list.push({
        name: p.name,
        granted: true,
        ...(p.grantSource ? { grantSource: p.grantSource } : {}),
      });
    }
    autoByLevel.set(p.spellLevel, list);
  }

  const out: CharacterFormData['spellsByLevel'] = { ...baseSafe };
  for (let lvl = 0; lvl <= 9; lvl++) {
    const autoList = autoByLevel.get(lvl) ?? [];
    const userList = userByLevel[lvl] ?? [];
    const combined = [...autoList, ...userList];
    if (combined.length === 0) {
      delete out[lvl];
    } else {
      out[lvl] = combined;
    }
  }
  return out;
}

export function ruleItemSpellLevel(s: RuleItemResponse): number {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  const lvl = Number(n.level ?? 0);
  return Number.isFinite(lvl) ? Math.max(0, Math.min(9, Math.floor(lvl))) : 0;
}

export function getSpellListLevelLabel(level: number) {
  return level === 0 ? 'Cantrips' : `Level ${level}`;
}

/** Whether a spell can be cast as a ritual (normalized.ritual === true). */
export function ruleItemIsRitual(s: RuleItemResponse): boolean {
  return Boolean((s.normalized as Record<string, unknown> | undefined)?.ritual);
}

/**
 * Whether a spell deals damage. Requires both a damage roll and at least one damage type —
 * `damageRoll` alone is ambiguous (e.g. Guidance/Resistance roll 1d4 with no damage type).
 */
export function ruleItemDealsDamage(s: RuleItemResponse): boolean {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  const damageRoll = typeof n.damageRoll === 'string' ? n.damageRoll.trim() : '';
  const damageTypes = Array.isArray(n.damageTypes) ? n.damageTypes : [];
  return damageRoll.length > 0 && damageTypes.length > 0;
}

/** A spell's range in feet, or null when it has no measured range (Self, Touch, Unlimited, …). */
export function ruleItemRangeFeet(s: RuleItemResponse): number | null {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  const text = typeof n.rangeText === 'string' ? n.rangeText : '';
  const m = /^\s*(\d+)\s*(?:feet|foot|ft)\b/i.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

/** Clamped spell level read from a rule item's normalized data, with a fallback. */
export function ruleItemSpellLevelOr(hit: RuleItemResponse | null, fallback: number): number {
  if (!hit) return fallback;
  const nrm = (hit.normalized ?? {}) as Record<string, unknown>;
  const rawLvl = Number(nrm.level);
  return Number.isFinite(rawLvl) ? Math.max(0, Math.min(9, Math.floor(rawLvl))) : fallback;
}
