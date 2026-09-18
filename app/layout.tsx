import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LocaleProvider } from '@/components/LocaleProvider';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: 'Qaydli',
  description:
    'Photograph receipts and invoices; Qaydli extracts the data, checks the maths, and keeps your books in IQD with USD alongside.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Qaydli',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Qaydli',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default to English/LTR on the server; LocaleProvider adjusts <html> on the
  // client once the saved locale is known.
  return (
    <html lang="en" dir="ltr">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
