import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware: refresh the Supabase session cookie and guard routes.
// Kept deliberately minimal — the ONLY import besides next/server is
// @supabase/ssr, which is Edge-compatible. No Node-only modules (no fs, no
// sharp, no @supabase/supabase-js server client, no engine imports) may be
// pulled in here, or the Edge bundle fails to load at runtime.

const PUBLIC_PREFIXES = ['/login', '/auth'];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail soft: if Supabase isn't configured, never 500 — just pass through.
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
    if (!user && !isPublic) {
      const to = request.nextUrl.clone();
      to.pathname = '/login';
      return NextResponse.redirect(to);
    }
    return response;
  } catch {
    // A transient auth/network error must not take the whole site down.
    return response;
  }
}

export const config = {
  // Run on all routes except static assets, the service worker, and the API
  // (each API route does its own auth). Keeps the engine/Node code off Edge.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|api).*)',
  ],
};
