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
      {/* Sun icon: visible only in dark mode (to switch to light) */}
      <Sun className="h-4 w-4 hidden dark:block" aria-hidden="true" />
      {/* Moon icon: visible only in light mode (to switch to dark) */}
      <Moon className="h-4 w-4 block dark:hidden" aria-hidden="true" />
    </Button>
  );
};
