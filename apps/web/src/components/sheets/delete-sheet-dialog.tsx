'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { characterSheetsApi } from '@/lib/api/character-sheets';

const deleteErrorMessage = (e: unknown): string => {
  if (isAxiosError(e) && e.response?.status === 401) return 'Faça login para excluir a ficha.';
  return 'Não foi possível excluir a ficha.';
};

interface DeleteSheetDialogProps {
  sheetId: string;
  sheetName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the sheet is gone; defaults to navigating back to the sheets list. */
  onDeleted?: () => void;
}

/**
 * Confirmation + deletion of a saved sheet. Controlled, so the caller owns the trigger (today a menu
 * item, since deleting is rare and destructive and does not belong next to the primary actions).
 */
export const DeleteSheetDialog = ({
  sheetId,
  sheetName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteSheetDialogProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const finishDeleted = () => {
    onOpenChange(false);
    queryClient.removeQueries({ queryKey: ['character-sheet-with-rules', sheetId] });
    void queryClient.invalidateQueries({ queryKey: ['character-sheets', 'list'] });
    if (onDeleted) {
      onDeleted();
      return;
    }
    router.push('/sheets');
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () => characterSheetsApi.remove(sheetId),
    onSuccess: () => {
      toast.success('Ficha excluída.');
      finishDeleted();
    },
    onError: (e) => {
      // A 404 means someone already deleted it: leaving the user on a dead sheet helps nobody.
      if (isAxiosError(e) && e.response?.status === 404) {
        toast.info('Esta ficha já havia sido excluída.');
        finishDeleted();
        return;
      }
      toast.error(deleteErrorMessage(e));
    },
  });

  const displayName = sheetName.trim() || 'Ficha sem nome';

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir ficha</DialogTitle>
          <DialogDescription>
            A ficha <span className="font-medium text-foreground">{displayName}</span> será removida
            permanentemente. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => mutate()}
            aria-label={isPending ? 'Excluindo' : undefined}
          >
            {isPending ? <Spinner size="sm" /> : 'Excluir ficha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
