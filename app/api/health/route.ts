import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/health — reports whether each required env var NAME is set.
// Never returns any secret value; only booleans, so it is safe to expose.
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'BASE_CURRENCY',
  'USD_IQD_RATE',
] as const;

const OPTIONAL = ['ANTHROPIC_API_KEY', 'OPENAI_MODEL'] as const;

export async function GET() {
  const isSet = (name: string) => Boolean(process.env[name] && process.env[name]!.length > 0);

  const env: Record<string, boolean> = {};
  for (const name of REQUIRED) env[name] = isSet(name);
  for (const name of OPTIONAL) env[name] = isSet(name);

  const missing = REQUIRED.filter((name) => !env[name]);

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    env,
    runtime: 'nodejs',
    time: new Date().toISOString(),
  });
}
