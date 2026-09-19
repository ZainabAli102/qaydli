/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf (and pdfkit/fontkit under it) is loaded from node_modules at
  // runtime, not bundled, so its dynamic requires resolve correctly on the server.
  serverExternalPackages: ['@react-pdf/renderer', 'pdfkit'],
  // Font/data files are read at runtime; make sure Vercel's file tracer ships
  // them with the PDF function. pdfkit lazily requires its standard-font metrics
  // (e.g. Helvetica.cjs, *.afm) via a dynamic path the tracer can't follow, so
  // include them explicitly alongside our embedded Noto fonts.
  outputFileTracingIncludes: {
    '/api/invoices/[id]/pdf': [
      './assets/fonts/**',
      './node_modules/pdfkit/js/standard-fonts/**',
      './node_modules/pdfkit/js/data/**',
    ],
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
