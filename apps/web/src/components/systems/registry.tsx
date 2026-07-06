import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import type {
  PackResponse,
  RuleItemResponse,
  CharacterSheetWithRulesResponse,
} from '@rpgforce-ai/shared';
import { mergeCharacterFormDataFromApi } from '@/lib/dnd-srd/character-state';

export interface SheetEditorBaseProps {
  pack: PackResponse;
  onBack: () => void;
  initialSheetId?: string | null;
}

export interface SheetViewerBaseProps {
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

export interface SystemEntry {
  renderViewer: (
    props: SheetViewerBaseProps & { data: CharacterSheetWithRulesResponse },
  ) => ReactNode;
  editor: ComponentType<SheetEditorBaseProps>;
  library: ComponentType<LibraryBrowserBaseProps>;
  libraryItem: ComponentType<LibraryItemBaseProps>;
}

const DndSrdSheetSession = dynamic(
  () => import('./dnd-srd/sheet-session').then((m) => ({ default: m.SheetSession })),
  { ssr: false },
);

const DndSrdSheetEditor = dynamic(
  () => import('./dnd-srd/sheet-editor').then((m) => ({ default: m.SheetEditor })),
  { ssr: false },
);

const DndSrdLibraryBrowser = dynamic(
  () =>
    import('./dnd-srd/library/browser/library-browser').then((m) => ({
      default: m.LibraryBrowser,
    })),
  { ssr: false },
);

const DndSrdLibraryItemDetail = dynamic(
  () =>
    import('./dnd-srd/library/browser/library-item-detail').then((m) => ({
      default: m.LibraryItemDetail,
    })),
  { ssr: false },
);

export const systemRegistry: Record<string, SystemEntry> = {
  'dnd-srd-5-2': {
    renderViewer: ({ sheetId, onBack, data }) => (
      <DndSrdSheetSession
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
  },
};
