'use client';

import Link from 'next/link';
import { CalendarDays, Settings } from 'lucide-react';
import type { PublicProfileResponse } from '@rpgforce-ai/shared';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { Button } from '@/components/ui/button';

const memberSinceLabel = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
};

/**
 * The profile's identity card.
 *
 * The counters show only for the OWNER: a visitor's list already is only the published sheets, so
 * the numbers would say the same thing twice, and the bookmarks are not theirs to see.
 */
export const ProfileHeader = ({ profile }: { profile: PublicProfileResponse }) => {
  const published = profile.sheets.filter((sheet) => sheet.isPublic).length;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-4">
          <ProfileAvatar
            avatarId={profile.avatarId}
            avatarUrl={profile.avatarUrl}
            name={profile.displayName || profile.username}
            className="h-20 w-20"
            fallbackClassName="text-2xl"
          />
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold text-foreground">
              {profile.displayName || profile.username}
            </h1>
            <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Membro desde {memberSinceLabel(profile.memberSince)}
            </p>
          </div>
        </div>

        {profile.isSelf ? (
          <Button variant="outline" asChild>
            <Link href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Editar perfil
            </Link>
          </Button>
        ) : null}
      </div>

      {profile.isSelf ? (
        <div className="flex flex-wrap gap-8 border-t border-border px-5 py-3">
          <Stat value={profile.sheets.length} label="fichas" />
          <Stat value={published} label={published === 1 ? 'pública' : 'públicas'} />
          <Stat
            value={profile.favorites.length}
            label={profile.favorites.length === 1 ? 'favorita' : 'favoritas'}
          />
        </div>
      ) : null}
    </section>
  );
};

const Stat = ({ value, label }: { value: number; label: string }) => (
  <span className="flex items-baseline gap-1.5">
    {/* Proportional figures: these sit inline, so nothing lines up in a column. */}
    <span className="text-lg font-semibold text-foreground proportional-nums">{value}</span>
    <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
  </span>
);
