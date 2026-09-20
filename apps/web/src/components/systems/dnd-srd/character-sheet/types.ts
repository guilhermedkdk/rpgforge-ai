import type {
  AiDecision,
  AiSpellNote,
  RuleItemResponse,
  CharacterFormData,
} from '@rpgforce-ai/shared';

export type { CharacterFormData };

/**
 * Which flow the sheet is rendered in.
 * - 'creation': building a new character; every choice is open and equipment runs on the starting
 *   gold budget.
 * - 'play': a saved character. Creation allocations that are already committed render locked (see
 *   `isCommitted*` in ./locks) and equipment runs on the real coin wallet. Everything else — level,
 *   spells, features, combat, equipment, personality — stays editable.
 */
export type SheetMode = 'creation' | 'play';

export interface CharacterSheetProps {
  data: CharacterFormData;
  /** AI wizard only: per-area justifications shown as hint icons on the sheet sections. */
  aiDecisions?: AiDecision[] | null;
  /** AI wizard only: per-spell justifications shown as hint icons on spell rows. */
  aiSpellNotes?: AiSpellNote[] | null;
  /** Whether the hint markers show; the saved sheet's eye owns it. Defaults to true. */
  aiHintsEnabled?: boolean;
  classes: RuleItemResponse[];
  subclasses?: RuleItemResponse[];
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
  subclassesLoading?: boolean;
  backgroundsLoading: boolean;
  racesLoading: boolean;
  abilitiesLoading: boolean;
  equipmentItemsLoading: boolean;
  onChange: (data: CharacterFormData) => void;
  /** Defaults to 'creation'. See {@link SheetMode}. */
  mode?: SheetMode;
  /**
   * True after a blocked save attempt. The sheet turns it into PER-FIELD flags (see
   * `./pending-flags`), so acting on one pending field silences only that one.
   */
  saveAttempted?: boolean;
}
