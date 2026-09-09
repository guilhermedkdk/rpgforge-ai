'use client';

import { useState } from 'react';
import { isAxiosError } from 'axios';
import { TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { usersApi } from '@/lib/api/users';

/**
 * Deleting asks for a confirmation, because it takes every sheet with it and nothing brings them
 * back. The password is that confirmation when there is one; an account that only ever signed in
 * through a provider has none, so typing the handle is the deliberate act instead.
 */
export const DeleteAccountCard = ({ sheetCount }: { sheetCount: number }) => {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const hasPassword = user?.hasPassword ?? true;
  const username = user?.username ?? '';

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await usersApi.deleteAccount(
        hasPassword ? { password: confirmation } : { confirmUsername: confirmation }
      );
      toast.success('Conta excluída.');
      // A full navigation, not a router push: every cached query belonged to the account that
      // no longer exists.
      window.location.href = '/';
    } catch (caught) {
      const unauthorized = isAxiosError(caught) && caught.response?.status === 401;
      setError(
        unauthorized
          ? hasPassword
            ? 'Senha incorreta.'
            : 'O nome de usuário não confere.'
          : 'Não foi possível excluir a conta. Tente novamente.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif">
            <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
            Excluir conta
          </CardTitle>
          <CardDescription>
            Apaga sua conta e {sheetCount === 1 ? 'a sua ficha' : `as suas ${sheetCount} fichas`}.
            Não tem como desfazer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Excluir minha conta
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirmation('');
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Excluir sua conta?</DialogTitle>
            <DialogDescription>
              {sheetCount === 0
                ? 'Sua conta será apagada permanentemente.'
                : `Sua conta e ${sheetCount === 1 ? 'a sua ficha' : `as suas ${sheetCount} fichas`} serão apagadas permanentemente.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deleteConfirmation">
              {hasPassword ? 'Confirme com sua senha' : `Digite ${username} para confirmar`}
            </Label>
            <Input
              id="deleteConfirmation"
              type={hasPassword ? 'password' : 'text'}
              autoComplete={hasPassword ? 'current-password' : 'off'}
              value={confirmation}
              disabled={isDeleting}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={
                isDeleting ||
                confirmation.length === 0 ||
                (!hasPassword && confirmation !== username)
              }
            >
              {isDeleting ? <Spinner size="sm" /> : 'Excluir para sempre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
