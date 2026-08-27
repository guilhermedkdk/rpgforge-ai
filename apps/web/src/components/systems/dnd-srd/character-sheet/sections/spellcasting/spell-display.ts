// Web-only display constants for the spellcasting UI (row scaffolds + CSS classes).
// The pure spell/rule-item readers live in `@rpgforce-ai/shared` and are imported directly.
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

export const spellChipClass =
  'inline-flex items-center rounded border border-border/60 bg-muted/30 px-2 py-px text-[10px] font-medium text-muted-foreground';

export const spellDetailMarkdownClass =
  'text-xs leading-relaxed text-muted-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground';
