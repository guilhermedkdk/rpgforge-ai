export const ATTRIBUTES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const;

/** Temporary hit points field max (clamp on change, same pattern as current HP). */
export const SHEET_TEMPORARY_HP_INPUT_MAX = 999;

export const numberInputNoSpinner =
  '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [appearance:textfield]';

/**
 * "Needs a choice" highlight for sheet controls. Ambient state is orange (primary); once a save was
 * attempted with this field still incomplete it turns red (destructive) to flag exactly what blocks
 * saving. Callers render this only in the incomplete branch, so `error` is just that field's flag
 * (`pendingFlags.isFlagged(key)`), which stands down per field once the player acts on it.
 *
 * Class strings are written out in full because Tailwind only generates classes it can find literally.
 */
export const needsChoiceHighlight = (error: boolean): string =>
  error
    ? 'border-dashed border-destructive/70 bg-destructive/5 text-destructive hover:bg-destructive/10'
    : 'border-dashed border-primary/70 bg-primary/5 text-primary-ink hover:bg-primary/10';

/** Softer (`/60`) border variant of {@link needsChoiceHighlight} for inline pills. */
export const needsChoiceHighlightSoft = (error: boolean): string =>
  error
    ? 'border-dashed border-destructive/60 bg-destructive/5 text-destructive hover:bg-destructive/10'
    : 'border-dashed border-primary/60 bg-primary/5 text-primary-ink hover:bg-primary/10';

/** Icon/text accent that pairs with the highlights above. */
export const needsChoiceAccent = (error: boolean): string =>
  error ? 'text-destructive' : 'text-primary-ink';

/** Dashed container border for inline pickers (musical instrument / holy symbol). */
export const needsChoiceBorder = (error: boolean): string =>
  error ? 'border-destructive/60' : 'border-primary/60';

/**
 * Dashed cue for "new content to acknowledge" (combat equipment / weapon just granted). Unlike the
 * needsChoice* family, it never escalates to red: clicking the control dismisses it.
 */
export const unacknowledgedCueBorder = 'border-dashed border-primary/70';

/** Solid border for required inputs/selects (header name, species, class, background). */
export const requiredFieldErrorBorder = 'border-destructive focus-visible:border-destructive';
