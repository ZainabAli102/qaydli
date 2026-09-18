import { redirect } from 'next/navigation';

// The entry point sends people to the scan screen; the auth guard there (and in
// middleware) bounces signed-out users to /login and un-onboarded users to
// /onboarding. Kept as a server redirect so the first paint is decided early.
export default function Home() {
  redirect('/scan');
}
