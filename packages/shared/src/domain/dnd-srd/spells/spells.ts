/** Pure spell / rule-item readers + spell-list helpers (level, ritual, damage, range, merge, slots). */
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

export type SheetSpellRow = CharacterFormData['spellsByLevel'][number][number];

/** Tag a spell carries for each class that can cast it (set on ingestion from `raw.classes`). */
export const spellClassTag = (className: string): string =>
  `spell:class:${className.trim().toLowerCase().replace(/\s+/g, '-')}`;

/** Spells castable by `className`, sliced from a full catalog by class tag. */
export const spellsForClass = (
  spells: RuleItemResponse[],
  className: string
): RuleItemResponse[] => spells.filter((s) => s.tagKeys.includes(spellClassTag(className)));

/**
 * How many distinct spells are still selectable for a "pick N" requirement: spells carrying any of
 * `tagKeys`, with level in [minLevel, maxLevel], minus `excludeNamesLower` (spells already on the
 * sheet from another source). Used to cap requirements at what actually exists so a pool smaller
 * than the max can never make a sheet impossible to complete/save.
 */
export function countAvailableSpells(
  allSpells: RuleItemResponse[],
  tagKeys: string[],
  minLevel: number,
  maxLevel: number,
  excludeNamesLower?: ReadonlySet<string>
): number {
  const tags = new Set(tagKeys);
  let count = 0;
  for (const s of allSpells) {
    if (!s.tagKeys.some((t) => tags.has(t))) continue;
    const lvl = ruleItemSpellLevel(s);
    if (lvl < minLevel || lvl > maxLevel) continue;
    if (excludeNamesLower?.has(s.name.trim().toLowerCase())) continue;
    count++;
  }
  return count;
}

const ABILITY_ABBR: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

export function abilityAbbr(ability: string): string {
  return ABILITY_ABBR[ability.toLowerCase()] ?? ability.substring(0, 3).toUpperCase();
}

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

  const grantKeys = new Set(placements.map((p) => `${p.spellLevel}:${p.name.trim().toLowerCase()}`));

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
