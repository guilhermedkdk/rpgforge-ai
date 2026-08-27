'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Warns before leaving a page that holds unsaved changes.
 *
 * Two escape routes have to be covered: closing/reloading the tab (`beforeunload`, where the browser
 * owns the prompt) and clicking any in-app link (App Router has no navigation-block API, so the click
 * is intercepted in the capture phase and replayed after the user confirms). `guard` wraps the page's
 * own actions, e.g. the back link.
 */
export const useUnsavedChangesGuard = (dirty: boolean) => {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      // Let modified clicks through: the user asked for a new tab, so this page keeps its state.
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      e.preventDefault();
      e.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      setPending(() => () => router.push(href));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty, router]);

  /** Runs `action` now when the sheet is clean, or asks for confirmation first when it is not. */
  const guard = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return;
    }
    setPending(() => action);
  }, []);

  const confirm = useCallback(() => {
    const action = pending;
    setPending(null);
    action?.();
  }, [pending]);

  const cancel = useCallback(() => setPending(null), []);

  return { guard, isConfirming: pending !== null, confirm, cancel };
};

interface UnsavedChangesDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Defaults describe a saved sheet; creation overrides them (it discards a draft, not edits). */
  title?: string;
  description?: string;
  confirmLabel?: string;
}

/** Pairs with {@link useUnsavedChangesGuard}: the "you will lose your changes" confirmation. */
export const UnsavedChangesDialog = ({
  open,
  onConfirm,
  onCancel,
  title = 'Sair sem salvar?',
  description = 'Esta ficha tem alterações que ainda não foram salvas. Se você sair agora, elas serão perdidas.',
  confirmLabel = 'Sair sem salvar',
}: UnsavedChangesDialogProps) => (
  <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Continuar editando
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
