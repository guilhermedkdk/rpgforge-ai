'use client';

import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { User } from '@rpgforce-ai/shared';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { Button } from '@/components/ui/button';

const memberSince = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
};

/**
 * Who these settings belong to.
 *
 * The page used to open straight into a form, which reads as a dialog with no subject. Showing the
 * account first also answers the question the page invites ("how do I look to other people?") with
 * the one control that answers it: a link to the public profile.
 */
export const AccountHeader = ({ user }: { user: User }) => (
  <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
    <div className="flex min-w-0 items-center gap-4">
      <ProfileAvatar
        avatarId={user.avatarId}
        avatarUrl={user.avatarUrl}
        name={user.displayName || user.username}
        className="h-14 w-14"
        fallbackClassName="text-lg"
      />
      <div className="min-w-0">
        <p className="truncate font-serif text-lg font-bold text-foreground">
          {user.displayName || user.username}
        </p>
        <p className="truncate text-sm text-muted-foreground">@{user.username}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          Membro desde {memberSince(user.createdAt)}
        </p>
      </div>
    </div>

    <Button variant="outline" size="sm" asChild>
      <Link href={`/u/${encodeURIComponent(user.username)}`}>
        Ver meu perfil
        <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </Button>
  </section>
);
