/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
