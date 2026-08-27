import type { PackResponse } from './pack';
import type { RuleItemResponse } from './ruleitem';

/**
 * Small character digest extracted from the persisted `data`, so a sheets list can show
 * class/level/combat without loading every sheet. Each field is null when the sheet doesn't have it.
 */
export interface CharacterSheetPreview {
  /** TOTAL character level (sum of the class levels). */
  level: number | null;
  /** The INITIAL class; `classes` carries the full list for a multiclass character. */
  className: string | null;
  /** CLASS rule-item slug of the initial class: the stable key for per-class art. */
  classSlug: string | null;
  subclassName: string | null;
  /** One entry per class, in class order. Absent/single-entry for a single-class sheet. */
  classes: Array<{
    name: string | null;
    slug: string | null;
    subclassName: string | null;
    level: number;
  }>;
  raceName: string | null;
  /** RACE rule-item slug: the stable key for per-species art. */
  raceSlug: string | null;
  backgroundName: string | null;
  maxHp: number | null;
  armorClass: string | null;
}

export interface CharacterSheetSummary {
  id: string;
  packId: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Only sent by the list endpoint. */
  preview?: CharacterSheetPreview;
}

export interface CharacterSheetResponse extends CharacterSheetSummary {
  userId: string;
  data: Record<string, unknown>;
}

export interface CharacterSheetWithRulesResponse {
  sheet: CharacterSheetResponse;
  pack: PackResponse;
  ruleItems: Record<string, RuleItemResponse>;
  abilities: RuleItemResponse[];
  languages: RuleItemResponse[];
  /** Tool items grouped by category tag (artisan, musical-instrument, gaming-set). */
  toolItems: RuleItemResponse[];
}
