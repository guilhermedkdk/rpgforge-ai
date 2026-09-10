'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { FileDown, Globe, Link2, Lock, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteSheetDialog } from '@/components/sheets/delete-sheet-dialog';
import { PublishSheetDialog } from '@/components/sheets/publish-sheet-dialog';
import { SheetVisibilityChip } from '@/components/sheets/sheet-chip';
import { useAuth } from '@/contexts/auth-context';
import { publicSheetPath } from '@/lib/public-sheet-path';
import {
  resolveSheetSaveState,
  SheetSaveStateChip,
  UnsavedChangesBar,
} from '@/components/sheets/sheet-save-state';
import {
  UnsavedChangesDialog,
  useUnsavedChangesGuard,
} from '@/components/sheets/unsaved-changes-guard';
import { usePrintLightTheme } from '@/components/sheets/use-print-light-theme';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import type { CharacterFormData, PackResponse } from '@rpgforce-ai/shared';
import { useSavedSheetView, type SheetPreloadedRuleItems } from './hooks/use-saved-sheet-view';
import { useSheetSaveFlow } from './hooks/use-sheet-save-flow';

interface SheetManagerProps {
  sheetId: string;
  pack: PackResponse;
  initialData: CharacterFormData;
  preloadedRuleItems: SheetPreloadedRuleItems;
  /** Whether the sheet is published; the header chip and the publish dialog read it. */
  initialIsPublic?: boolean;
  onBack: () => void;
}

/**
 * A saved character: playable AND editable in place. Level, spells, features, combat, equipment and
 * personality are live; the creation allocations the sheet already committed render locked (see
 * `character-sheet/locks.ts`). It runs the SAME derivation and the SAME save validation the creation
 * editor runs, so leveling up here can't produce a sheet the creation flow would call invalid.
 */
export function SheetManager({
  sheetId,
  pack,
  initialData,
  preloadedRuleItems,
  initialIsPublic = false,
  onBack,
}: SheetManagerProps) {
  const router = useRouter();
  const {
    data,
    setData,
    handleChange,
    requestRederive,
    catalogsLoaded,
    sheetCatalogProps,
    feats,
    classes,
    subclasses,
    standardLanguageOptions,
    toolItemsByCategory,
    allSpells,
    itemIdByLookupKey,
  } = useSavedSheetView({ pack, initialData, preloadedRuleItems });
  const [dirty, setDirty] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [publishing, setPublishing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Snapshot for "Descartar alterações": tracks `data` while the sheet is clean, so it holds the
  // last saved state AFTER the derivation settled (reverting to the raw persisted shape would leave
  // the sheet underived, since the derivation only re-runs when its fingerprint changes).
  const savedDataRef = useRef<CharacterFormData>(data);
  if (!dirty) savedDataRef.current = data;

  // "Alterações não salvas" must mean the PLAYER changed something. Rule-driven writes share the same
  // onChange (granted spells, stale-pick reconciliations) and several of them fire while the sheet
  // loads, so state changes alone can't be the signal. A payload diff can't either: re-serializing an
  // untouched sheet legitimately differs in shape (key order, zero-filled ASI abilities, duplicate
  // item rows resolving to another id). So the flag is armed by the first real interaction — after
  // that, a derived write is always downstream of an edit anyway.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const arm = () => {
      userInteractedRef.current = true;
    };
    const opts = { capture: true, once: true } as const;
    document.addEventListener('pointerdown', arm, opts);
    document.addEventListener('keydown', arm, opts);
    return () => {
      document.removeEventListener('pointerdown', arm, opts);
      document.removeEventListener('keydown', arm, opts);
    };
  }, []);

  const onChange = useCallback(
    (next: CharacterFormData) => {
      if (userInteractedRef.current) setDirty(true);
      handleChange(next);
    },
    [handleChange]
  );

  const { validateAndSave, saving, saved, saveError, saveErrorStatus, saveAttempted } =
    useSheetSaveFlow({
      data,
      mode: 'play',
      packId: pack.id,
      sheetId,
      abilities: preloadedRuleItems.abilities,
      feats,
      classes,
      subclasses,
      standardLanguages: standardLanguageOptions,
      toolItemsByCategory,
      allSpells,
      itemIdByLookupKey,
    });

  const handleSave = async () => {
    const id = await validateAndSave();
    if (id) setDirty(false);
  };

  // The open sheet was deleted server-side (PATCH → 404): persist the current state as a new sheet
  // instead of losing the work, then open it.
  const handleSaveAsNew = async () => {
    const id = await validateAndSave({ sheetId: null });
    if (id) router.push(`/sheets/${id}`);
  };

  const { resolvedTheme } = useTheme();

  usePrintLightTheme();

  // The PDF is this very page, printed by a headless browser on the server: the file is the sheet
  // itself, not a reconstruction of it. What print keeps or hides lives in the print block of
  // globals.css, which is also what Ctrl+P uses.
  const handleExportPdf = async () => {
    setExporting(true);
    // The wait is the render itself and runs for tens of seconds, so it has to be named: a bare
    // spinner for that long reads as a stuck button.
    const toastId = toast.loading('Gerando o PDF da sua ficha', {
      description:
        'Pode levar até 30 segundos. Ele sai idêntico à ficha do site, e é isso que leva tempo.',
    });
    try {
      // The file matches the sheet the reader has on screen; Ctrl+P stays light, since that one
      // ends up on paper (see usePrintLightTheme).
      const { blob, fileName } = await characterSheetsApi.exportPdf(
        sheetId,
        resolvedTheme === 'dark' ? 'dark' : 'light'
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next frame: Safari aborts the download if the URL dies during the click.
      requestAnimationFrame(() => URL.revokeObjectURL(url));
      setMenuOpen(false);
      toast.success('PDF pronto', { id: toastId, description: 'O download começou.' });
    } catch {
      toast.error('Não foi possível gerar o PDF', {
        id: toastId,
        description: 'Tente novamente. Você também pode usar Ctrl+P para salvar a ficha.',
      });
    } finally {
      setExporting(false);
    }
  };

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const publicUrl = user
    ? `${window.location.origin}${publicSheetPath(user.username, sheetId)}`
    : null;

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const setVisibility = async (next: boolean) => {
    setPublishing(true);
    try {
      await characterSheetsApi.setVisibility(sheetId, next);
      setIsPublic(next);
      setPublishOpen(false);
      // The sheets list marks which sheets are published, and the profile lists them.
      void queryClient.invalidateQueries({ queryKey: ['character-sheets'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success(next ? 'Ficha publicada.' : 'Ficha voltou a ser privada.');
    } catch {
      toast.error('Não foi possível alterar a visibilidade', {
        description: 'Tente novamente em alguns instantes.',
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleDiscard = () => {
    setDirty(false);
    // The restored snapshot may sit at a different level than the last derivation ran at, so ask for a
    // fresh pass instead of letting it skip as "already derived".
    requestRederive();
    setData(() => savedDataRef.current);
  };

  const guard = useUnsavedChangesGuard(dirty);

  return (
    <>
      {/* Everything animated lives here; the fixed bar below must stay OUT, or the transform makes
          this element its containing block and it lands at the bottom of the ~2000px sheet. */}
      <div
        className="content-reveal print-sheet"
        data-sheet-ready={catalogsLoaded ? 'true' : 'false'}
      >
        <BackLink onClick={() => guard.guard(onBack)} className="mb-3 print:hidden">
          Minhas Fichas
        </BackLink>
        <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold text-foreground">
              {data.name?.trim() || 'Ficha sem nome'}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sistema: <span className="font-medium text-foreground">{pack.name}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Same two actions the menu offers, and deliberately the same asymmetry: publishing
                asks first, because it puts the sheet in front of strangers; unpublishing just
                happens, because pulling something back needs no ceremony. */}
            <SheetVisibilityChip
              isPublic={isPublic}
              busy={publishing}
              onToggle={() => {
                if (isPublic) void setVisibility(false);
                else setPublishOpen(true);
              }}
            />
            <SheetSaveStateChip state={resolveSheetSaveState({ dirty, saving, saved })} />
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Ações da ficha">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  disabled={exporting}
                  onSelect={(e) => {
                    // Stays open while the server renders, so the row's spinner is what reports it.
                    e.preventDefault();
                    void handleExportPdf();
                  }}
                >
                  {exporting ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  Exportar PDF
                </DropdownMenuItem>
                {isPublic ? (
                  <>
                    <DropdownMenuItem onSelect={() => void handleCopyLink()}>
                      <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Copiar link público
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={publishing}
                      onSelect={(e) => {
                        // Stays open while the request runs, like the PDF row.
                        e.preventDefault();
                        void setVisibility(false).then(() => setMenuOpen(false));
                      }}
                    >
                      <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
                      Tornar privada
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      // Same reason as "Excluir ficha": Radix's focus restore would fight the dialog.
                      e.preventDefault();
                      setMenuOpen(false);
                      setPublishOpen(true);
                    }}
                  >
                    <Globe className="mr-2 h-4 w-4" aria-hidden="true" />
                    Publicar ficha
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!dirty || saving} onSelect={handleDiscard}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Descartar alterações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    // Close the menu by hand instead of letting Radix do it on select: its focus
                    // restore would fight the dialog, and the menu would stay open behind it.
                    e.preventDefault();
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Excluir ficha
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CharacterSheet
          data={data}
          {...sheetCatalogProps}
          onChange={onChange}
          mode="play"
          saveAttempted={saveAttempted}
        />
      </div>

      {dirty ? (
        <UnsavedChangesBar
          saving={saving}
          onSave={() => void handleSave()}
          onDiscard={handleDiscard}
          footer={
            saveError ? (
              <div className="flex flex-col items-center gap-1.5 px-2 pb-1">
                <p className="max-w-xs text-center text-xs text-destructive">{saveError}</p>
                {saveErrorStatus === 404 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleSaveAsNew()}
                  >
                    Salvar como nova ficha
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : null}

      <PublishSheetDialog
        sheetName={data.name ?? ''}
        busy={publishing}
        onConfirm={() => void setVisibility(true)}
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />

      <DeleteSheetDialog
        sheetId={sheetId}
        sheetName={data.name ?? ''}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onBack}
      />
      <UnsavedChangesDialog
        open={guard.isConfirming}
        onConfirm={guard.confirm}
        onCancel={guard.cancel}
      />
    </>
  );
}
