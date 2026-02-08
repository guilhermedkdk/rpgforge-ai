'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  const handleToggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <Button variant="ghost" size="icon" onClick={handleToggleTheme} aria-label="Alternar tema">
      {/* Ícone do sol - visível apenas em dark mode (para alternar para light) */}
      <Sun className="h-4 w-4 hidden dark:block" aria-hidden="true" />
      {/* Ícone da lua - visível apenas em light mode (para alternar para dark) */}
      <Moon className="h-4 w-4 block dark:hidden" aria-hidden="true" />
    </Button>
  );
};
