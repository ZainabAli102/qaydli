/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf (fontkit et al.) is loaded from node_modules at runtime, not
  // bundled, so its dynamic requires resolve correctly on the server.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The invoice PDF font files are read at runtime; make sure Vercel's file
  // tracer ships them with the PDF function.
  outputFileTracingIncludes: {
    '/api/invoices/[id]/pdf': ['./assets/fonts/**'],
  },
  // Service worker and manifest are served from /public; no build-time PWA plugin
  // is used so the config stays compatible with the App Router on Next 15.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
