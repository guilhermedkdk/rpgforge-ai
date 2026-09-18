'use client';

import { Globe } from 'lucide-react';
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

interface PublishSheetDialogProps {
  sheetName: string;
  busy: boolean;
  onConfirm: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Only asked BEFORE publishing: putting a character in front of strangers deserves a sentence saying
 * so. There is deliberately no "published" state here — once it is done, a toast says it and the
 * sheet's own menu carries the link and the way back. A dialog that reappears to report success is
 * one more thing to dismiss.
 */
export const PublishSheetDialog = ({
  sheetName,
  busy,
  onConfirm,
  open,
  onOpenChange,
}: PublishSheetDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-serif">
          <Globe className="h-4 w-4 text-primary-ink" aria-hidden="true" />
          Publicar ficha
        </DialogTitle>
        <DialogDescription>
          Ao publicar, qualquer pessoa poderá ver {sheetName.trim() || 'esta ficha'} como leitura, e
          ela aparece na página Explorar.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? <Spinner size="sm" /> : 'Publicar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
