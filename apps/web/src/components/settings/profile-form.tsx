'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { resolveAvatarUrl } from '@rpgforce-ai/shared';
import { AvatarPicker } from '@/components/profile/avatar-picker';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { useAuth } from '@/contexts/auth-context';
import { usersApi } from '@/lib/api/users';

const profileSchema = z.object({
  // Empty string is the real "use my initials" value, not a missing one.
  avatarId: z.string(),
  displayName: z.string().max(40, 'No máximo 40 caracteres'),
  username: z
    .string()
    .min(3, 'Mínimo de 3 caracteres')
    .max(20, 'No máximo 20 caracteres')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífen entre eles'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

/** Name and handle: the two things that appear publicly. The email is shown, never edited here. */
export const ProfileForm = () => {
  const { user, refreshUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    values: {
      avatarId: user?.avatarId ?? '',
      displayName: user?.displayName ?? '',
      username: user?.username ?? '',
    },
  });
  const avatarId = useWatch({ control, name: 'avatarId' });

  const onSubmit = async (data: ProfileFormData) => {
    setIsSaving(true);
    setSubmitError(null);
    try {
      const saved = await usersApi.updateProfile(data);
      await refreshUser();
      reset({
        avatarId: saved.avatarId ?? '',
        displayName: saved.displayName ?? '',
        username: saved.username,
      });
      toast.success('Perfil atualizado.');
    } catch (error) {
      // The API's message is dev-facing: the copy is chosen here, by status.
      setSubmitError(
        isAxiosError(error) && error.response?.status === 409
          ? 'Esse nome de usuário já está em uso.'
          : 'Não foi possível salvar. Tente novamente.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
          Perfil
        </CardTitle>
        <CardDescription>Como você aparece para outras pessoas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                avatarId={avatarId}
                // Resolved from the PENDING choice, not the saved one, or picking Discord would
                // preview the picture that is still saved.
                avatarUrl={resolveAvatarUrl(avatarId, user?.connections ?? [])}
                name={user?.displayName || user?.username || ''}
                className="h-12 w-12"
              />
              <div className="flex flex-col">
                <Label>Avatar</Label>
                <span className="text-xs text-muted-foreground">
                  Escolha uma figura ou fique com as suas iniciais.
                </span>
              </div>
            </div>
            <AvatarPicker
              value={avatarId}
              connections={user?.connections}
              disabled={isSaving}
              onChange={(next) => setValue('avatarId', next, { shouldDirty: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Nome de exibição</Label>
            <Input
              id="displayName"
              placeholder="Seu nome"
              disabled={isSaving}
              aria-invalid={errors.displayName ? 'true' : 'false'}
              {...register('displayName')}
            />
            {errors.displayName ? (
              <span className="text-xs text-destructive">{errors.displayName.message}</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Deixe vazio para usar o nome de usuário.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Nome de usuário</Label>
            <Input
              id="username"
              placeholder="seu-nome"
              disabled={isSaving}
              aria-invalid={errors.username ? 'true' : 'false'}
              {...register('username')}
            />
            {errors.username ? (
              <span className="text-xs text-destructive">{errors.username.message}</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                O endereço do seu perfil: /u/{user?.username ?? 'seu-nome'}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email ?? ''} readOnly disabled />
            <span className="text-xs text-muted-foreground">
              Usado só para entrar: nunca aparece no seu perfil.
            </span>
          </div>

          {/* On the button's row, not above it: a line that appears only on failure moves the
              button the moment you press it. */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {submitError ? (
              <p className="mr-auto text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}
            <Button type="submit" disabled={isSaving || !isDirty}>
              {isSaving ? <Spinner size="sm" /> : 'Salvar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
