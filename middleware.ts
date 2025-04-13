// src/middleware.ts
import { getSession } from '@auth0/nextjs-auth0/edge';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const session = await getSession(req, res);

    if (!session || !session.user) {
      const loginUrl = new URL('/api/auth/login', req.url);

      return NextResponse.redirect(loginUrl);
    }
  }

  return res; }

export const config = {

  matcher: ['/api/((?!auth|_next/static|_next/image|favicon.ico).*)'],
};
