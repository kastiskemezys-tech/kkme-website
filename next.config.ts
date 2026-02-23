import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for hydration scripts; unsafe-eval for Turbopack HMR in dev
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Inline styles are used extensively via style= props throughout the app
  "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
  // next/font/google self-hosts after build; include gstatic for dev and fallback
  "font-src 'self' fonts.gstatic.com",
  // All API calls go to /api/* (same origin); ENTSO-E kept for future server components
  "connect-src 'self' https://web-api.tp.entsoe.eu",
  // SVG data URI used for grain overlay in globals.css
  "img-src 'self' data:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactCompiler: true,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: CSP,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
