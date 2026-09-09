'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  sheetId: string;
  isFavorited: boolean;
  favoriteCount: number;
  /** Sits inside a card that is itself a link, so the click must not navigate. */
  className?: string;
}

/**
 * Bookmark toggle for a published sheet. A bookmark, not a heart: the card already spends a heart on
 * hit points and a star on level.
 *
 * State is local and reconciled by invalidation, so the click answers instantly. Anonymous visitors
 * get the button too, routed to login.
 */
export const FavoriteButton = ({
  sheetId,
  isFavorited,
  favoriteCount,
  className,
}: FavoriteButtonProps) => {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [favorited, setFavorited] = useState(isFavorited);
  const [count, setCount] = useState(favoriteCount);

  // A refetch (another page, another filter) is the source of truth again.
  useEffect(() => {
    setFavorited(isFavorited);
    setCount(favoriteCount);
  }, [isFavorited, favoriteCount]);

  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next ? characterSheetsApi.favorite(sheetId) : characterSheetsApi.unfavorite(sheetId),
    onSuccess: (result) => {
      setFavorited(result.isFavorited);
      setCount(result.favoriteCount);
      void queryClient.invalidateQueries({ queryKey: ['public-sheets'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => {
      // Put the optimistic flip back: a bookmark that silently did not stick is worse than none.
      setFavorited(isFavorited);
      setCount(favoriteCount);
      toast.error('Não foi possível salvar', {
        description: 'Tente novamente em alguns instantes.',
      });
    },
  });

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      router.push('/auth/login?redirect=/explore');
      return;
    }
    const next = !favorited;
    setFavorited(next);
    setCount((c) => Math.max(c + (next ? 1 : -1), 0));
    mutation.mutate(next);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={favorited}
      aria-label={favorited ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
      title={favorited ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        favorited
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-card/90 text-muted-foreground hover:border-primary/40 hover:text-foreground',
        className
      )}
    >
      <Bookmark className={cn('h-3.5 w-3.5', favorited && 'fill-current')} aria-hidden="true" />
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  );
};
