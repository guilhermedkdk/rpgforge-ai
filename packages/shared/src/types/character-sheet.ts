import type { PackResponse } from './pack';
import type { RuleItemResponse } from './ruleitem';

export interface CharacterSheetSummary {
  id: string;
  packId: string;
  name: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
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
