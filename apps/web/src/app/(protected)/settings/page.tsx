'use client';

import {
  KeyRound,
  Link2,
  Settings as SettingsIcon,
  ShieldAlert,
  Sun,
  UserRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { LoadingState } from '@/components/ui/loading-state';
import { AccountHeader } from '@/components/settings/account-header';
import { AppearanceCard } from '@/components/settings/appearance-card';
import { ConnectionsCard } from '@/components/settings/connections-card';
import { DeleteAccountCard } from '@/components/settings/delete-account-card';
import { PasswordForm } from '@/components/settings/password-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { SettingsNav, type SettingsSection } from '@/components/settings/settings-nav';
import { useAuth, useRequireAuth } from '@/contexts/auth-context';
import { characterSheetsApi } from '@/lib/api/character-sheets';

const SECTIONS: SettingsSection[] = [
  { id: 'perfil', label: 'Perfil', icon: UserRound },
  { id: 'senha', label: 'Senha', icon: KeyRound },
  { id: 'conexoes', label: 'Conexões', icon: Link2 },
  { id: 'aparencia', label: 'Aparência', icon: Sun },
  { id: 'conta', label: 'Conta', icon: ShieldAlert },
];

export default function SettingsPage() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();

  // Only to tell the user what deleting the account would take with it.
  const { data: sheets } = useQuery({
    queryKey: ['character-sheets'],
    queryFn: characterSheetsApi.list,
    enabled: ready,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Configurações</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Sua conta, sua senha e como o site aparece para você.
          </p>
        </div>

        {!ready || !user ? (
          <LoadingState />
        ) : (
          <div className="flex flex-col gap-6 content-reveal">
            <AccountHeader user={user} />

            {/* Two columns from lg: the index on the left, the sections on the right. The nav is a
                narrow fixed rail rather than a fraction, so the forms keep their reading width. */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
              <aside className="hidden w-44 shrink-0 lg:block">
                <SettingsNav sections={SECTIONS} />
              </aside>

              <div className="flex min-w-0 flex-1 flex-col gap-6">
                {/* scroll-mt clears the sticky header, or an anchor lands with its title hidden. */}
                <section id="perfil" className="scroll-mt-24">
                  <ProfileForm />
                </section>
                <section id="senha" className="scroll-mt-24">
                  <PasswordForm />
                </section>
                {/* Renders nothing when no provider is configured, and the nav entry is harmless. */}
                <section id="conexoes" className="scroll-mt-24">
                  <ConnectionsCard />
                </section>
                <section id="aparencia" className="scroll-mt-24">
                  <AppearanceCard />
                </section>
                <section id="conta" className="scroll-mt-24">
                  <DeleteAccountCard sheetCount={sheets?.length ?? 0} />
                </section>
              </div>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
