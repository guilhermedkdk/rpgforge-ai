'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/auth-card';
import { authApi } from '@/lib/api/auth';

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/** Asks for a reset link. The screen never says whether the address has an account. */
export const ForgotPasswordForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      await authApi.forgotPassword(data);
      setIsSent(true);
    } catch {
      setError('Não foi possível enviar agora. Tente de novo em alguns minutos.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
      <AuthCard title="Verifique seu email" description="O link está a caminho">
        <p className="text-sm text-muted-foreground">
          Se existir uma conta com esse email, você vai receber um link para escolher uma nova
          senha. Ele vale por 30 minutos.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Não chegou? Olhe na caixa de spam antes de pedir outro.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/auth/login">Voltar para o login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Esqueci minha senha"
      description="Digite seu email e a gente manda um link"
      error={error}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="forgot-email">Email</Label>
            {errors.email && (
              <span className="text-xs leading-none text-destructive">{errors.email.message}</span>
            )}
          </div>
          <Input
            id="forgot-email"
            type="email"
            autoFocus
            autoComplete="email"
            {...register('email')}
            disabled={isLoading}
            aria-invalid={errors.email ? 'true' : 'false'}
          />
        </div>

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? <Spinner size="sm" /> : 'Enviar o link'}
        </Button>

        <div className="text-center text-sm">
          <Link href="/auth/login" className="text-muted-foreground hover:underline">
            Voltar para o login
          </Link>
        </div>
      </form>
    </AuthCard>
  );
};
