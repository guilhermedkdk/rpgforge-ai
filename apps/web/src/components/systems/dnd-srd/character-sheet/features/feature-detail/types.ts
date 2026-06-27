'use client';

import { cn } from '@/lib/utils';
import type { CharacterSheetContextValue } from '../../context';

export type FeatureDetail = CharacterSheetContextValue['featureDetails'][number];

/** Typography for feature markdown bodies (scroll/height applied per modal layout). */
export const markdownBodyTypographyClass =
  'markdown-body pr-3 text-left text-sm text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-serif [&_h3]:font-semibold [&_h3]:text-foreground [&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-serif [&_h4]:font-semibold [&_h4]:text-foreground [&_table]:w-full [&_table]:mb-2 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted [&_th]:text-foreground [&_th]:font-medium [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:text-muted-foreground';

/** Compact markdown typography for inline option bodies (Eldritch Invocations, Metamagic, …). */
export const markdownOptionBodyClass =
  'text-xs leading-relaxed text-muted-foreground [&_p]:mb-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic';

/** Matches sheet modals at max-h-[85vh]; leave room for title, padding, close control. */
export const markdownBodyClass = cn(
  markdownBodyTypographyClass,
  'max-h-[calc(85vh-7.5rem)] overflow-y-auto',
);

export const SCHOLAR_ALLOWED_SKILL_KEYS = [
  'arcana',
  'history',
  'investigation',
  'medicine',
  'nature',
  'religion',
] as const;
