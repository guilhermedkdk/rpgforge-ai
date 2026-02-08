/** Rotas protegidas. Usado por middleware e api/client. */
export const PROTECTED_PATHS = ['/sheets'] as const;

export const isProtectedRoute = (pathname: string): boolean =>
  PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
