import type { NextConfig } from 'next';

/**
 * Applied to every response.
 *
 * No `Content-Security-Policy` here on purpose: a real one needs a per-request nonce for Next's
 * inline bootstrap scripts, which belongs in middleware, not in a static header list. Shipping a
 * permissive CSP would read as protection while allowing exactly what CSP exists to stop.
 */
const SECURITY_HEADERS = [
  // The site is never meant to be framed; clickjacking has no legitimate use case here.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Belt and braces for the same thing, and the one browsers still honour in older versions.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin cross-site and the full path same-site: enough for our own analytics later,
  // without leaking a shared sheet's URL to whatever a visitor clicks through to.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here uses any of these, and a compromised third-party script should not be able to ask.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Cross-origin isolation for the document itself: a popup opened from here cannot reach back.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The default is already false; stating it keeps a future toggle from shipping the sources.
  productionBrowserSourceMaps: false,
  // The stack trace of a 500 belongs in the server log, never in the response body.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
