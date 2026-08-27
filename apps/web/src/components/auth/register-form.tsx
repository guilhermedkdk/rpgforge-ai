'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthCard } from '@/components/auth/auth-card';
import { resolveRegisterError, type AuthFormErrorInfo } from '@/lib/auth-errors';

const registerSchema = z
  .object({
    email: z.string().email('Email inválido'),
    password: z.string().min(8, 'Mínimo de 8 caracteres'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Não coincide',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export const RegisterForm = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<AuthFormErrorInfo | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { register: registerUser } = useAuth();

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const focusField = submitError?.focus;

  // Runs post-commit, when the inputs are enabled again
  useEffect(() => {
    if (!attempt || !focusField) return;
    setFocus(focusField);
  }, [attempt, focusField, setFocus]);

  const isFlagged = (field: 'email' | 'password') => submitError?.fields.includes(field) ?? false;

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setSubmitError(null);

    try {
      await registerUser(data.email, data.password);
    } catch (err) {
      setSubmitError(resolveRegisterError(err));
      setAttempt((current) => current + 1);
    } finally {
      setIsLoading(false);
    }
  };

  // Editing any field drops the submit error instead of leaving stale red on screen
  const handleFieldChange = () => {
    if (submitError) setSubmitError(null);
  };

  return (
    <AuthCard
      title="Criar conta"
      description="Crie sua conta para começar"
      error={submitError?.message}
    >
      {/* noValidate: the browser's native bubble would preempt our own messages */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        onChange={handleFieldChange}
        noValidate
        className="space-y-4"
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="email">Email</Label>
            {errors.email && (
              <span className="text-xs leading-none text-destructive">{errors.email.message}</span>
            )}
          </div>
          <Input
            id="email"
            type="email"
            {...register('email')}
            disabled={isLoading}
            aria-invalid={errors.email || isFlagged('email') ? 'true' : 'false'}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">Senha</Label>
            {errors.password && (
              <span className="text-xs leading-none text-destructive">
                {errors.password.message}
              </span>
            )}
          </div>
          <Input
            id="password"
            type="password"
            {...register('password')}
            disabled={isLoading}
            aria-invalid={errors.password || isFlagged('password') ? 'true' : 'false'}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="confirmPassword">Confirmar Senha</Label>
            {errors.confirmPassword && (
              <span className="text-xs leading-none text-destructive">
                {errors.confirmPassword.message}
              </span>
            )}
          </div>
          <Input
            id="confirmPassword"
            type="password"
            {...register('confirmPassword')}
            disabled={isLoading}
            aria-invalid={errors.confirmPassword ? 'true' : 'false'}
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
          aria-label={isLoading ? 'Criando conta' : undefined}
        >
          {isLoading ? <Spinner size="sm" /> : 'Criar conta'}
        </Button>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Já tem uma conta? </span>
          <Link href="/auth/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </div>
      </form>
    </AuthCard>
  );
};
