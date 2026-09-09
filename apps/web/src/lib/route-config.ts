/** Protected routes. Used by proxy and api/client. */
export const PROTECTED_PATHS = ['/sheets', '/settings', '/admin'] as const;

export const isProtectedRoute = (pathname: string): boolean =>
  PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
