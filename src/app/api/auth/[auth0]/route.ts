// app/api/auth/[auth0]/route.ts
import { handleAuth } from '@auth0/nextjs-auth0';
import { NextRequest } from 'next/server';

export const GET = async (req: NextRequest) => {
  return handleAuth()(req);
};