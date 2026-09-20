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
  /** Sheets are private until the owner publishes them. */
  isPublic: boolean;
  /** Only sent by the list endpoint. */
  preview?: CharacterSheetPreview;
}

/** Who a published sheet belongs to. Never carries the e-mail: a profile is public, an e-mail is not. */
export interface SheetOwner {
  username: string;
  displayName: string | null;
  /** The avatar CHOICE, resolved on the web through `parseAvatarChoice`. */
  avatarId: string | null;
  /** Already resolved server-side: a provider picture, or null for a gallery pick or initials. */
  avatarUrl: string | null;
}

/** How the explore feed is ordered. `popular` breaks ties by publication date. */
export type PublicSheetSort = 'recent' | 'popular';

export interface PublicSheetSummary extends CharacterSheetSummary {
  owner: SheetOwner;
  /** ISO date the sheet was published; the explore feed orders by it. */
  publishedAt: string;
  /** How many people bookmarked it. */
  favoriteCount: number;
  /** Whether the CURRENT viewer did; always false for a visitor with no session. */
  isFavorited: boolean;
}

export interface PublicSheetListResponse {
  items: PublicSheetSummary[];
  /** Matching rows in total, so the page can say how much is left. */
  total: number;
  /**
   * Published sheets per pack, counted BEFORE the pack filter is applied, so the system chips keep
   * their numbers while one of them is selected.
   */
  packCounts: Array<{ packId: string; count: number }>;
}

export interface CharacterSheetResponse extends CharacterSheetSummary {
  userId: string;
  data: Record<string, unknown>;
}

/** A published sheet read by anyone: the same payload the owner gets, plus who wrote it. */
export interface PublicSheetWithRulesResponse extends CharacterSheetWithRulesResponse {
  owner: SheetOwner;
  /** How many people bookmarked it. */
  favoriteCount: number;
  /** Whether the CURRENT viewer did; always false for a visitor with no session. */
  isFavorited: boolean;
}

export interface CharacterSheetWithRulesResponse {
  sheet: CharacterSheetResponse;
  pack: PackResponse;
  ruleItems: Record<string, RuleItemResponse>;
  abilities: RuleItemResponse[];
  languages: RuleItemResponse[];
  /** Tool items grouped by category tag (artisan, musical-instrument, gaming-set). */
  toolItems: RuleItemResponse[];
  /**
   * Owner-only: whether an AI generation log exists for this sheet, which is what decides if the
   * sheet offers its AI notes. The notes themselves are a separate request, so a sheet's load never
   * pays for them.
   */
  hasAiNotes?: boolean;
}
