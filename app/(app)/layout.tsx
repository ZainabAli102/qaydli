import { redirect } from 'next/navigation';
import { getSessionContext } from '@/lib/session';

// Server-side auth guard for the whole authenticated app (replaces middleware).
// Builds the Supabase server client (via getSessionContext), validates the user
// with getUser(), and bounces signed-out visitors to /login. Session cookies are
// kept fresh by the browser Supabase client; the server client reads them here.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSessionContext();
  if (!user) redirect('/login');
  return <>{children}</>;
}
