import type { CharacterFormData } from '@/lib/dnd-srd/character-state';

export const ATTRIBUTES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const;

/** Ability key from API (raw/normalized) -> attribute name used in form */
export const ABILITY_KEY_TO_ATTR: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** Known tool category labels (from SRD) -> tag value used in API (item:category:<slug>). */
export const TOOL_CATEGORY_TO_TAG: Record<string, string> = {
  'musical instruments': 'musical-instrument',
  'musical instrument': 'musical-instrument',
  'gaming set': 'gaming-set',
  'gaming sets': 'gaming-set',
  "artisan's tools": 'artisan',
  'artisans tools': 'artisan',
  'artisan tools': 'artisan',
};

/** Rule item tag for seed “standard” languages (Common, Elvish, …). */
export const STANDARD_LANGUAGE_TAG = 'language:rarity:standard';

/** Player picks Common (always) + up to 2 other standard languages. */
export const MAX_STANDARD_LANGUAGES_TOTAL = 3;

/** Sheet view: manual available GP input max (clamp on change, same pattern as current HP). */
export const SHEET_AVAILABLE_GP_INPUT_MAX = 99999;

/**
 * Fields editable in session (view) mode: HP, death saves, equipment, and personality text.
 * Used by SheetSession and SheetEditor (readOnly mode) to filter onChange patches.
 */
export const SESSION_EDITABLE_FIELDS = new Set<keyof CharacterFormData>([
  'currentHp',
  'temporaryHp',
  'deathSaveSuccesses',
  'deathSaveFailures',
  'equippedArmorId',
  'equippedShieldId',
  'equipment',
  'equipmentSpentGP',
  'purchasedEquipment',
  'startingEquipmentSelectedIndex',
  'backgroundEquipmentSelectedIndex',
  'walletGP',
  'walletSP',
  'walletCP',
  'personality',
  'ideals',
  'bonds',
  'flaws',
]);

/** Temporary hit points field max (clamp on change, same pattern as current HP). */
export const SHEET_TEMPORARY_HP_INPUT_MAX = 999;

export const numberInputNoSpinner =
  '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [appearance:textfield]';

/**
 * "Needs a choice" highlight for sheet controls. Ambient state is orange (primary); once a save was
 * attempted with this field still incomplete it turns red (destructive) to flag exactly what blocks
 * saving. Callers render this only in the incomplete branch, so `error` is just `saveAttempted`.
 *
 * Class strings are written out in full because Tailwind only generates classes it can find literally.
 */
export const needsChoiceHighlight = (error: boolean): string =>
  error
    ? 'border-dashed border-destructive/70 bg-destructive/5 text-destructive hover:bg-destructive/10'
    : 'border-dashed border-primary/70 bg-primary/5 text-primary hover:bg-primary/10';

/** Softer (`/60`) border variant of {@link needsChoiceHighlight} for inline pills. */
export const needsChoiceHighlightSoft = (error: boolean): string =>
  error
    ? 'border-dashed border-destructive/60 bg-destructive/5 text-destructive hover:bg-destructive/10'
    : 'border-dashed border-primary/60 bg-primary/5 text-primary hover:bg-primary/10';

/** Icon/text accent that pairs with the highlights above. */
export const needsChoiceAccent = (error: boolean): string => (error ? 'text-destructive' : 'text-primary');

/** Dashed container border for inline pickers (musical instrument / holy symbol). */
export const needsChoiceBorder = (error: boolean): string =>
  error ? 'border-destructive/60' : 'border-primary/60';

/** Solid border for required inputs/selects (header name, species, class, background). */
export const requiredFieldErrorBorder = 'border-destructive focus-visible:border-destructive';
