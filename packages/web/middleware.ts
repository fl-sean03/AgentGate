import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Public routes that don't require auth
  const publicRoutes = ['/', '/pricing', '/login', '/signup', '/logout'];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith('/api/auth')
  );

  // API routes that don't require auth
  const publicApiRoutes = ['/api/auth', '/api/webhooks'];
  const isPublicApi = publicApiRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublicRoute || isPublicApi) {
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
