import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  generateEtags: false,
  async headers() {
    return [
      {
        // Every page and every answer.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // API answers can hold a login token or a person's details: never let a browser or proxy keep them.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
