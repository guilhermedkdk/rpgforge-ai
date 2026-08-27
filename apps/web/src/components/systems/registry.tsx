import dynamic from 'next/dynamic';
import {
  mergeCharacterFormDataFromApi,
  type AiDecision,
  type AiSpellNote,
  type PersistedCharacterData,
  type PackResponse,
  type RuleItemResponse,
  type CharacterSheetWithRulesResponse,
} from '@rpgforce-ai/shared';
import type { ComponentType, ReactNode } from 'react';
import { DndClassEmblem } from './dnd-srd/art/class-emblems';
import { DndRaceEmblem } from './dnd-srd/art/race-emblems';
import { LoadingState } from '@/components/ui/loading-state';

export interface SheetEditorBaseProps {
  pack: PackResponse;
  onBack: () => void;
  /** In-memory persisted-shape draft (e.g. from the AI wizard) to hydrate on mount. */
  initialData?: PersistedCharacterData | null;
  /** AI wizard only: per-area justifications shown as hint markers on the sheet sections. */
  aiDecisions?: AiDecision[] | null;
  /** AI wizard only: per-spell justifications shown as hint markers on spell rows. */
  aiSpellNotes?: AiSpellNote[] | null;
  /** AI wizard only: summary banner rendered by the editor below its own page header. */
  aiBanner?: ReactNode;
  /**
   * AI wizard only: opaque id of the interaction that produced `initialData`, sent on save so the
   * server can persist that interaction alongside the sheet. Never rendered.
   */
  generationId?: string;
}

export interface SheetManagerBaseProps {
  sheetId: string;
  onBack: () => void;
}

export interface LibraryBrowserBaseProps {
  pack: PackResponse;
}

export interface LibraryItemBaseProps {
  pack: PackResponse;
  item: RuleItemResponse;
  /** Validated `?from=` URL of the browse listing the user came from (filters preserved). */
  backHref?: string;
}

export interface RaceEmblemProps {
  /** RACE rule-item slug, from a sheet summary's `preview`. */
  raceSlug: string | null;
  className?: string;
}

export interface ClassEmblemProps {
  /** CLASS rule-item slug, from a sheet summary's `preview`. */
  classSlug: string | null;
  className?: string;
}

export interface SystemEntry {
  /** The saved-sheet page: play + edit in place. */
  renderSheetManager: (
    props: SheetManagerBaseProps & { data: CharacterSheetWithRulesResponse }
  ) => ReactNode;
  editor: ComponentType<SheetEditorBaseProps>;
  library: ComponentType<LibraryBrowserBaseProps>;
  libraryItem: ComponentType<LibraryItemBaseProps>;
  /** Optional per-class art for sheet cards; the card falls back to a neutral icon without it. */
  classEmblem?: ComponentType<ClassEmblemProps>;
  /** Optional per-species art; the card's tile shows it and the class emblem becomes a badge. */
  raceEmblem?: ComponentType<RaceEmblemProps>;
}

const DndSrdSheetManager = dynamic(
  () => import('./dnd-srd/sheet-manager').then((m) => ({ default: m.SheetManager })),
  { ssr: false }
);

const DndSrdSheetEditor = dynamic(
  () => import('./dnd-srd/sheet-editor').then((m) => ({ default: m.SheetEditor })),
  // Only the content area: the create page owns the action bar and keeps it mounted meanwhile.
  { ssr: false, loading: () => <LoadingState /> }
);

const DndSrdLibraryBrowser = dynamic(
  () =>
    import('./dnd-srd/library/browser/library-browser').then((m) => ({
      default: m.LibraryBrowser,
    })),
  { ssr: false }
);

const DndSrdLibraryItemDetail = dynamic(
  () =>
    import('./dnd-srd/library/browser/library-item-detail').then((m) => ({
      default: m.LibraryItemDetail,
    })),
  { ssr: false }
);

export const systemRegistry: Record<string, SystemEntry> = {
  'dnd-srd-5-2': {
    renderSheetManager: ({ sheetId, onBack, data }) => (
      <DndSrdSheetManager
        sheetId={sheetId}
        onBack={onBack}
        pack={data.pack}
        initialData={mergeCharacterFormDataFromApi(data.sheet.data, data.sheet.schemaVersion)}
        preloadedRuleItems={{
          byId: data.ruleItems,
          abilities: data.abilities,
          languages: data.languages,
          toolItems: data.toolItems,
        }}
      />
    ),
    editor: DndSrdSheetEditor,
    library: DndSrdLibraryBrowser,
    libraryItem: DndSrdLibraryItemDetail,
    classEmblem: DndClassEmblem,
    raceEmblem: DndRaceEmblem,
  },
};
