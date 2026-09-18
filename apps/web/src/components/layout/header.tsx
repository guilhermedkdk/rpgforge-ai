'use client';

import Link from 'next/link';
import { Plus, Menu, User, Settings, LogOut, Scroll, BookOpen, Compass, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RPGForgeMark } from '@/components/brand/rpgforge-mark';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/auth-context';
import { ThemeToggle } from './theme-toggle';

/**
 * The main navigation.
 *
 * `requiresAuth` hides a destination a visitor cannot reach: "Minhas Fichas" only redirected them to
 * login. "Criar" stays, on purpose — the creation flow works without an account and only asks for one
 * when there is something to save.
 */
const NAV_LINKS = [
  { href: '/sheets', label: 'Minhas Fichas', icon: Scroll, requiresAuth: true },
  { href: '/explore', label: 'Explorar', icon: Compass, requiresAuth: false },
  { href: '/library', label: 'Biblioteca', icon: BookOpen, requiresAuth: false },
  { href: '/create', label: 'Criar', icon: Plus, requiresAuth: false },
] as const;

export const Header = () => {
  const { user, isLoading, logout } = useAuth();
  const visibleLinks = NAV_LINKS.filter((link) => !link.requiresAuth || user);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 print:hidden">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href={user ? '/sheets' : '/'} className="flex items-center gap-2">
          {/* The mark stands IN FOR the word "AI", which is why it carries those letters. Reading
              it aloud still gives "RPGForge AI", so the accessible name below says exactly that. */}
          <span className="font-serif text-xl font-bold tracking-wide text-foreground">
            RPGForge
          </span>
          <RPGForgeMark className="h-9 w-9 text-primary-ink" />
          <span className="sr-only">AI</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegação principal">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-primary-ink"
              >
                <Icon className="h-4 w-4 group-hover:text-primary-ink" aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative hidden h-9 w-9 rounded-full md:flex"
                    aria-label="Menu do usuário"
                  >
                    <ProfileAvatar
                      avatarId={user.avatarId}
                      avatarUrl={user.avatarUrl}
                      name={user.displayName || user.username}
                      className="h-9 w-9 border border-border"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href={`/u/${user.username}`} className="flex items-center gap-2">
                      <User className="h-4 w-4" aria-hidden="true" />
                      Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" aria-hidden="true" />
                      Configurações
                    </Link>
                  </DropdownMenuItem>
                  {/* Only for admins: the route itself is guarded server-side, this just hides a
                      door nobody else can open. */}
                  {user.role === 'ADMIN' ? (
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="flex items-center gap-2">
                        <Gauge className="h-4 w-4" aria-hidden="true" />
                        Painel
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : isLoading ? (
            /* Restoring a session takes a round trip, and sometimes a token refresh on top. Drawing
               "Entrar" meanwhile states something not yet known, and states it wrongly for everyone
               who IS signed in: they watch the header call them a visitor and then correct itself. */
            <div className="hidden items-center gap-2 md:flex" aria-hidden="true">
              <div className="h-8 w-[4.5rem] animate-pulse rounded-md bg-muted" />
              <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          ) : (
            <>
              {/* From `md` only: below it the hamburger is on screen and offers the same two, and
                  showing both meant the same pair of actions twice in one viewport. */}
              <div className="hidden items-center gap-2 md:flex">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/auth/login">Entrar</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register">Criar conta</Link>
                </Button>
              </div>
            </>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              {/* pt-14 clears the close button, which floats at the top right. */}
              <div className="flex flex-col gap-6 px-4 pt-14 pb-6">
                {/* Who you are comes first: below `md` this panel is the ONLY menu, so it answers
                    "which account am I in" before it offers anywhere to go. `pr-10` keeps a long
                    name clear of the close button. */}
                {user ? (
                  <div className="flex items-center gap-3 pr-10">
                    <ProfileAvatar
                      avatarId={user.avatarId}
                      avatarUrl={user.avatarUrl}
                      name={user.displayName || user.username}
                      className="h-10 w-10 shrink-0 border border-border"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user.displayName || user.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </div>
                ) : null}

                {/* One list, because they are all just places to go. The avatar trigger is hidden at
                    this width, so everything its dropdown offers has to be reachable here. */}
                <nav className="flex flex-col gap-4" aria-label="Menu mobile">
                  {visibleLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary-ink"
                      >
                        <Icon className="h-5 w-5 group-hover:text-primary-ink" aria-hidden="true" />
                        {link.label}
                      </Link>
                    );
                  })}
                  {user ? (
                    <>
                      <Link
                        href={`/u/${user.username}`}
                        className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary-ink"
                      >
                        <User className="h-5 w-5 group-hover:text-primary-ink" aria-hidden="true" />
                        Perfil
                      </Link>
                      <Link
                        href="/settings"
                        className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary-ink"
                      >
                        <Settings className="h-5 w-5 group-hover:text-primary-ink" aria-hidden="true" />
                        Configurações
                      </Link>
                      {user.role === 'ADMIN' ? (
                        <Link
                          href="/admin"
                          className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary-ink"
                        >
                          <Gauge className="h-5 w-5 group-hover:text-primary-ink" aria-hidden="true" />
                          Painel
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                </nav>

                {/* Signing in is an ACTION, not a fourth destination: as a plain row it carried the
                    same weight as "Explorar", which is not what the header says at any other width. */}
                {/* Kept out of the list above: leaving is not a destination. */}
                {user ? (
                  <div className="border-t border-border pt-6">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex cursor-pointer items-center gap-3 text-left text-base font-medium text-destructive hover:opacity-80"
                    >
                      <LogOut className="h-5 w-5" aria-hidden="true" />
                      Sair
                    </button>
                  </div>
                ) : isLoading ? (
                  /* Same reason as the desktop slot: the two rows above simply do not appear while
                     the session is unknown, but these ones would claim it is already known. */
                  <div className="flex flex-col gap-2 border-t border-border pt-6" aria-hidden="true">
                    <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                    <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 border-t border-border pt-6">
                    <Button variant="outline" asChild className="w-full">
                      <Link href="/auth/login">Entrar</Link>
                    </Button>
                    <Button asChild className="w-full">
                      <Link href="/auth/register">Criar conta</Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
