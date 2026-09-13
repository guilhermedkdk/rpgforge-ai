'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/auth-card';
import { useAuth } from '@/contexts/auth-context';
import { authApi } from '@/lib/api/auth';

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não são iguais',
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

/** Spends the link from the e-mail on a new password. */
export const ResetPasswordForm = () => {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshUser } = useAuth();

  // Read after mount rather than in a state initializer: the server pass has no location, and
  // seeding from it would hydrate to different markup.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      await authApi.resetPassword({ token, newPassword: data.newPassword });
      // The cookies are already set; this only refills the context so the header updates in place.
      await refreshUser();
      router.push('/sheets');
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      setError(
        status === 401
          ? 'Esse link expirou ou já foi usado. Peça outro.'
          : 'Não foi possível trocar a senha. Tente de novo.'
      );
      setIsLoading(false);
    }
  };

  if (token === '') {
    return (
      <AuthCard title="Link inválido" description="Esse endereço não tem um link de recuperação">
        <Button asChild className="w-full">
          <Link href="/auth/forgot-password">Pedir um novo link</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nova senha" description="Escolha a senha que você vai usar" error={error}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="new-password">Nova senha</Label>
            {errors.newPassword && (
              <span className="text-xs leading-none text-destructive">
                {errors.newPassword.message}
              </span>
            )}
          </div>
          <Input
            id="new-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            {...register('newPassword')}
            disabled={isLoading}
            aria-invalid={errors.newPassword ? 'true' : 'false'}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="confirm-password">Repita a senha</Label>
            {errors.confirmPassword && (
              <span className="text-xs leading-none text-destructive">
                {errors.confirmPassword.message}
              </span>
            )}
          </div>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
            disabled={isLoading}
            aria-invalid={errors.confirmPassword ? 'true' : 'false'}
          />
        </div>

        <Button type="submit" disabled={isLoading || token === null} className="w-full">
          {isLoading ? <Spinner size="sm" /> : 'Salvar e entrar'}
        </Button>
      </form>
    </AuthCard>
  );
};
