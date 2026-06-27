import dynamic from 'next/dynamic';
import type { ComponentType, ReactNode } from 'react';
import type { PackResponse, CharacterSheetWithRulesResponse } from '@rpgforce-ai/shared';
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

export interface SystemEntry {
  renderViewer: (
    props: SheetViewerBaseProps & { data: CharacterSheetWithRulesResponse },
  ) => ReactNode;
  editor: ComponentType<SheetEditorBaseProps>;
}

const DndSrdSheetSession = dynamic(
  () => import('./dnd-srd/sheet-session').then((m) => ({ default: m.SheetSession })),
  { ssr: false },
);

const DndSrdSheetEditor = dynamic(
  () => import('./dnd-srd/sheet-editor').then((m) => ({ default: m.SheetEditor })),
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
  },
};
