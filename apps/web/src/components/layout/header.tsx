'use client';

import Link from 'next/link';
import { Search, Plus, Menu, User, Settings, LogOut, Scroll, Compass, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ThemeToggle } from './theme-toggle';

export const Header = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  const getUserInitials = () => {
    if (!user?.email) return 'U';
    return user.email.charAt(0).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        {/* Logo */}
        <Link href={user ? '/sheets' : '/'} className="flex items-center gap-2">
          <Flame className="h-7 w-7 text-primary" aria-hidden="true" />
          <span className="font-serif text-xl font-bold tracking-wide text-foreground">
            RPGForge <span className="text-primary">AI</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegação principal">
          <Link
            href="/sheets"
            className="group flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-primary"
          >
            <Scroll className="h-4 w-4 group-hover:text-primary" aria-hidden="true" />
            Minhas Fichas
          </Link>
          <Link
            href="/explore"
            className="group flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-primary"
          >
            <Compass className="h-4 w-4 group-hover:text-primary" aria-hidden="true" />
            Explorar
          </Link>
          <Link
            href="/create"
            className="group flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-primary"
          >
            <Plus className="h-4 w-4 group-hover:text-primary" aria-hidden="true" />
            Criar
          </Link>
        </nav>

        {/* Search Bar */}
        <div className="hidden flex-1 max-w-md lg:flex">
          <div className="relative w-full">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Buscar fichas, tags, classes…"
              className="w-full bg-secondary pl-10 placeholder:text-muted-foreground"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar fichas, tags, classes"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <ThemeToggle />

          {user ? (
            <>
              {/* Create Sheet Button (Desktop) */}
              <Button asChild className="hidden sm:flex hover:bg-primary/90" size="sm">
                <Link href="/create">
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Criar Ficha
                </Link>
              </Button>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-9 w-9 rounded-full"
                    aria-label="Menu do usuário"
                  >
                    <Avatar className="h-9 w-9 border border-border">
                      <AvatarImage src="" alt={user.email} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2">
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
          ) : (
            <>
              {/* Auth Buttons (Desktop) */}
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/auth/login">Entrar</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/auth/register">Criar conta</Link>
                </Button>
              </div>
            </>
          )}

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="flex flex-col gap-6 pt-6">
                {/* Mobile Search */}
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    placeholder="Buscar fichas, tags, classes…"
                    className="w-full bg-secondary pl-10"
                    aria-label="Buscar fichas"
                  />
                </div>

                {/* Mobile Navigation */}
                <nav className="flex flex-col gap-4" aria-label="Menu mobile">
                  <Link
                    href="/sheets"
                    className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary"
                  >
                    <Scroll className="h-5 w-5 group-hover:text-primary" aria-hidden="true" />
                    Minhas Fichas
                  </Link>
                  <Link
                    href="/explore"
                    className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary"
                  >
                    <Compass className="h-5 w-5 group-hover:text-primary" aria-hidden="true" />
                    Explorar
                  </Link>
                  <Link
                    href="/create"
                    className="group flex items-center gap-3 text-base font-medium text-foreground/80 hover:text-primary"
                  >
                    <Plus className="h-5 w-5 group-hover:text-primary" aria-hidden="true" />
                    Criar
                  </Link>
                </nav>

                {/* Mobile Create Button */}
                <Button asChild className="w-full hover:bg-primary/90">
                  <Link href="/create">
                    <Flame className="mr-2 h-4 w-4" aria-hidden="true" />
                    Forjar Nova Ficha
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
