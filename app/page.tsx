import { redirect } from 'next/navigation';

// The entry point sends people to the dashboard; the (app) route-group layout
// guards auth (bouncing signed-out users to /login) and the page guards bounce
// un-onboarded users to /onboarding. Kept as a server redirect so the first
// paint is decided early.
export default function Home() {
  redirect('/dashboard');
}
