import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';

export type { CharacterFormData };

export interface CharacterSheetProps {
  data: CharacterFormData;
  classes: RuleItemResponse[];
  backgrounds: RuleItemResponse[];
  races: RuleItemResponse[];
  abilities: RuleItemResponse[];
  weapons: RuleItemResponse[];
  armors: RuleItemResponse[];
  adventuringGear?: RuleItemResponse[];
  /** Available feats list (KIND = FEAT). */
  feats?: RuleItemResponse[];
  /** Tool items by category tag (item:category:gaming-set, item:category:musical-instrument) for proficiency choices. */
  toolItemsByCategory?: Record<string, RuleItemResponse[]>;
  /** Standard languages (OTHER + language:rarity:standard) for Languages picker. */
  standardLanguageOptions?: RuleItemResponse[];
  classesLoading: boolean;
  backgroundsLoading: boolean;
  racesLoading: boolean;
  abilitiesLoading: boolean;
  equipmentItemsLoading: boolean;
  onChange: (data: CharacterFormData) => void;
  /** View-only mode: blocks all input edits except current HP, temporary HP, and death saves */
  readOnly?: boolean;
  /** True after a blocked save attempt: required-but-empty fields flag themselves in red. */
  saveAttempted?: boolean;
}
