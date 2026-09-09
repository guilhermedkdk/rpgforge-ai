import { IsIn, IsOptional } from 'class-validator';

/** Themes the sheet can be rendered in; anything else is not a theme the app has. */
export const EXPORT_THEMES = ['light', 'dark'] as const;
export type ExportTheme = (typeof EXPORT_THEMES)[number];

export class ExportSheetPdfDto {
  /**
   * Which theme to render. The client sends what it is showing, so the file matches the sheet the
   * user is looking at; absent means light, which is what a sheet meant for paper wants.
   */
  @IsOptional()
  @IsIn(EXPORT_THEMES)
  theme?: ExportTheme;
}
