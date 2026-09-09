'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/contexts/auth-context';
import { usersApi } from '@/lib/api/users';

// `currentPassword` stays a plain string in every case and the flag only decides whether it may be
// empty. Making the FIELD conditional instead would change the inferred type with the flag, and the
// resolver would no longer match the form.
const buildPasswordSchema = (hasPassword: boolean) =>
  z
    .object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, 'Mínimo de 8 caracteres'),
      confirmPassword: z.string().min(1, 'Obrigatória'),
    })
    .refine((data) => !hasPassword || data.currentPassword.length > 0, {
      message: 'Obrigatória',
      path: ['currentPassword'],
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'As senhas não conferem',
      path: ['confirmPassword'],
    });

type PasswordFormData = z.infer<ReturnType<typeof buildPasswordSchema>>;

/**
 * Changing the password also ends every other session, which is what makes it a security action.
 *
 * Every field carries a permanent hint line and an error REPLACES it, so an error never grows the
 * form and pushes the submit button under the cursor; the server error sits on the button's own row
 * for the same reason.
 */
export const PasswordForm = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { user, refreshUser } = useAuth();

  const hasPassword = user?.hasPassword ?? true;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(buildPasswordSchema(hasPassword)),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (data: PasswordFormData) => {
    setIsSaving(true);
    setSubmitError(null);
    try {
      await usersApi.changePassword(data.currentPassword, data.newPassword);
      reset();
      // Creating the first password flips `hasPassword`, which unlocks unlinking a provider.
      if (!hasPassword) await refreshUser();
      toast.success(hasPassword ? 'Senha alterada.' : 'Senha criada.', {
        description: 'As sessões abertas em outros dispositivos foram encerradas.',
      });
    } catch (error) {
      setSubmitError(
        isAxiosError(error) && error.response?.status === 401
          ? 'A senha atual está incorreta.'
          : 'Não foi possível salvar a senha. Tente novamente.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
          Senha
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Ao trocar, as sessões abertas em outros dispositivos são encerradas.'
            : 'Sua conta entra por um provedor. Crie uma senha para ter um segundo jeito de entrar.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {hasPassword ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">Senha atual</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                disabled={isSaving}
                aria-invalid={errors.currentPassword ? 'true' : 'false'}
                {...register('currentPassword')}
              />
              {errors.currentPassword ? (
                <span className="text-xs text-destructive">{errors.currentPassword.message}</span>
              ) : (
                <span className="text-xs text-muted-foreground">A senha que você usa hoje.</span>
              )}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">{hasPassword ? 'Nova senha' : 'Senha'}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                disabled={isSaving}
                aria-invalid={errors.newPassword ? 'true' : 'false'}
                {...register('newPassword')}
              />
              {errors.newPassword ? (
                <span className="text-xs text-destructive">{errors.newPassword.message}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">
                {hasPassword ? 'Confirmar nova senha' : 'Confirmar senha'}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                disabled={isSaving}
                aria-invalid={errors.confirmPassword ? 'true' : 'false'}
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <span className="text-xs text-destructive">{errors.confirmPassword.message}</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {hasPassword ? 'Repita a nova senha.' : 'Repita a senha.'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {submitError ? (
              <p className="mr-auto text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner size="sm" /> : hasPassword ? 'Alterar senha' : 'Criar senha'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
