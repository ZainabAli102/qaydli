import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on all routes except static assets, the service worker, and the API
  // (the API route does its own auth).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|api).*)',
  ],
};
