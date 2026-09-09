import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isProtectedRoute } from '@/lib/route-config';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isProtectedRoute(pathname)) {
    // The refresh cookie, never the access one: the access cookie's Max-Age is the token's own 15
    // minutes, so the browser drops it mid-session and this gate would bounce a perfectly valid
    // session to the login screen before any client code could refresh it.
    const refreshToken = request.cookies.get('refreshToken')?.value;
    if (!refreshToken) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
