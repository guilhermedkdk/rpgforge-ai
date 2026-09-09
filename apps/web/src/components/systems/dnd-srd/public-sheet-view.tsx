'use client';

import { useCallback } from 'react';
import type { CharacterFormData, PackResponse } from '@rpgforce-ai/shared';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import { useSavedSheetView, type SheetPreloadedRuleItems } from './hooks/use-saved-sheet-view';

interface PublicSheetViewProps {
  pack: PackResponse;
  initialData: CharacterFormData;
  preloadedRuleItems: SheetPreloadedRuleItems;
}

/**
 * A published sheet, read-only. The SAME component the owner edits, so the numbers a visitor reads
 * are the numbers the owner sees; a separate renderer would drift.
 *
 * Enforced at the source of writes: `onChange` is the only path an edit can take and here it does
 * nothing, so a controlled field never moves. `inert` would be airtight but also kills the
 * description popovers, so `static-sheet` in globals.css hides the dead affordances instead.
 */
export const PublicSheetView = ({
  pack,
  initialData,
  preloadedRuleItems,
}: PublicSheetViewProps) => {
  const { data, sheetCatalogProps } = useSavedSheetView({ pack, initialData, preloadedRuleItems });

  // Every player edit funnels here, so this one line is the whole read-only guarantee.
  const ignoreEdits = useCallback(() => {}, []);

  return (
    <div className="static-sheet print-sheet content-reveal">
      <CharacterSheet
        data={data}
        {...sheetCatalogProps}
        onChange={ignoreEdits}
        mode="play"
        saveAttempted={false}
      />
    </div>
  );
};
